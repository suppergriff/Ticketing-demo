import { encode } from "uqr";

const EVENT_NAME = "王嘉尔 Jackson Wang | MAGIC MAN World Tour";

export function padToken(n) {
  return `TKT-${String(n).padStart(4, "0")}`;
}

export function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function qrMatrix(payload) {
  const encoded = encode(payload, { ecc: "M", border: 1 });
  const size = encoded.size;
  const data = encoded.data;
  const cells = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const bit = Array.isArray(data[y]) ? data[y][x] : data[y * size + x];
      if (bit) cells.push({ x, y });
    }
  }
  return { size, cells };
}

function qrSvgGroup(payload, x, y, box = 118) {
  const { size, cells } = qrMatrix(payload);
  const cell = box / size;
  const dots = cells
    .map(
      (c) =>
        `<rect x="${(c.x * cell).toFixed(2)}" y="${(c.y * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#061014"/>`,
    )
    .join("");
  return `<g transform="translate(${x} ${y})">
    <rect x="-6" y="-6" width="${box + 12}" height="${box + 12}" rx="8" fill="#e8fff8"/>
    <rect x="-2" y="-2" width="${box + 4}" height="${box + 4}" rx="5" fill="none" stroke="#3dffef" stroke-width="1.2"/>
    ${dots}
  </g>`;
}

export function generateTicketSVG(ticket) {
  const token = escapeXml(ticket.token);
  const holder = escapeXml(ticket.holder_name || "GUEST");
  const eventName = escapeXml(ticket.event_name || EVENT_NAME);
  const venue = escapeXml(ticket.venue || "Singapore National Stadium · 新加坡国家体育场");
  const eventDate = escapeXml(ticket.event_date || "2026.10.15  20:00 SGT");
  const section = escapeXml(ticket.section || "A");
  const row = escapeXml(ticket.row || "12");
  const seat = escapeXml(ticket.seat || "08");
  const qrPayload = ticket.qr_payload || `NEXUS|${ticket.token}|${ticket.section}-${ticket.row}-${ticket.seat}`;
  const titlePrimary = escapeXml(ticket.event_title || "王嘉尔  Jackson Wang");
  const titleSecondary = escapeXml(ticket.event_subtitle || "MAGIC MAN World Tour · 世界巡回演唱会");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400" role="img" aria-label="${eventName} ticket ${token}">
  <defs>
    <linearGradient id="void" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#05060a"/>
      <stop offset="55%" stop-color="#0b1020"/>
      <stop offset="100%" stop-color="#16071a"/>
    </linearGradient>
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3dffef"/>
      <stop offset="45%" stop-color="#7aa7ff"/>
      <stop offset="100%" stop-color="#ff2bd6"/>
    </linearGradient>
    <linearGradient id="foil" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff2bd6" stop-opacity="0.18"/>
      <stop offset="50%" stop-color="#3dffef" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#ffb020" stop-opacity="0.16"/>
    </linearGradient>
    <pattern id="scan" width="800" height="4" patternUnits="userSpaceOnUse">
      <rect width="800" height="2" fill="#ffffff" opacity="0.035"/>
    </pattern>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="#3dffef" stroke-opacity="0.06" stroke-width="1"/>
    </pattern>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="800" height="400" rx="22" fill="url(#void)"/>
  <rect width="800" height="400" rx="22" fill="url(#foil)"/>
  <rect width="800" height="400" rx="22" fill="url(#grid)"/>
  <rect x="10" y="10" width="780" height="380" rx="16" fill="none" stroke="url(#holo)" stroke-width="2.2"/>
  <rect x="18" y="18" width="764" height="364" rx="12" fill="none" stroke="#3dffef" stroke-opacity="0.25"/>
  <rect width="800" height="400" rx="22" fill="url(#scan)"/>

  <polygon points="0,78 62,0 0,0" fill="#3dffef" opacity="0.9"/>
  <polygon points="800,322 738,400 800,400" fill="#ff2bd6" opacity="0.9"/>

  <text x="36" y="54" font-family="ui-monospace, 'IBM Plex Mono', monospace" font-size="11" letter-spacing="3.4" fill="#3dffef">NEXUS GATE  ·  CREDENTIAL STRIP  ·  EDGE ISSUED</text>
  <text x="36" y="96" font-family="'Noto Sans SC', 'PingFang SC', sans-serif" font-size="26" font-weight="700" fill="#f4fbff" filter="url(#glow)">${titlePrimary}</text>
  <text x="36" y="124" font-family="Oxanium, 'Arial Narrow', sans-serif" font-size="16" font-weight="700" fill="url(#holo)">${titleSecondary}</text>
  <text x="36" y="148" font-family="ui-monospace, 'IBM Plex Mono', monospace" font-size="11" letter-spacing="1.2" fill="#9aa7b8">${venue}</text>
  <text x="36" y="168" font-family="ui-monospace, 'IBM Plex Mono', monospace" font-size="12" fill="#ffb020">${eventDate}</text>

  <g transform="translate(36 198)">
    <rect width="96" height="64" rx="8" fill="#081018" stroke="#3dffef" stroke-opacity="0.45"/>
    <text x="10" y="18" font-family="ui-monospace, monospace" font-size="9" letter-spacing="2" fill="#7f8b9a">SECTION</text>
    <text x="10" y="46" font-family="Oxanium, sans-serif" font-size="26" font-weight="700" fill="#3dffef">${section}</text>
  </g>
  <g transform="translate(144 198)">
    <rect width="96" height="64" rx="8" fill="#081018" stroke="#ff2bd6" stroke-opacity="0.45"/>
    <text x="10" y="18" font-family="ui-monospace, monospace" font-size="9" letter-spacing="2" fill="#7f8b9a">ROW</text>
    <text x="10" y="46" font-family="Oxanium, sans-serif" font-size="26" font-weight="700" fill="#ff2bd6">${row}</text>
  </g>
  <g transform="translate(252 198)">
    <rect width="96" height="64" rx="8" fill="#081018" stroke="#ffb020" stroke-opacity="0.45"/>
    <text x="10" y="18" font-family="ui-monospace, monospace" font-size="9" letter-spacing="2" fill="#7f8b9a">SEAT</text>
    <text x="10" y="46" font-family="Oxanium, sans-serif" font-size="26" font-weight="700" fill="#ffb020">${seat}</text>
  </g>

  <text x="36" y="298" font-family="ui-monospace, monospace" font-size="10" letter-spacing="2.4" fill="#7f8b9a">ADMIT ONE  ·  HOLDER</text>
  <text x="36" y="324" font-family="Oxanium, sans-serif" font-size="20" font-weight="600" fill="#f4fbff">${holder}</text>
  <text x="36" y="352" font-family="ui-monospace, monospace" font-size="18" letter-spacing="3" fill="url(#holo)">${token}</text>
  <text x="36" y="372" font-family="ui-monospace, monospace" font-size="9" letter-spacing="1.8" fill="#5d6b7a">NEXUS GATE CREDENTIAL  ·  LIVE DEMO ARTIFACT</text>

  ${
    ticket.qrImageHref
      ? `<image href="${escapeXml(ticket.qrImageHref)}" x="634" y="208" width="130" height="130"/>`
      : qrSvgGroup(qrPayload, 640, 214, 118)
  }
  <text x="634" y="360" font-family="ui-monospace, monospace" font-size="9" letter-spacing="1.6" fill="#3dffef">SCAN AT GATE</text>
</svg>`;
}

export function ticketToKvRecord(ticket) {
  return {
    token: ticket.token,
    holder_name: ticket.holder_name,
    event_name: ticket.event_name,
    venue: ticket.venue,
    event_date: ticket.event_date,
    section: ticket.section,
    row: ticket.row,
    seat: ticket.seat,
    email: ticket.email || "",
    qr_payload: `NEXUS|${ticket.token}|${ticket.section}-${ticket.row}-${ticket.seat}`,
  };
}
