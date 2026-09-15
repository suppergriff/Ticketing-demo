import { generateTicketSVG } from "../lib/ticket-svg.js";

function jsonError(status, error, message) {
  return Response.json({ error, message }, { status });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
        },
      });
    }

    if (url.pathname !== "/ticket-dynamic") {
      return jsonError(404, "not_found", "Worker only serves /ticket-dynamic");
    }

    const token = url.searchParams.get("token") || "";
    if (!/^TKT-\d{4}$/.test(token)) {
      return jsonError(400, "bad_token", "Query param token=TKT-0001 is required");
    }

    const record = await env.TICKETS_KV.get(token, "json");
    if (!record) {
      return jsonError(404, "kv_miss", `TICKETS_KV has no key ${token}`);
    }

    const svg = generateTicketSVG(record);
    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
        "x-nexus-stage": "3",
        "x-nexus-storage": "workers-kv",
      },
    });
  },
};
