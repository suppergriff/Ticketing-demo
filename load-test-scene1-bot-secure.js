import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

/**
 * Scene 1 · V2 Turnstile lane.
 * Same residential proxy pool, no Turnstile token → 403 Challenge Target.
 */
const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const blocked = new Rate("challenge_or_deny");

export const options = {
  scenarios: {
    residential_proxy_pool_v2: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 40),
      duration: __ENV.DURATION || "20s",
    },
  },
  thresholds: {
    challenge_or_deny: ["rate>0.95"],
    http_req_failed: ["rate>0.90"],
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
  const res = http.post(
    `${BASE_URL}/api/checkout-secure`,
    JSON.stringify({
      email: `bot-${__VU}@proxy-pool.test`,
      holder_name: "Residential Bot",
      section: "A",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        "CF-Connecting-IP": ip,
        "X-Ticket-Session": `bot-session-${__VU}-${__ITER}`,
        "X-Device-Fingerprint": `ja4-less-client-${__VU}`,
      },
      timeout: "10s",
    },
  );

  const denied = res.status === 403 || res.status === 429;
  blocked.add(denied);
  check(res, {
    "edge or origin rejected bot (403/429)": () => denied,
    "no Turnstile token accepted": () => res.status !== 200,
  });
  sleep(0.05);
}
