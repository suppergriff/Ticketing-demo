import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "https://ticket-01.griffhu.top").replace(/\/$/, "");
const TICKET_MAX = Number(__ENV.TICKET_MAX || 200);

export const options = {
  scenarios: {
    checkin_avalanche: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5s", target: Number(__ENV.VUS || 80) },
        { duration: __ENV.DURATION || "60s", target: Number(__ENV.VUS || 80) },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate>0.05"],
  },
};

function pad(n) {
  return `TKT-${String(n).padStart(4, "0")}`;
}

export default function () {
  const token = pad(1 + Math.floor(Math.random() * TICKET_MAX));
  const res = http.get(`${BASE_URL}/ticket/${token}.jpg`, {
    timeout: "3s",
    tags: { stage: "origin-jpg" },
  });
  check(res, {
    "origin stressed (slow, 5xx, or timeout)": () =>
      res.status >= 500 || res.status === 0 || res.timings.duration > 800,
  });
  sleep(0.02);
}
