export type SupportChunk = {
  id: string;
  text: string;
  metadata: Record<string, string>;
};

export const CHUNKS: SupportChunk[] = [
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
];
