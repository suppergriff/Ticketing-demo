# NEXUS GATE — Ticketing Live Demo

Mock stadium ticketing stack for **Jackson Wang · MAGIC MAN** (Singapore National Stadium).

Current **v1.0** product path is a plain origin box office:

1. Event portal → buy tickets
2. Checkout → confirmation email (mock inbox)
3. Open e-ticket for the gate

Not affiliated with Jackson Wang, TEAM WANG, or any real box office.

```text
Fan browser ──► Express + SQLite origin
                  ├─ GET  /                 portal
                  ├─ POST /api/checkout     buy tickets
                  ├─ GET  /inbox.html       mock email
                  └─ GET  /ticket/*.jpg     e-ticket image
```

## Quick start

Requires Node 20+.

```bash
npm install
npm start                  # http://127.0.0.1:8787
```

This repo already includes a demo `.env`, `data/tickets.db`, and 200 ticket JPGs.

Optional re-seed:

```bash
npm run seed:fast          # 200 tickets
SEED_COUNT=10000 npm run seed
```

Walk the product path:

1. http://127.0.0.1:8787 — portal
2. [/event.html](public/event.html) — select section and pay
3. Mock inbox → **Open ticket**
4. [/ticket-view.html](public/ticket-view.html) — gate-ready e-ticket

## Environment

See [.env.example](.env.example).

| Variable | Role |
| --- | --- |
| `PORT` | Origin HTTP port (default `8787`) |
| `ORIGIN_FRAGILE=1` | Slower ticket I/O for stress demos |
| `SEED_COUNT` | Ticket rows / JPGs to generate |
| `BASE_URL` | Base URL for optional k6 scripts |

## Optional load tests

Requires [k6](https://k6.io/).

```bash
k6 run load-test-scene1-bot.js
k6 run load-test-scene2-stage1.js
```

## Deploy to EC2 (GitHub Actions)

Push to `main` (or **Actions → Deploy to EC2 → Run workflow**) SSHs into the instance, updates **`/opt/ticketing-demo`**, runs `npm ci`, and restarts **`ticketing-demo`**.

Nginx terminates HTTPS for `ticket-01.griffhu.top` and proxies to `127.0.0.1:8787`.

### One-time EC2 setup

```bash
# Amazon Linux 2023 example — production path used by Actions
sudo dnf install -y git nodejs npm nginx
sudo git clone https://github.com/suppergriff/Ticketing-demo.git /opt/ticketing-demo
cd /opt/ticketing-demo
sudo npm install
sudo cp deploy/ticketing-demo.service /etc/systemd/system/ticketing-demo.service
sudo systemctl daemon-reload
sudo systemctl enable --now ticketing-demo
# Point nginx :443/:80 → http://127.0.0.1:8787 (Certbot optional)
```

Disable any unused legacy unit so only one Node listens on 8787:

```bash
sudo systemctl disable --now ticketing.service 2>/dev/null || true
```

Open security group inbound **TCP 80/443** (and **22** for SSH / Actions).

### GitHub Secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Example |
| --- | --- |
| `EC2_HOST` | Public IP or DNS |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | Full private key PEM (including `BEGIN` / `END` lines) |
| `EC2_APP_DIR` | `/opt/ticketing-demo` (workflow default if unset) |
| `EC2_SERVICE_NAME` | `ticketing-demo` (workflow default if unset) |

Until the host/user/key secrets exist, the workflow fails fast on the “Require deploy secrets” step.

## Repo map

```text
├── server.js                      Express origin (checkout + ticket JPG)
├── seed.js                        SQLite + JPG generation
├── lib/                           Ticket SVG / JPG helpers
├── public/index.html              Event portal
├── public/event.html              Checkout
├── public/inbox.html              Mock confirmation email
├── public/ticket-view.html        Unified e-ticket view
├── public/order.html              Order confirmation
├── data/tickets.db                Seeded inventory
├── tickets/*.jpg                  Pre-generated e-tickets
├── deploy/ticketing-demo.service  Production systemd unit (/opt)
├── deploy/ticketing.service       Legacy home-dir unit (unused)
└── .github/workflows/             Deploy to EC2 on push to main
```
