import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const EVENT = {
  name: "王嘉尔 Jackson Wang | MAGIC MAN World Tour",
  name_zh: "王嘉尔 | MAGIC MAN 世界巡回演唱会",
  name_en: "Jackson Wang | MAGIC MAN World Tour",
  venue: "Singapore National Stadium · 新加坡国家体育场",
  date: "2026.10.15  20:00 SGT",
};

export function ticketPath(token, rootDir) {
  return path.join(rootDir, "tickets", `${token}.jpg`);
}

export function openDatabase(dbFile, { fragile = false } = {}) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma(`journal_mode = ${fragile ? "DELETE" : "WAL"}`);
  db.pragma(`synchronous = ${fragile ? "FULL" : "NORMAL"}`);
  db.pragma(`busy_timeout = ${fragile ? 0 : 5000}`);
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      token TEXT PRIMARY KEY,
      email TEXT,
      holder_name TEXT NOT NULL,
      event_name TEXT NOT NULL,
      venue TEXT NOT NULL,
      event_date TEXT NOT NULL,
      section TEXT NOT NULL,
      row TEXT NOT NULL,
      seat TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      email TEXT NOT NULL,
      session_id TEXT,
      fingerprint TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  `);
}

export function ticketToJson(row) {
  if (!row) return null;
  return {
    token: row.token,
    email: row.email,
    holder_name: row.holder_name,
    event_name: row.event_name,
    venue: row.venue,
    event_date: row.event_date,
    section: row.section,
    row: row.row,
    seat: row.seat,
    status: row.status,
  };
}
