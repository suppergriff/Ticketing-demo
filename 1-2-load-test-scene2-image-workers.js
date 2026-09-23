import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "https://ticket-01.griffhu.top").replace(/\/$/, "");
const TICKET_MAX = Number(__ENV.TICKET_MAX || 200);

export const options = {
  scenarios: {
    kv_dynamic_render: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 80),
      duration: __ENV.DURATION || "60s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

function pad(n) {
  return `TKT-${String(n).padStart(4, "0")}`;
}

export default function () {
  const token = pad(1 + Math.floor(Math.random() * TICKET_MAX));
  const res = http.get(`${BASE_URL}/ticket-dynamic?token=${token}`, {
    timeout: "10s",
    tags: { stage: "workers-kv" },
  });
  check(res, {
    "200 SVG credential": () => res.status === 200,
    "image/svg+xml": () => String(res.headers["Content-Type"] || "").includes("image/svg+xml"),
  });
  sleep(0.02);
}
