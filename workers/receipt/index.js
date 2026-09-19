function text(status, message) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return text(405, "method not allowed");
    }
    if (url.pathname !== "/receipt") {
      return text(404, "not found");
    }

    const token = url.searchParams.get("token") || "";
    if (!/^TKT-\d{4}$/.test(token)) {
      return text(400, "Query param token=TKT-0001 is required");
    }

    const object = await env.RECEIPTS.get(`receipts/${token}.svg`);
    if (!object) {
      return text(404, `receipt not found for ${token}`);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", "image/svg+xml; charset=utf-8");
    headers.set("cache-control", "private, no-store");
    headers.set("x-nexus-receipt", token);
    headers.set("x-nexus-storage", "r2");

    if (request.method === "HEAD") {
      return new Response(null, { headers });
    }
    return new Response(object.body, { headers });
  },
};
