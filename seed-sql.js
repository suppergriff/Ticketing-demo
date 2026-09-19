import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT, migrate, openDatabase } from "./lib/db.js";
import { padToken } from "./lib/ticket-svg.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SEED_COUNT = Math.max(1, Number(process.env.SEED_COUNT || 10000));

const FIRST_NAMES = [
  "Alex", "Sam", "Riley", "Jordan", "Kai", "Morgan", "Quinn", "Avery",
  "Noah", "Lina", "Chen", "Maya", "Hugo", "Ivy", "Owen", "Zara",
];
const LAST_NAMES = [
  "Tan", "Lim", "Ng", "Wong", "Lee", "Park", "Sato", "Reyes",
  "Silva", "Khan", "Berg", "Nair", "Costa", "Okafor", "Petrov", "Cruz",
];
const SECTIONS = ["A", "B", "C", "D", "E", "F", "GA", "VIP"];

function holderName(i) {
  return `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;
}

function seatFor(i) {
  return {
    section: SECTIONS[i % SECTIONS.length],
    row: String((i % 30) + 1).padStart(2, "0"),
    seat: String((i % 24) + 1).padStart(2, "0"),
  };
}

function buildTicket(i) {
  const token = padToken(i);
  const seat = seatFor(i);
  return {
    token,
    email: "",
    holder_name: holderName(i),
    event_name: EVENT.name,
    venue: EVENT.venue,
    event_date: EVENT.date,
    section: seat.section,
    row: seat.row,
    seat: seat.seat,
    status: "available",
    created_at: new Date().toISOString(),
  };
}

function main() {
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  const db = openDatabase(path.join(ROOT, "data", "tickets.db"), { fragile: false });
  migrate(db);
  db.exec("DELETE FROM orders");
  db.exec("DELETE FROM tickets");

  const tickets = Array.from({ length: SEED_COUNT }, (_, i) => buildTicket(i + 1));
  const insert = db.prepare(`
    INSERT INTO tickets (token, email, holder_name, event_name, venue, event_date, section, row, seat, status, created_at)
    VALUES (@token, @email, @holder_name, @event_name, @venue, @event_date, @section, @row, @seat, @status, @created_at)
  `);
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(tickets);
  db.close();
  console.log(`SQLite wrote ${tickets.length} tickets → data/tickets.db`);
}

main();
