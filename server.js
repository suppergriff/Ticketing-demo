import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { EVENT, migrate, openDatabase, ticketPath, ticketToJson } from "./lib/db.js";
import { generateTicketSVG, ticketToKvRecord } from "./lib/ticket-svg.js";
import { reencodeTicketJpeg } from "./lib/ticket-jpg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const FRAGILE = String(process.env.ORIGIN_FRAGILE || "1") !== "0";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 3000);
/** CPU burn per /api/checkout (ms), via 2 child processes. 0 = off. Demo default when fragile. */
const CHECKOUT_BURN_MS = Number(
  process.env.CHECKOUT_BURN_MS ?? (FRAGILE ? 200 : 0),
);
/**
 * Only one full hybrid burn per this window (ms). Backlog after a burn returns 503
 * without spawning — so CPU drops as soon as k6 stops instead of draining for minutes.
 */
const BURN_SLOT_MS = Number(process.env.BURN_SLOT_MS ?? CHECKOUT_BURN_MS || 800);
/** V1 IP rate limit per 10s window. 0 = disabled (needed for single-host k6). */
const IP_RATE_LIMIT = Number(process.env.IP_RATE_LIMIT ?? 8);
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
const TURNSTILE_SECRET_KEY =
  process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || "https://r2-tickets.yourdomain.com").replace(
  /\/$/,
  "",
);

const db = openDatabase(path.join(ROOT, "data", "tickets.db"), { fragile: FRAGILE });
migrate(db);

const selectTicket = db.prepare("SELECT * FROM tickets WHERE token = ?");
const selectAvailable = db.prepare(
  `SELECT * FROM tickets WHERE status = 'available' AND (? IS NULL OR section = ?) ORDER BY token LIMIT 1`,
);
const markSold = db.prepare(
  `UPDATE tickets SET status = 'sold', email = ?, holder_name = ? WHERE token = ? AND status = 'available'`,
);
const insertOrder = db.prepare(
  `INSERT INTO orders (token, email, session_id, fingerprint, created_at) VALUES (?, ?, ?, ?, ?)`,
);
const countTickets = db.prepare("SELECT COUNT(*) AS n FROM tickets");
const checkoutTxn = db.transaction((email, holderName, section, sessionId, fingerprint) => {
  const row = selectAvailable.get(section || null, section || null);
  if (!row) return null;
  const info = markSold.run(email, holderName, row.token);
  if (info.changes !== 1) return null;
  insertOrder.run(row.token, email, sessionId, fingerprint, new Date().toISOString());
  return selectTicket.get(row.token);
});

const ipHits = new Map();
const fingerprintHits = new Map();
let fragileChain = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let burnSlotsUsed = 0;
let burnWindowStart = 0;

/** At most one full burn per BURN_SLOT_MS; excess callers should shed without burning. */
function tryAcquireBurnSlot() {
  if (!CHECKOUT_BURN_MS) return true;
  const now = Date.now();
  if (now - burnWindowStart >= BURN_SLOT_MS) {
    burnWindowStart = now;
    burnSlotsUsed = 0;
  }
  if (burnSlotsUsed >= 1) return false;
  burnSlotsUsed += 1;
  return true;
}

/**
 * Hybrid burn: spawn 2 node -e loops (peg both cores for mpstat) then sync-busy
 * the main thread so the event loop starves — legitimate clients slow/timeout under k6.
 */
async function burnCpu(ms) {
  if (!ms || ms <= 0) return;
  const script = `const e=Date.now()+${Number(ms)};let x=0;while(Date.now()<e)x^=Math.imul(x+1,2654435761)`;
  const children = [];
  const one = () =>
    new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ["-e", script], { stdio: "ignore" });
      children.push(p);
      p.on("exit", resolve);
      p.on("error", reject);
    });
  try {
    // Start children first so they run while the main thread blocks.
    const kids = Promise.all([one(), one()]);
    const end = Date.now() + ms;
    let x = 0;
    while (Date.now() < end) {
      x ^= Math.imul(x + 1, 2654435761);
    }
    await kids;
  } finally {
    for (const p of children) {
      if (p.exitCode === null && !p.killed) p.kill("SIGKILL");
    }
  }
}

function exclusiveFragile(work) {
  if (!FRAGILE) return work();
  const run = fragileChain.then(work, work);
  fragileChain = run.catch(() => {});
  return run;
}

function clientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function slidingLimited(store, key, { windowMs, limit }) {
  const now = Date.now();
  const prev = store.get(key) || [];
  const next = prev.filter((ts) => now - ts < windowMs);
  next.push(now);
  store.set(key, next);
  return next.length > limit;
}

/** V1 naked origin: naive per-IP limit — residential proxies rotate IPs and waltz through. */
function ipRateLimited(ip) {
  return slidingLimited(ipHits, ip || "unknown", {
    windowMs: 10_000,
    limit: IP_RATE_LIMIT,
  });
}

/** V2 edge simulation: session / device fingerprint (Custom Key), not source IP. */
function fingerprintRateLimited(fingerprint) {
  return slidingLimited(fingerprintHits, fingerprint || "anon", { windowMs: 10_000, limit: 12 });
}

async function verifyTurnstile(token, ip) {
  if (!token) return { ok: false, reason: "missing_token" };
  const dummySecret = TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA";
  if (dummySecret && String(token).length < 80) {
    return { ok: false, reason: "invalid_token" };
  }
  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: ip,
  });
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    return { ok: Boolean(data.success), reason: data["error-codes"]?.[0] || "rejected", data };
  } catch {
    return { ok: false, reason: "siteverify_unreachable" };
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.set("X-Nexus-Origin", FRAGILE ? "fragile" : "stable");
  next();
});
app.use(express.static(path.join(ROOT, "public"), { index: "index.html" }));

app.get("/api/health", (_req, res) => {
  const n = countTickets.get().n;
  res.json({
    ok: true,
    fragile: FRAGILE,
    tickets: n,
    port: PORT,
    checkoutBurnMs: CHECKOUT_BURN_MS,
    ipRateLimit: IP_RATE_LIMIT,
  });
});

app.get("/api/config", (_req, res) => {
  const placeholder = /yourdomain\.com/i.test(R2_PUBLIC_BASE_URL);
  res.json({
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    r2PublicBaseUrl: R2_PUBLIC_BASE_URL,
    r2ClickUrl: placeholder ? "" : R2_PUBLIC_BASE_URL,
    localR2Mock: true,
    event: EVENT,
    fragile: FRAGILE,
    scene1: {
      v1: { path: "/event.html", api: "/api/checkout", turnstile: false },
      v2: { path: "/event-secure.html", api: "/api/checkout-secure", turnstile: true },
    },
  });
});

function parseCheckoutBody(req) {
  return {
    email: String(req.body.email || "").trim().toLowerCase(),
    holderName: String(req.body.holder_name || req.body.holderName || "Fan").trim(),
    section: String(req.body.section || "").trim() || null,
    turnstileToken:
      req.body["cf-turnstile-response"] ||
      req.body.turnstileToken ||
      req.headers["cf-turnstile-response"],
    sessionId: String(req.headers["x-ticket-session"] || ""),
    fingerprint: String(
      req.headers["x-device-fingerprint"] ||
        req.headers["x-ticket-session"] ||
        clientIp(req),
    ),
    ip: clientIp(req),
  };
}

function finalizeCheckout(res, sold, email) {
  const inboxUrl = `/inbox.html?token=${encodeURIComponent(sold.token)}&email=${encodeURIComponent(email)}`;
  return res.json({
    ok: true,
    token: sold.token,
    inboxUrl,
    orderUrl: `/order.html?token=${encodeURIComponent(sold.token)}&email=${encodeURIComponent(email)}`,
    ticket: ticketToJson(sold),
  });
}

function runCheckoutTxn(res, { email, holderName, section, sessionId, fingerprint }) {
  try {
    const sold = checkoutTxn(email, holderName, section, sessionId, fingerprint);
    if (!sold) {
      return res.status(409).json({ error: "sold_out", message: "No inventory remaining" });
    }
    return finalizeCheckout(res, sold, email);
  } catch (err) {
    if (String(err.message || err).includes("busy")) {
      return res.status(504).json({ error: "origin_timeout", message: "SQLite disk lock" });
    }
    console.error(err);
    return res.status(500).json({ error: "checkout_failed" });
  }
}

/**
 * Scene 1 · V1 — naked origin.
 * No Turnstile. Only a naive per-IP limiter that residential proxies defeat by rotating IPs.
 */
app.post("/api/checkout", async (req, res) => {
  const body = parseCheckoutBody(req);
  res.set("X-Nexus-Checkout", "v1-naked");

  if (IP_RATE_LIMIT > 0 && ipRateLimited(body.ip)) {
    return res.status(429).json({
      error: "ip_rate_limited",
      message: "V1 origin IP throttle. Rotating residential proxies bypass this easily.",
    });
  }

  if (!body.email || !body.email.includes("@")) {
    return res.status(400).json({ error: "invalid_email" });
  }

  // One burn per slot; event-loop backlog sheds fast so CPU cools when k6 stops.
  if (!tryAcquireBurnSlot()) {
    return res.status(503).json({
      error: "origin_overloaded",
      message: "Stage 1 origin collapse: CPU burn backlog shed",
    });
  }

  // Burn before DB so sold-out (409) requests still spike CPU under k6.
  await burnCpu(CHECKOUT_BURN_MS);

  return runCheckoutTxn(res, body);
});

/**
 * Scene 1 · V2 — Cloudflare-hardened lane (origin-side simulation of edge challenge).
 * Requires Turnstile token + fingerprint/session custom-key rate limit.
 */
app.post("/api/checkout-secure", async (req, res) => {
  const body = parseCheckoutBody(req);
  res.set("X-Nexus-Checkout", "v2-turnstile");

  if (fingerprintRateLimited(body.fingerprint)) {
    return res.status(429).json({
      error: "rate_limited",
      message:
        "Advanced Rate Limiting custom key (session / device / JA4). Action: Managed Challenge.",
    });
  }

  if (!body.email || !body.email.includes("@")) {
    return res.status(400).json({ error: "invalid_email" });
  }

  const challenge = await verifyTurnstile(body.turnstileToken, body.ip);
  if (!challenge.ok) {
    return res.status(403).json({
      error: "challenge_failed",
      reason: challenge.reason,
      message:
        "HTTP 403 Challenge Target — headless clients cannot mint a Turnstile token (missing WASM/DOM).",
    });
  }

  return runCheckoutTxn(res, body);
});

app.get("/ticket/:file", async (req, res) => {
  const file = req.params.file;
  const token = file.replace(/\.jpe?g$/i, "");
  if (!/^TKT-\d{4}$/.test(token)) {
    return res.status(400).type("text/plain").send("invalid token");
  }

  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({
        error: "origin_timeout",
        message: "Stage 1 origin collapse: SQLite lock + disk I/O + CPU re-encode",
      });
    }
  }, REQUEST_TIMEOUT_MS);
  res.on("finish", () => clearTimeout(timer));

  try {
    await exclusiveFragile(async () => {
      if (res.headersSent) return;
      const row = selectTicket.get(token);
      if (!row) {
        clearTimeout(timer);
        res.status(404).type("text/plain").send("ticket not found");
        return;
      }
      if (FRAGILE) {
        await sleep(120 + Math.floor(Math.random() * 140));
      }
      const raw = await fs.readFile(ticketPath(token, ROOT));
      const jpeg = FRAGILE ? await reencodeTicketJpeg(raw) : raw;
      if (res.headersSent) return;
      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Cache-Status": "ORIGIN-MISS",
        "X-Nexus-Stage": "1",
      });
      res.send(jpeg);
    });
  } catch (err) {
    if (res.headersSent) return;
    if (err.code === "ENOENT") {
      return res.status(404).type("text/plain").send("jpg missing — run npm run seed");
    }
    if (String(err.message || err).includes("busy") || err.code === "SQLITE_BUSY") {
      return res.status(504).json({ error: "sqlite_busy" });
    }
    console.error(err);
    return res.status(500).type("text/plain").send("origin error");
  } finally {
    clearTimeout(timer);
  }
});

app.get("/r2-mock/ticket/:file", async (req, res) => {
  const token = String(req.params.file || "").replace(/\.jpe?g$/i, "");
  if (!/^TKT-\d{4}$/.test(token)) {
    return res.status(400).type("text/plain").send("invalid token");
  }
  const row = selectTicket.get(token);
  if (!row) return res.status(404).type("text/plain").send("ticket not found");
  try {
    const jpeg = await fs.readFile(ticketPath(token, ROOT));
    res.set({
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Nexus-Stage": "2-local-mock",
      "X-Cache-Status": "R2-EDGE",
      "X-R2-Egress": "0",
    });
    res.send(jpeg);
  } catch {
    res.status(404).type("text/plain").send("jpg missing — run npm run seed");
  }
});

app.get("/ticket-dynamic", (req, res) => {
  const token = String(req.query.token || "");
  if (!/^TKT-\d{4}$/.test(token)) {
    return res.status(400).type("text/plain").send("token required");
  }
  const row = selectTicket.get(token);
  if (!row) return res.status(404).type("text/plain").send("ticket not found");
  const svg = generateTicketSVG(ticketToKvRecord(row));
  res.set({
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=60",
    "X-Nexus-Stage": "3-local-fallback",
  });
  res.send(svg);
});

app.use((req, res) => {
  res.status(404).type("text/plain").send(`not found: ${req.path}`);
});

const server = app.listen(PORT, () => {
  console.log(`NEXUS origin listening on http://127.0.0.1:${PORT}`);
  console.log(
    `fragile=${FRAGILE} timeout=${REQUEST_TIMEOUT_MS}ms checkoutBurn=${CHECKOUT_BURN_MS}ms ipLimit=${IP_RATE_LIMIT} tickets=${countTickets.get().n}`,
  );
});
server.timeout = Math.max(REQUEST_TIMEOUT_MS + 500, 4000);
server.requestTimeout = Math.max(REQUEST_TIMEOUT_MS + 1000, 5000);
