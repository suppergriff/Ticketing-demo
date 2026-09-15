import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const R2_BASE = (__ENV.R2_PUBLIC_BASE_URL || `${BASE_URL}/r2-mock`).replace(/\/$/, "");
const TICKET_MAX = Number(__ENV.TICKET_MAX || 200);

export const options = {
  scenarios: {
    r2_edge_fetch: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || "20s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<500"],
  },
};

function pad(n) {
  return `TKT-${String(n).padStart(4, "0")}`;
}

export default function () {
  const token = pad(1 + Math.floor(Math.random() * TICKET_MAX));
  const res = http.get(`${R2_BASE}/ticket/${token}.jpg`, {
    timeout: "10s",
    tags: { stage: "r2" },
  });
  check(res, {
    "200 from edge object store": () => res.status === 200,
    "not an origin miss": () => res.headers["X-Cache-Status"] !== "ORIGIN-MISS",
  });
  sleep(0.02);
}
