import { CHUNKS } from "./chunks";

declare global {
  interface Env {
    SEED_TOKEN?: string;
  }
}

const EVENT_ID = "jackson-sg-2026";
const VENUE = "Singapore National Stadium";
const TICKET_URL = "https://your-nexusgate.com/jackson-sg";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_TURNS = 3;
const MATCH_THRESHOLD = 0.45;
const GATEWAY_ID = "default";

const UPSET_REPLY = "I notice you are upset, transferring you to human agent.";
const HUMAN_REPLY =
  "You have been transferred to a human agent. What specific question would you like to ask?";
const FALLBACK_REPLY = "Sorry, support is unavailable right now. Please try again.";

const SYSTEM_PROMPT = `You are NEXUSGATE ticket support assistant.
Rules:
1. ONLY use retrieved context chunks. If no info found: "Sorry, I don't have that information, I will transfer you to human agent." Never invent facts.
2. Reply in English only.
3. Use order info when available.
4. Only output the ticket purchase link when retrieved context contains the URL, and ONLY when the user asks about presale, sale time, or buying tickets.
Do NOT show the ticket link for venue rules, baggage policy, or e-ticket delivery questions.
When showing the ticket link, add: "Click the link below to visit the ticket page."
Format the link as plain text. The frontend will render it as a clickable hyperlink.
5. Keep answers concise for concert fans.
6. If a retrieved chunk answers the question, use it. Do not say the information is missing.
7. Never say an e-ticket email is late or overdue. If order info says it has not been sent, say it is scheduled for 72 hours before the show and tell the fan to check spam.`;

const ALLOW_ORIGINS = new Set([
  "https://ticket-01.griffhu.top",
  "http://127.0.0.1:8787",
  "http://localhost:8787",
]);

type Role = "user" | "assistant";
type Turn = { role: Role; content: string };
type Match = { id: string; score: number; text: string };
type GatewayStep = "embed" | "sentiment" | "answer" | "seed";

function aiGateway(step: GatewayStep, sessionId?: string) {
  return {
    gateway: {
      id: GATEWAY_ID,
      collectLog: true,
      metadata: sessionId ? { step, sessionId } : { step },
    },
  };
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && ALLOW_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Seed-Token");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function json(request: Request, body: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function isVenue(text: string): boolean {
  return /\b(cameras?|lenses?|bags?|backpacks?|water|bottles?|selfie|stadium|prohibited)\b/i.test(text);
}

function isPresale(text: string): boolean {
  return /\b(presale|pre-sale|public sale|on sale|sale start|queue|presale code)\b/i.test(text);
}

function asksToBuy(text: string): boolean {
  return isPresale(text) || /\b(buy tickets?|buying tickets?|purchase tickets?|where can i buy)\b/i.test(text);
}

function isBenefit(text: string): boolean {
  return /\b(vip|meet\s*&?\s*greet|meet the artist|general admission|seated|benefits?)\b/i.test(text);
}

function isEticket(text: string): boolean {
  return /\b(e-?tickets?|inbox|spam|haven'?t received|have not received|ticket email|email)\b/i.test(text);
}

// Replace mockOrder() with a real order API later. Do not fetch the ticketing origin from this Worker.
function mockOrder(): string {
  return [
    "Order NG-SG-20481 is confirmed.",
    "Event: Jackson Wang Magic Man, Singapore National Stadium, Oct 15 2026, 20:00 SGT.",
    "Section B, Row 12, Seat 8.",
    "Checkout email: fan@example.com.",
    "The e-ticket email has not been sent yet. It is scheduled 72 hours before the show.",
  ].join("\n");
}

async function embed(env: Env, text: string, step: "embed" | "seed", sessionId?: string): Promise<number[]> {
  const result = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [text] }, aiGateway(step, sessionId));
  const data = result.data;
  const vector = data?.[0];
  if (!vector) throw new Error("embedding_empty");
  return vector;
}

async function search(
  env: Env,
  vector: number[],
  filter: VectorizeVectorMetadataFilter,
  topK: number,
): Promise<Match[]> {
  const result = await env.SUPPORT_INDEX.query(vector, {
    topK,
    filter,
    returnMetadata: "all",
  });
  return (result.matches ?? [])
    .map((match) => ({
      id: match.id,
      score: match.score,
      text: typeof match.metadata?.text === "string" ? match.metadata.text : "",
    }))
    .filter((match) => match.text);
}

function dedupe(matches: Match[]): Match[] {
  const seen = new Set<string>();
  const kept: Match[] = [];
  for (const match of matches) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    kept.push(match);
  }
  return kept;
}

async function retrieve(env: Env, message: string, sessionId: string): Promise<Match[]> {
  const vector = await embed(env, message, "embed", sessionId);
  if (isVenue(message)) {
    // Chunk 3 has no event_id, so a single event filter cannot return the venue rule.
    const eventRule = await search(env, vector, { event_id: EVENT_ID, category: "event-rule" }, 1);
    const venueRule = await search(env, vector, { venue: VENUE }, 1);
    return dedupe([...eventRule, ...venueRule]);
  }
  // topK 2. Filter is fixed for this Singapore demo.
  // Production: set event_id / city from the event page.
  const filter: VectorizeVectorMetadataFilter = { event_id: EVENT_ID };
  if (isPresale(message)) filter.category = "presale";
  else if (isBenefit(message)) filter.category = "ticket-benefit";
  else if (isEticket(message)) filter.category = "e-ticket";
  return search(env, vector, filter, 2);
}

function negativeScore(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const label = "label" in row ? String(row.label).toUpperCase() : "";
    if (label === "NEGATIVE" && "score" in row) return Number(row.score) || 0;
  }
  return 0;
}

const ANGER = /\b(angry|anger|upset|furious|terrible|hate|awful|worst|ridiculous|scam|disgusting|annoyed|mad)\b/i;

async function isUpset(env: Env, message: string, sessionId: string): Promise<boolean> {
  const raw = await env.AI.run("@cf/huggingface/distilbert-sst-2-int8", { text: message }, aiGateway("sentiment", sessionId));
  const score = negativeScore(raw);
  // SST-2 scores ordinary questions as NEGATIVE above 0.7. The model still runs.
  // Hand off only when that score is high and the fan also uses upset language.
  console.log(JSON.stringify({ event: "support_sentiment", score }));
  return score > 0.7 && ANGER.test(message);
}

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

async function readHistory(env: Env, sessionId: string): Promise<Turn[]> {
  const raw = await env.SUPPORT_KV.get(sessionKey(sessionId), "json");
  if (!raw || typeof raw !== "object" || !("messages" in raw)) return [];
  const messages = raw.messages;
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((item): item is Turn => {
      if (!item || typeof item !== "object") return false;
      const turn = item as Turn;
      return (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string";
    })
    .slice(-MAX_TURNS * 2);
}

async function writeHistory(env: Env, sessionId: string, history: Turn[], user: string, assistant: string): Promise<void> {
  const messages = [...history, { role: "user" as const, content: user }, { role: "assistant" as const, content: assistant }].slice(
    -MAX_TURNS * 2,
  );
  await env.SUPPORT_KV.put(sessionKey(sessionId), JSON.stringify({ messages }), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

function stripTicketLink(reply: string, message: string): string {
  if (asksToBuy(message)) return reply;
  return reply.split(TICKET_URL).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function ensureVenueFacts(reply: string, matches: Match[]): string {
  const eventRule = matches.find((match) => match.id === "chunk-event-rule");
  if (!eventRule || /selfie/i.test(reply)) return reply;
  return `${reply}\nFor this show, no selfie sticks are allowed. All items are subject to a security check at the gate.`;
}

function ensureTicketLink(reply: string, message: string, matches: Match[]): string {
  const contextHasLink = matches.some((match) => match.text.includes(TICKET_URL));
  if (!asksToBuy(message) || !contextHasLink) return stripTicketLink(reply, message);
  let next = reply;
  if (!/click the link below to visit the ticket page/i.test(next)) {
    next = `${next}\nClick the link below to visit the ticket page.`;
  }
  if (!next.includes(TICKET_URL)) next = `${next}\n${TICKET_URL}`;
  return next.trim();
}

async function answer(env: Env, message: string, history: Turn[], loggedIn: boolean, sessionId: string): Promise<string> {
  const matches = await retrieve(env, message, sessionId);
  const best = matches.reduce((max, match) => Math.max(max, match.score), 0);
  const known = isVenue(message) || isPresale(message) || isBenefit(message) || isEticket(message);
  console.log(JSON.stringify({ event: "support_retrieve", known, best, ids: matches.map((match) => match.id) }));
  if (!matches.length || (!known && best < MATCH_THRESHOLD)) return HUMAN_REPLY;

  const context = matches
    .map((match) => {
      const title =
        match.id === "chunk-venue"
          ? "Venue general rule"
          : match.id === "chunk-event-rule"
            ? "Event special rule"
            : match.id;
      return `${title}:\n${match.text}`;
    })
    .join("\n\n");
  const historyText = history.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
  const order = loggedIn ? mockOrder() : "none. The fan is not signed in.";
  const userContent = [
    "Retrieved context:",
    context,
    "",
    `Order info:\n${order}`,
    historyText ? `\nRecent chat:\n${historyText}` : "",
    isVenue(message) ? "\nAnswer using both the venue general rule and the event special rule." : "",
    `\nQuestion: ${message}`,
  ].join("\n");

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: 300,
    temperature: 0.1,
  }, aiGateway("answer", sessionId));
  const reply = result.response?.trim() ?? "";
  if (!reply) return "Sorry, I don't have that information, I will transfer you to human agent.";
  return ensureVenueFacts(ensureTicketLink(reply, message, matches), matches);
}

async function seed(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-Seed-Token");
  if (!env.SEED_TOKEN || token !== env.SEED_TOKEN) return json(request, { error: "unauthorized" }, 401);
  const ids: string[] = [];
  for (const chunk of CHUNKS) {
    const values = await embed(env, chunk.text, "seed");
    await env.SUPPORT_INDEX.upsert([
      {
        id: chunk.id,
        values,
        metadata: { ...chunk.metadata, text: chunk.text },
      },
    ]);
    ids.push(chunk.id);
  }
  return json(request, { ok: true, ids });
}

function validSession(sessionId: unknown): sessionId is string {
  return typeof sessionId === "string" && /^[0-9a-f-]{36}$/i.test(sessionId);
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/support/seed" && request.method === "POST") {
      return seed(request, env);
    }
    if (url.pathname !== "/api/support" || request.method !== "POST") {
      return json(request, { reply: FALLBACK_REPLY }, 404);
    }

    let body: { sessionId?: unknown; message?: unknown; isLogin?: unknown };
    try {
      body = await request.json();
    } catch {
      return json(request, { reply: FALLBACK_REPLY }, 400);
    }
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
    if (!validSession(body.sessionId) || !message) {
      return json(request, { reply: FALLBACK_REPLY }, 400);
    }

    try {
      const history = await readHistory(env, body.sessionId);
      const upset = await isUpset(env, message, body.sessionId);
      const reply = upset ? UPSET_REPLY : await answer(env, message, history, body.isLogin === true, body.sessionId);
      await writeHistory(env, body.sessionId, history, message, reply);
      console.log(JSON.stringify({ event: "support_turn", upset }));
      return json(request, { reply });
    } catch (error) {
      console.log(JSON.stringify({ event: "support_failed", message: error instanceof Error ? error.message : "unknown" }));
      return json(request, { reply: FALLBACK_REPLY }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
