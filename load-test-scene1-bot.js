import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

/**
 * Scene 1 · V1 naked origin.
 * Rotating residential IPs beat the naive per-IP throttle. No Turnstile → bots get 200.
 */
const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const botWins = new Rate("bot_checkout_ok");

export const options = {
  scenarios: {
    residential_proxy_pool_v1: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 30),
      duration: __ENV.DURATION || "15s",
    },
  },
  thresholds: {
    bot_checkout_ok: ["rate>0.70"],
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
    `${BASE_URL}/api/checkout`,
    JSON.stringify({
      email: `bot-${__VU}-${__ITER}@proxy-pool.test`,
      holder_name: "Residential Bot",
      section: "A",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        "CF-Connecting-IP": ip,
      },
      timeout: "10s",
    },
  );

  const ok = res.status === 200 || res.status === 409;
  botWins.add(res.status === 200);
  check(res, {
    "V1 naked origin does not require Turnstile": () => res.status !== 403,
    "bot purchase or sold-out (not challenge)": () => ok,
  });
  sleep(0.05);
}
