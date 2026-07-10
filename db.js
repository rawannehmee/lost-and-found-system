// db.js - database layer

const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const db = new DatabaseSync(path.join(__dirname, "lostfound.db"));

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT    NOT NULL CHECK (type IN ('lost', 'found')),
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    category     TEXT    NOT NULL CHECK (category IN
                   ('electronics','clothing','documents','keys','bags','jewelry','books','other')),
    location     TEXT    NOT NULL,
    date         TEXT    NOT NULL,             -- date lost/found, YYYY-MM-DD
    status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    contact_name TEXT    NOT NULL,
    contact_info TEXT    NOT NULL,             -- email or phone
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed data (inserted only when the table is empty)

const count = db.prepare("SELECT COUNT(*) AS n FROM items").get().n;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO items (type, title, description, category, location, date, status, contact_name, contact_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seed = [
    ["lost",  "AirPods Pro (2nd gen)", "White case, small scratch on the lid. Lost after the 11am lecture.", "electronics", "Liberal Arts Building, Room 205", "2026-07-02", "open", "Sara A.", "sara.a@auk.edu.kw"],
    ["found", "Silver house keys", "Bundle of 3 keys on a blue carabiner, found near the fountain.", "keys", "Main Courtyard", "2026-07-03", "open", "Campus Security", "security@auk.edu.kw"],
    ["lost",  "Black North Face backpack", "Contains a linear algebra textbook and a grey water bottle.", "bags", "Library, 2nd floor study area", "2026-07-01", "open", "Yousef K.", "+965 5555 1234"],
    ["found", "Civil ID card", "Found on the cafeteria floor. Held at the front desk for pickup.", "documents", "Cafeteria", "2026-07-04", "open", "Front Desk", "frontdesk@auk.edu.kw"],
    ["found", "Casio FX-991 calculator", "Name sticker partially removed. Found after the CPEG445 quiz.", "electronics", "Engineering Building, Room 110", "2026-06-30", "resolved", "Dr. Hassan", "hassan@auk.edu.kw"],
    ["lost",  "Gold bracelet", "Thin gold chain bracelet with a small heart charm. Sentimental value.", "jewelry", "Gym locker room", "2026-07-05", "open", "Noura M.", "noura.m@auk.edu.kw"]
  ];
  for (const row of seed) insert.run(...row);
}


// Query helpers used by the REST API


/** List items with optional filters: type, category, status, q (text search). */
function listItems({ type, category, status, q } = {}) {
  const clauses = [];
  const params = [];
  if (type)     { clauses.push("type = ?");     params.push(type); }
  if (category) { clauses.push("category = ?"); params.push(category); }
  if (status)   { clauses.push("status = ?");   params.push(status); }
  if (q) {
    clauses.push("(title LIKE ? OR description LIKE ? OR location LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM items ${where} ORDER BY created_at DESC, id DESC`).all(...params);
}

function getItem(id) {
  return db.prepare("SELECT * FROM items WHERE id = ?").get(id);
}

function createItem(item) {
  const result = db.prepare(`
    INSERT INTO items (type, title, description, category, location, date, contact_name, contact_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.type, item.title, item.description ?? "", item.category,
    item.location, item.date, item.contact_name, item.contact_info
  );
  return getItem(result.lastInsertRowid);
}

function updateItem(id, fields) {
  const allowed = ["type", "title", "description", "category", "location",
                   "date", "status", "contact_name", "contact_info"];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return getItem(id);
  params.push(id);
  db.prepare(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return getItem(id);
}

function deleteItem(id) {
  return db.prepare("DELETE FROM items WHERE id = ?").run(id).changes > 0;
}

module.exports = { listItems, getItem, createItem, updateItem, deleteItem };
