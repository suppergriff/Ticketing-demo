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

Push to `main` (or run **Actions → Deploy to EC2 → Run workflow**) SSHs into your instance, pulls latest `main`, runs `npm ci`, and restarts systemd unit `ticketing`.

### One-time EC2 setup

```bash
# On the instance (Amazon Linux 2023 example)
sudo dnf install -y git nodejs npm
git clone https://github.com/suppergriff/Ticketing-demo.git ~/Ticketing-demo
cd ~/Ticketing-demo
npm install
sudo cp deploy/ticketing.service /etc/systemd/system/ticketing.service
# Edit User/WorkingDirectory/EnvironmentFile if your path/user differs
sudo systemctl daemon-reload
sudo systemctl enable --now ticketing
```

Open security group inbound **TCP 80** (and **22** for SSH). Ensure the Actions runner can reach port 22.

### GitHub Secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Example |
| --- | --- |
| `EC2_HOST` | Public IP or DNS |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | Full private key PEM (including `BEGIN` / `END` lines) |
| `EC2_APP_DIR` | Optional, default `$HOME/Ticketing-demo` |
| `EC2_SERVICE_NAME` | Optional, default `ticketing` |

Until these secrets exist, the workflow fails fast on the “Require deploy secrets” step.

## Repo map

```text
├── server.js                 Express origin (checkout + ticket JPG)
├── seed.js                   SQLite + JPG generation
├── lib/                      Ticket SVG / JPG helpers
├── public/index.html         Event portal
├── public/event.html         Checkout
├── public/inbox.html         Mock confirmation email
├── public/ticket-view.html   Unified e-ticket view
├── public/order.html         Order confirmation
├── data/tickets.db           Seeded inventory
├── tickets/*.jpg             Pre-generated e-tickets
├── deploy/ticketing.service  systemd unit for EC2
└── .github/workflows/        Deploy to EC2 on push to main
```
