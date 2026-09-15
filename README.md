# NEXUS GATE — Cloudflare Ticketing Live Demo

Interview-grade live demo of a stadium ticketing stack. Two **independent commercial scenes**, each shown as an **architecture evolution**:

1. **On-sale anti-scalper** — **V1 naked origin** (no Turnstile) → **V2** Turnstile + Advanced Rate Limiting custom keys.
2. **Gates-open credential avalanche** — origin collapse → Cloudflare R2 → Workers + KV dynamic render.

This is a **mock** ticketing stack for architecture storytelling. Not affiliated with Jackson Wang, TEAM WANG, or any real box office.

```text
Fan / bot ──► (optional) Cloudflare Edge ──► Express + SQLite
                │
                ├─ Scene 1 V1: POST /api/checkout          (no Turnstile — bots win)
                ├─ Scene 1 V2: POST /api/checkout-secure   (Turnstile + fingerprint key — 403)
                ├─ Scene 2 S1: GET  /ticket/*.jpg          (origin 504)
                ├─ Scene 2 S2: R2 custom domain            (0 origin, 0 egress $)
                └─ Scene 2 S3: /ticket-dynamic             (Worker + KV, <15ms)
```

## Quick start (local, no Cloudflare account)

Requires Node 20+ and (optional) [k6](https://k6.io/).

```bash
cp .env.example .env
npm install
npm run seed:fast          # 200 tickets + JPGs, enough for the 5-minute talk
npm start                  # http://127.0.0.1:8787
```

Full 10,000-row seed (slower, heavier disk):

```bash
SEED_COUNT=10000 npm run seed
```

Walk the product path:

1. http://127.0.0.1:8787 — portal
2. **Scene 1 V1** [/event.html](public/event.html) — naked checkout, no Turnstile widget
3. **Scene 1 V2** [/event-secure.html](public/event-secure.html) — Turnstile silent lane
4. Mock inbox → three credential buttons (Scene 2)
5. Stage 1 `/ticket/TKT-0001.jpg` · Stage 2 `/r2-mock/...` · Stage 3 `/ticket-dynamic?token=TKT-0001`

Prove the contrast with curl:

```bash
# V1 naked — expected HTTP 200 (bot wins)
curl -sS -D - -o /dev/stderr -X POST http://127.0.0.1:8787/api/checkout \
  -H 'content-type: application/json' \
  -H 'X-Forwarded-For: 203.0.113.50' \
  -d '{"email":"bot@pool.test","holder_name":"Bot","section":"A"}'

# V2 secured — expected HTTP 403 (no Turnstile token)
curl -sS -D - -o /dev/stderr -X POST http://127.0.0.1:8787/api/checkout-secure \
  -H 'content-type: application/json' \
  -d '{"email":"bot@pool.test","holder_name":"Bot","section":"A"}'
```

Official dummy Turnstile **secret** always returns success from siteverify. Origin therefore also rejects missing/short tokens on `/api/checkout-secure` so k6 still gets 403 without a real widget JWT.

Re-seed between heavy bot runs if inventory is empty: `npm run seed:fast`.

## 5-minute SOP storyboard

| Time | What you show | What you say |
| --- | --- | --- |
| 0:00 | [public/index.html](public/index.html) | “Two pages we get paged for: the drop, and the gate. Scene 1 starts as the customer’s **first version** — a naked origin.” |
| 0:25 | [public/event.html](public/event.html) | “No Turnstile script. No Managed Challenge. Just Node + a naive per-IP throttle.” |
| 0:50 | k6 `load-test-scene1-bot.js` | Rotating `X-Forwarded-For` / residential IPs. **HTTP 200**. “IP rate limits die against proxy pools.” |
| 1:20 | [public/event-secure.html](public/event-secure.html) + Network | Same UX, invisible Turnstile. Headers `X-Ticket-Session` / `X-Device-Fingerprint`. Fans still get in without a puzzle. |
| 1:45 | k6 `load-test-scene1-bot-secure.js` | Same bots, no token → **403 Challenge Target**. |
| 2:05 | Dashboard → WAF | Advanced Rate Limiting on `POST /api/checkout-secure` (or the live path). Custom key = session / device / JA4. Action = **Managed Challenge**. |
| 2:30 | [public/inbox.html](public/inbox.html) | “Doors in 30 minutes. Every phone opens this mail.” |
| 2:45 | Stage 1 + k6 stage 1 | Origin `no-store`, SQLite lock, 504 avalanche. |
| 3:25 | Stage 2 R2 | Zero egress, no LRU eviction, origin = 0. |
| 4:00 | Stage 3 Worker + KV | No pre-generated JPG. p95 &lt; 15ms on the edge. |
| 4:35 | Tables below | Close on “evolve the architecture in public, don’t jump straight to the end state.” |

### Dashboard checklist (Cloudflare Live)

1. **Turnstile** — Widget on V2 only → copy site/secret into `.env`. Appearance `interaction-only`.
2. **Orange-cloud the origin** (or `cloudflared tunnel`).
3. **WAF Advanced Rate Limiting** on the secured checkout path
   - Expression: `(http.request.uri.path eq "/api/checkout-secure" and http.request.method eq "POST")`
   - Characteristics: `http.request.headers["x-ticket-session"]` (or device fingerprint / JA4)
   - Action: Managed Challenge
4. **R2** — bucket + custom domain; `R2_UPLOAD=1` + `npm run seed`
5. **KV** + Worker route for `/ticket-dynamic*`

### k6 commands

```bash
k6 run load-test-scene1-bot.js              # V1: bots succeed
k6 run load-test-scene1-bot-secure.js       # V2: bots get 403
ORIGIN_FRAGILE=1 k6 run -e TICKET_MAX=200 load-test-scene2-stage1.js
k6 run -e R2_PUBLIC_BASE_URL=http://127.0.0.1:8787/r2-mock load-test-scene2-stage2.js
k6 run load-test-scene2-stage3.js
```

## Architecture comparison

### Scene 1 — on-sale lane

| | V1 Naked origin | V2 Turnstile + ARL |
| --- | --- | --- |
| Page | `/event.html` | `/event-secure.html` |
| API | `POST /api/checkout` | `POST /api/checkout-secure` |
| Turnstile | None | Required (Managed Challenge) |
| Rate key | Source IP (weak) | Session / device / JA4 |
| Residential proxy pool | **Wins (200)** | **Blocked (403)** |
| Fan UX | Plain form | Silent / interaction-only |

### Scene 2 — credential retrieval

| | Stage 1 Origin JPG | Stage 2 R2 | Stage 3 Workers + KV |
| --- | --- | --- | --- |
| What the email hits | `/ticket/TKT-1000.jpg` | `https://r2-tickets.yourdomain.com/ticket/TKT-1000.jpg` | `/ticket-dynamic?token=TKT-1000` |
| Where bytes live | Laptop disk + SQLite | Edge object store | KV metadata + memory SVG |
| LRU eviction | Yes (CDN cold) | No | N/A |
| Origin load at doors | 100% (then 504) | 0 | 0 |
| Pre-generate 10k JPG | Required | Required | None |
| Egress bill | Origin / CDN | **Zero egress** | Worker CPU, tiny |
| p95 | Seconds / timeout | Edge RTT | **&lt; 15ms** (edge) |
| Compliance story | Weak | Frozen artifact, audit-friendly | Computed credential, rotate in KV |

Local Stage 2 uses `/r2-mock` so the inbox still clicks when `R2_PUBLIC_BASE_URL` is the placeholder. The visible email hostname stays the production R2 URL.

## Environment

See [.env.example](.env.example).

| Variable | Role |
| --- | --- |
| `ORIGIN_FRAGILE=1` | Serialize ticket I/O, `no-store`, 3s 504 — Scene 2 Stage 1 disaster |
| `TURNSTILE_*` | Used only by V2 `/api/checkout-secure` |
| `R2_PUBLIC_BASE_URL` | Stage 2 hostname printed in the mock email |
| `R2_UPLOAD=1` + API tokens | Seed pushes `ticket/TKT-xxxx.jpg` via S3 API |
| `SEED_COUNT` | `200` for rehearsal, `10000` for the full bowl |

## Repo map

```text
├── server.js                      V1 /api/checkout + V2 /api/checkout-secure + fragile JPG
├── seed.js                        SQLite + JPG + KV JSON + optional R2
├── lib/ticket-svg.js              Shared SVG + QR (Worker-safe)
├── lib/ticket-jpg.js              qrcode + sharp → 800×400 JPG (no node-canvas)
├── workers/                       Scene 2 Stage 3 Worker + wrangler.jsonc
├── public/event.html              Scene 1 V1 naked drop
├── public/event-secure.html       Scene 1 V2 Turnstile drop
├── public/inbox.html              Scene 2 mock mail + three stages
└── load-test-scene1-bot*.js       V1 bots win / V2 bots die
```
