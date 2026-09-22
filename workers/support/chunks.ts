export type SupportChunk = {
  id: string;
  text: string;
  metadata: Record<string, string>;
};

/**
 * Knowledge for Vectorize (bge-base-en-v1.5).
 * Portal demo facts (venue, presale, VIP, e-ticket email) stay in the first five chunks.
 * Extra chunks come from workers/KB/support-guide-Chunk.md, translated to English,
 * skipping or adapting sections that conflict with the live demo portal.
 */
export const CHUNKS: SupportChunk[] = [
  // --- Portal demo source of truth ---
  {
    id: "chunk-presale",
    text: "Presale for Jackson Wang Magic Man Singapore concert starts Sep 8, 10AM SGT. Presale code will be sent to registered fan club members via email. Public sale starts Oct 10, 12PM SGT. Queue system will open 30 mins before sale start time.\nOfficial ticket purchase page: https://ticket-01.griffhu.top/event.html",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "presale" },
  },
  {
    id: "chunk-vip",
    text: "VIP ticket for Jackson Wang Singapore show includes early entry, exclusive merch pack. This VIP package does NOT include artist meet & greet. General Admission is standing area. Standard seated ticket is fixed block seat.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "ticket-benefit" },
  },
  {
    id: "chunk-venue",
    text: "Professional cameras with detachable lenses are prohibited. Bags larger than A4 size cannot enter. Factory sealed water bottles allowed. Age restriction: 6+, under 12 must be accompanied by adult.",
    metadata: { venue: "Singapore National Stadium", category: "venue-rule" },
  },
  {
    id: "chunk-event-rule",
    text: "For Jackson Wang Magic Man Singapore show: No selfie sticks allowed. All items subject to security check at gate.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "event-rule" },
  },
  {
    id: "chunk-eticket",
    text: "E-ticket will be delivered to your registered email 72 hours before show date. Please check spam folder. Ticket will be sent to the email you used during checkout. If no ticket after 72h, contact support.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "e-ticket" },
  },

  // --- From support-guide (non-conflicting / adapted) ---
  {
    id: "chunk-guide-support-sla",
    text: "Ticket support hours: during the sales period 9:00–22:00 daily; on show day 8:00–24:00. After-sales tickets are accepted until 7 calendar days after the show. Official channels: NEXUSGATE portal support chat, human agent tickets, and official email. Response targets: general questions within 10 minutes; payment failures or entry blockers within 3 minutes; formal tickets closed within 24 hours. Agents must follow official policy only—no unofficial refund, exchange, or unlock promises.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "support-sla" },
  },
  {
    id: "chunk-guide-purchase-limit",
    text: "Strict purchase limit: each valid ID, each account, and each phone number may buy at most 2 tickets for this show. Over-limit orders are blocked. Tickets are real-name bound. At checkout the fan must enter a real, verifiable name and ID. False or wrong ID data can block entry, and there is no on-site fix for mismatched identity.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "purchase-limit" },
  },
  {
    id: "chunk-guide-payment",
    text: "Supported payments: Singapore local credit/debit cards, e-wallets, and compliant cross-border channels. Cash and offline bank transfers are not supported. Pay within 15 minutes after placing an order, or the system cancels the order and releases inventory. Common issues: (1) charged but order still unpaid—async delay; keep the receipt, open a ticket, status usually syncs in 1–10 minutes; (2) payment failed or page error—try another network or payment method and reorder; (3) duplicate charge—send screenshot and order ID; verified duplicates are refunded to the original method in 1–3 business days.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "payment" },
  },
  {
    id: "chunk-guide-order-query",
    text: "Fans can check purchase history, order status, seat info, and e-ticket progress in the official portal account order page. Order statuses: pending payment, paid, issuing, issued, expired, refunded. When verifying an order, support may only confirm phone number, order ID, and bound ID number—never ask for payment passwords, SMS codes, or login passwords.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "order-query" },
  },
  {
    id: "chunk-guide-entry",
    text: "Entry requires the fan’s original valid real-name ID and a live valid e-ticket for that account. Person, ID, and ticket must match. No proxy check-in, no ID screenshots, no expired IDs. Gate scanners check validity, loss, refund, and freeze status against the ticketing backend. After a successful scan the ticket is marked used and cannot be reused. Common blockers: name/ID mismatch voids the ticket with no on-site change; stale screenshots need a live ticket refresh; risk-frozen orders need a human ticket to verify and unfreeze if legitimate.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "entry" },
  },
  {
    id: "chunk-guide-refund",
    text: "Real-name tickets are scarce. After purchase there is no self-service reschedule, rename, or private transfer. Personal reasons (busy, travel change, wrong show or seat) are not eligible for refund. Refund tickets are only accepted for: official delay/cancel/change; backend duplicate charge or duplicate issue; sudden serious illness or emergency with valid proof after human review. Approved refunds return to the original payment method in 3–7 business days. Agents cannot rush or bypass review.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "refund" },
  },
  {
    id: "chunk-guide-account",
    text: "Before the ticket is issued, minor text typos may be fixed via a support ticket; core ID number or phone errors usually cannot. After issue, name, ID, and phone are locked with no backend edit path. Risk control may freeze buy/issue rights for rapid ordering, mass cancels, suspected scalping, odd logins, or payment retries. Legitimate fans can submit ID materials for review and unfreeze. Confirmed scalping or bulk hoarding accounts stay permanently banned.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "account" },
  },
  {
    id: "chunk-guide-fraud",
    text: "Official channels never authorize individuals, third-party shops, or social platforms to resell or proxy-buy tickets. Private or secondary-market deals are unprotected and may be fake, void, or multi-sold. Support only handles orders placed on official channels and will not mediate private disputes. Do not trust markup tickets, insider tickets, or green-channel offers—those are scam patterns.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "fraud" },
  },
  {
    id: "chunk-guide-faq",
    text: "FAQ: One e-ticket is for one person only—no sharing. Prefer the live e-ticket over static screenshots, which may fail verification. Personal reasons do not allow refund, seat change, or rename—only official special cases after review. Wrong ID after issue cannot be fixed on site if person/ID/ticket mismatch. Private transfers or resales are banned; transferred tickets will not pass gate checks and the order is void.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "faq" },
  },
  {
    id: "chunk-guide-escalation",
    text: "General questions: frontline support answers from standard policy and closes the case. System issues (charged but no ticket, missing order, false risk freeze, backend errors): collect phone, order ID, payment screenshot, and description, then open an IT ops ticket. Show-day entry emergencies use a priority green channel. Large-scale outages (mass issue or payment failure): frontline logs cases and escalates to the architecture team for one official announcement—agents must not invent explanations or promises.",
    metadata: { event_id: "jackson-sg-2026", city: "Singapore", category: "escalation" },
  },
];
