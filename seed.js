import "dotenv/config";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { EVENT, migrate, openDatabase, ticketPath } from "./lib/db.js";
import { generateTicketJPG } from "./lib/ticket-jpg.js";
import { padToken, ticketToKvRecord } from "./lib/ticket-svg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SEED_COUNT = Math.max(1, Number(process.env.SEED_COUNT || 10000));
const CONCURRENCY = Math.max(1, Number(process.env.SEED_CONCURRENCY || 6));
const FORCE = String(process.env.FORCE_REGENERATE || "0") === "1";
const R2_UPLOAD = String(process.env.R2_UPLOAD || "0") === "1";

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

async function mapPool(items, limit, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx;
      idx += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
}

async function maybeUploadR2(tickets) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || "tickets-bucket";
  if (!R2_UPLOAD) {
    console.log("R2 upload skipped (set R2_UPLOAD=1 plus API tokens to enable).");
    return;
  }
  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.log("R2 credentials missing — skip upload.");
    return;
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  console.log(`Uploading ${tickets.length} objects to R2 bucket ${bucket}...`);
  await mapPool(tickets, 8, async (ticket) => {
    const body = await fsp.readFile(ticketPath(ticket.token, ROOT));
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `ticket/${ticket.token}.jpg`,
        Body: body,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  });
  console.log("R2 upload complete.");
}

async function main() {
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "tickets"), { recursive: true });

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

  let generated = 0;
  let skipped = 0;
  await mapPool(tickets, CONCURRENCY, async (ticket) => {
    const out = ticketPath(ticket.token, ROOT);
    if (!FORCE && fs.existsSync(out)) {
      skipped += 1;
      return;
    }
    await generateTicketJPG(ticket, out);
    generated += 1;
    if ((generated + skipped) % 50 === 0) {
      console.log(`JPG progress ${generated + skipped}/${tickets.length}`);
    }
  });
  console.log(`JPG done: generated=${generated} skipped=${skipped}`);

  const kvBulk = tickets.map((ticket) => ({
    key: ticket.token,
    value: JSON.stringify(ticketToKvRecord(ticket)),
  }));
  const kvFile = path.join(ROOT, "data", "kv-bulk.json");
  await fsp.writeFile(kvFile, JSON.stringify(kvBulk));
  console.log(`KV bulk export → ${kvFile} (${kvBulk.length} keys)`);
  console.log("Import with: npm run kv:put   (requires wrangler + TICKETS_KV id)");

  await maybeUploadR2(tickets);
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
