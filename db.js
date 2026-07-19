// db.js - database layer, now on RDS MySQL instead of the local SQLite file

require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,   // DATE columns come back as "YYYY-MM-DD" strings like before
});

// Schema and seed data

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      type         ENUM('lost','found') NOT NULL,
      title        VARCHAR(80)  NOT NULL,
      description  TEXT         NOT NULL,
      category     ENUM('electronics','clothing','documents','keys','bags',
                        'jewelry','books','other') NOT NULL,
      location     VARCHAR(120) NOT NULL,
      date         DATE         NOT NULL,
      status       ENUM('open','resolved') NOT NULL DEFAULT 'open',
      contact_name VARCHAR(60)  NOT NULL,
      contact_info VARCHAR(80)  NOT NULL,
      photo_key    VARCHAR(255) NULL,              -- S3 object key
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM items");
  if (n === 0) {
    const seed = [
      ["lost",  "AirPods Pro (2nd gen)", "White case, small scratch on the lid. Lost after the 11am lecture.", "electronics", "Liberal Arts Building, Room 205", "2026-07-02", "open", "Sara A.", "sara.a@auk.edu.kw"],
      ["found", "Silver house keys", "Bundle of 3 keys on a blue carabiner, found near the fountain.", "keys", "Main Courtyard", "2026-07-03", "open", "Campus Security", "security@auk.edu.kw"],
      ["lost",  "Black North Face backpack", "Contains a linear algebra textbook and a grey water bottle.", "bags", "Library, 2nd floor study area", "2026-07-01", "open", "Yousef K.", "+965 5555 1234"],
      ["found", "Civil ID card", "Found on the cafeteria floor. Held at the front desk for pickup.", "documents", "Cafeteria", "2026-07-04", "open", "Front Desk", "frontdesk@auk.edu.kw"],
      ["found", "Casio FX-991 calculator", "Name sticker partially removed. Found after the CPEG445 quiz.", "electronics", "Engineering Building, Room 110", "2026-06-30", "resolved", "Dr. Hassan", "hassan@auk.edu.kw"],
      ["lost",  "Gold bracelet", "Thin gold chain bracelet with a small heart charm. Sentimental value.", "jewelry", "Gym locker room", "2026-07-05", "open", "Noura M.", "noura.m@auk.edu.kw"],
    ];
    for (const row of seed) {
      await pool.query(
        `INSERT INTO items (type, title, description, category, location, \`date\`, status, contact_name, contact_info)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, row);
    }
  }
}

// Query helpers used by the REST API

/** List items with optional filters: type, category, status, q (text search). */
async function listItems({ type, category, status, q } = {}) {
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
  const [rows] = await pool.query(
    `SELECT * FROM items ${where} ORDER BY id DESC`, params);
  return rows;
}

async function getItem(id) {
  const [rows] = await pool.query("SELECT * FROM items WHERE id = ?", [id]);
  return rows[0] || null;
}

async function createItem(fields) {
  const [result] = await pool.query(
    `INSERT INTO items (type, title, description, category, location, \`date\`, status, contact_name, contact_info, photo_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.type,
      fields.title,
      fields.description ?? "",
      fields.category,
      fields.location,
      fields.date,
      fields.status ?? "open",
      fields.contact_name,
      fields.contact_info,
      fields.photo_key ?? null,
    ]);
  return getItem(result.insertId);
}

async function updateItem(id, fields) {
  const allowed = ["type", "title", "description", "category", "location",
                   "date", "status", "contact_name", "contact_info", "photo_key"];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`\`${key}\` = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return getItem(id);
  params.push(id);
  await pool.query(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`, params);
  return getItem(id);
}

async function deleteItem(id) {
  const [result] = await pool.query("DELETE FROM items WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = { init, listItems, getItem, createItem, updateItem, deleteItem };
