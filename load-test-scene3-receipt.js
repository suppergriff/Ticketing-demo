import http from "k6/http";
import { check, sleep } from "k6";

// Receipts are served by the ticketing-receipt Worker, not the local origin.
//   k6 run load-test-scene3-receipt.js
//   BASE_URL=https://ticket-01.griffhu.top k6 run load-test-scene3-receipt.js
const BASE_URL = (__ENV.BASE_URL || "https://ticket-01.griffhu.top").replace(/\/$/, "");
const TOKEN = __ENV.TOKEN || "TKT-0001";

export const options = {
  scenarios: {
    r2_receipt: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 100),
      duration: __ENV.DURATION || "20s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/receipt?token=${encodeURIComponent(TOKEN)}&t=${Date.now()}`, {
    timeout: "10s",
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    tags: { stage: "r2-receipt" },
  });
  check(res, {
    "200 receipt": (r) => r.status === 200,
    "image/svg+xml": (r) => String(r.headers["Content-Type"] || "").includes("image/svg+xml"),
    "stored in r2": (r) =>
      String(r.headers["X-Nexus-Storage"] || r.headers["x-nexus-storage"] || "") === "r2",
  });
  sleep(0.02);
}
