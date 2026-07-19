// server.js - Express backend
// Run with: npm start, then open http://localhost:3000 (or the EC2 public IP)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");
const s3 = require("./s3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());                                   // allow cross-origin API calls
app.use(express.json());                           // parse JSON request bodies
app.use(express.static(path.join(__dirname, "public"))); // serve front-end (Tier 1)

// Validation helpers

const TYPES = ["lost", "found"];
const CATEGORIES = ["electronics", "clothing", "documents", "keys", "bags", "jewelry", "books", "other"];
const STATUSES = ["open", "resolved"];

/** Validate a payload. If partial=true (PUT), only validate the fields present. */
function validate(body, { partial = false } = {}) {
  const errors = [];
  const check = (field, ok, message) => {
    if (body[field] === undefined) {
      if (!partial) errors.push(`'${field}' is required`);
    } else if (!ok(body[field])) {
      errors.push(message);
    }
  };
  const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

  // Checks the string is YYYY-MM-DD and is a date that actually exists
  // (JavaScript would otherwise turn 2026-02-30 into March 2nd)
  function isRealDate(v) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }

  check("type",         (v) => TYPES.includes(v),       `'type' must be one of: ${TYPES.join(", ")}`);
  check("title",        nonEmpty,                       "'title' must be a non-empty string");
  check("category",     (v) => CATEGORIES.includes(v),  `'category' must be one of: ${CATEGORIES.join(", ")}`);
  check("location",     nonEmpty,                       "'location' must be a non-empty string");
  check("date",         isRealDate,                    "'date' must be a valid date in YYYY-MM-DD format");
  check("contact_name", nonEmpty,                       "'contact_name' must be a non-empty string");
  check("contact_info", nonEmpty,                       "'contact_info' must be a non-empty string");
  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    errors.push(`'status' must be one of: ${STATUSES.join(", ")}`);
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    errors.push("'description' must be a string");
  }
  // photo_key: null removes the photo, otherwise it must be a key we issued
  if (body.photo_key !== undefined && body.photo_key !== null && !s3.isValidKey(body.photo_key)) {
    errors.push("'photo_key' must be a key returned by POST /api/uploads, or null");
  }
  return errors;
}

/** Parse and validate the :id route parameter. */
function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Item id must be a positive integer" });
    return null;
  }
  return id;
}

/** Add a pre-signed photo_url to an item (null if no photo). */
async function withPhotoUrl(item) {
  return {
    ...item,
    photo_url: item.photo_key && s3.isConfigured()
      ? await s3.presignDownload(item.photo_key)
      : null,
  };
}

// so async errors reach the error middleware instead of hanging
const asyncRoute = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// REST API (Web Services layer)

// POST /api/uploads - pre-signed S3 upload URL for one photo.
// The browser PUTs the file to the URL, then sends the key as photo_key.
app.post("/api/uploads", asyncRoute(async (req, res) => {
  if (!s3.isConfigured()) {
    return res.status(503).json({ error: "Photo storage (S3) is not configured on this server" });
  }
  const contentType = (req.body || {}).content_type;
  if (!s3.isValidContentType(contentType)) {
    return res.status(400).json({
      error: `'content_type' must be one of: ${Object.keys(s3.CONTENT_TYPES).join(", ")}`,
    });
  }
  res.status(201).json(await s3.presignUpload(contentType));
}));

// GET /api/items - list items, filters: ?type= &category= &status= &q=
app.get("/api/items", asyncRoute(async (req, res) => {
  const { type, category, status, q } = req.query;
  if (type && !TYPES.includes(type))
    return res.status(400).json({ error: `'type' must be one of: ${TYPES.join(", ")}` });
  if (category && !CATEGORIES.includes(category))
    return res.status(400).json({ error: `'category' must be one of: ${CATEGORIES.join(", ")}` });
  if (status && !STATUSES.includes(status))
    return res.status(400).json({ error: `'status' must be one of: ${STATUSES.join(", ")}` });
  const items = await db.listItems({ type, category, status, q });
  res.json(await Promise.all(items.map(withPhotoUrl)));
}));

// GET /api/items/:id - get one item
app.get("/api/items/:id", asyncRoute(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const item = await db.getItem(id);
  if (!item) return res.status(404).json({ error: `Item ${id} not found` });
  res.json(await withPhotoUrl(item));
}));

// POST /api/items - create a new item
app.post("/api/items", asyncRoute(async (req, res) => {
  const body = req.body || {};
  const errors = validate(body);
  if (errors.length) return res.status(400).json({ errors });
  const item = await db.createItem(body);
  res.status(201).location(`/api/items/${item.id}`).json(await withPhotoUrl(item));
}));

// PUT /api/items/:id - update an item (can send only some fields)
app.put("/api/items/:id", asyncRoute(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const existing = await db.getItem(id);
  if (!existing) return res.status(404).json({ error: `Item ${id} not found` });
  const body = req.body || {};
  const errors = validate(body, { partial: true });
  if (errors.length) return res.status(400).json({ errors });
  const item = await db.updateItem(id, body);
  // photo replaced or removed -> delete the old object
  if (body.photo_key !== undefined && existing.photo_key && existing.photo_key !== body.photo_key && s3.isConfigured()) {
    await s3.deleteObject(existing.photo_key);
  }
  res.json(await withPhotoUrl(item));
}));

// DELETE /api/items/:id - delete an item (and its photo in S3, if any)
app.delete("/api/items/:id", asyncRoute(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const existing = await db.getItem(id);
  if (!existing) return res.status(404).json({ error: `Item ${id} not found` });
  await db.deleteItem(id);
  if (existing.photo_key && s3.isConfigured()) await s3.deleteObject(existing.photo_key);
  res.status(204).end();
}));

// Unknown API routes should return JSON 404, not the HTML page
app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint not found" }));

// If the request body is not valid JSON, reply with a JSON error instead of
// the default HTML error page
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "Request body is not valid JSON" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Campus Lost & Found running on port ${PORT}`);
      console.log(`  DB:  ${process.env.DB_HOST || "(DB_HOST not set)"}`);
      console.log(`  S3:  ${process.env.S3_BUCKET || "(S3_BUCKET not set - photos disabled)"}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err.message);
    process.exit(1);
  });
