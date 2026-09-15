import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

/**
 * Scene 1 · checkout CPU stress (optimized)
 * - Moderate VUs so requests actually reach Node burnCpu
 * - Longer timeout so k6 waits for the single-threaded burn
 * Pair with server: CHECKOUT_BURN_MS=800 (or higher), IP_RATE_LIMIT=0
 *
 * Run:
 *   k6 run load-test-checkout-cpu.js
 *   # or override:
 *   BASE_URL=https://ticket-01.griffhu.top k6 run load-test-checkout-cpu.js
 */
const serverErrors = new Rate("server_5xx_errors");

const BASE_URL = (__ENV.BASE_URL || "https://ticket-01.griffhu.top").replace(/\/$/, "");

export const options = {
  scenarios: {
    scalper_rush_cpu: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "15s", target: 40 },
        { duration: "45s", target: 80 },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    // Demo-oriented: expect some pressure; tune after you measure
    server_5xx_errors: ["rate<0.20"],
    http_req_duration: ["p(95)<30000"],
  },
};

function spoofIp() {
  return `${randomInt(11, 220)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function () {
  const ip = spoofIp();
  const randomUserId = Math.floor(Math.random() * 100000);

  const res = http.post(
    `${BASE_URL}/api/checkout`,
    JSON.stringify({
      email: `bot-${__VU}-${__ITER}-${randomUserId}@proxy-pool.test`,
      holder_name: `Scalper-${randomUserId}`,
      section: "A",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        "CF-Connecting-IP": ip,
      },
      timeout: "30s",
    },
  );

  const isServerDown = res.status >= 500 || res.status === 0;
  serverErrors.add(isServerDown);

  check(res, {
    "server alive (status < 500)": () => !isServerDown,
    "valid business resp (200/409)": (r) => r.status === 200 || r.status === 409,
  });
}