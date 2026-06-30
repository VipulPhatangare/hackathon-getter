import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * Gemini Flash 2.5 analyzer.
 *
 * Reads all rich text already in the DB (title, description, prizes, themes,
 * requirements, etc.) and returns a single normalized JSON object. This means
 * we never need to re-fetch pages just for analysis — the scrapers already
 * pulled the content.
 *
 * The response schema forces Gemini to always return the same shape regardless
 * of platform (Devpost / Devfolio / Unstop all have different raw structures).
 */

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary: {
      type: SchemaType.STRING,
      description: "2-3 sentence clean, neutral description of the hackathon",
    },
    longDescription: {
      type: SchemaType.STRING,
      description:
        "An in-depth, engaging write-up of the hackathon between 300 and 1000 words. " +
        "Cover: what the hackathon is about and its theme, what participants will actually build or do, " +
        "who it's for, why it's worth joining, the format/experience, prizes and what's at stake, and any " +
        "standout details. Write in clear, well-organized prose (multiple short paragraphs separated by a " +
        "blank line). Never invent facts not supported by the data — if details are thin, write a shorter " +
        "piece grounded only in what's known rather than padding with filler.",
    },
    pitch: {
      type: SchemaType.STRING,
      description: "One punchy sentence: why a developer should join this hackathon",
    },
    difficulty: {
      type: SchemaType.STRING,
      description: "Skill level required",
      enum: ["beginner", "intermediate", "advanced", "all"],
    },
    targetAudience: {
      type: SchemaType.STRING,
      description: "Who this is for, e.g. 'Students worldwide', 'ML researchers', 'Open to all'",
    },
    themes: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Normalized technology/topic tags (max 6)",
    },
    technologies: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Specific tools, languages, or frameworks mentioned (max 8)",
    },
    requirements: {
      type: SchemaType.STRING,
      description: "Condensed what-to-build / what-to-submit (max 250 chars)",
    },
    judgingCriteria: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Each judging criterion as a short phrase",
    },
    highlights: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Exactly 3 key selling points shown on the card (e.g. '$10k prize', 'Open globally', 'Mentorship provided')",
    },
    eligibility: {
      type: SchemaType.STRING,
      description: "Condensed who-can-join sentence",
    },
    prizePool: {
      type: SchemaType.OBJECT,
      properties: {
        amount:   { type: SchemaType.NUMBER },
        currency: { type: SchemaType.STRING },
      },
    },
    legitimacyScore: {
      type: SchemaType.NUMBER,
      description: "1-10. Low score = certificate farm / fake prizes / spam. 10 = major well-funded hackathon.",
    },
    qualityScore: {
      type: SchemaType.NUMBER,
      description: "1-10. Overall attractiveness: prize value, organization quality, clarity, learning opportunity.",
    },
    rankScore: {
      type: SchemaType.NUMBER,
      description: "1-10. Overall Gemini ranking score combining quality, prize pool, difficulty, clarity, and legitimacy.",
    },
  },
  required: ["summary", "longDescription", "pitch", "difficulty", "highlights", "legitimacyScore", "qualityScore", "rankScore"],
};

// Model is cached and keyed by the API key in effect. When the key changes
// (e.g. an admin rotates it from the dashboard) resetGeminiModel() drops it so
// the next call rebuilds with the new key.
let _cache = { key: null, model: null };

/** Resolve the effective key: DB override (Settings) first, then env. */
async function resolveKey() {
  // Lazy import avoids a circular dependency (settings.js imports this file).
  const { resolveGeminiKey } = await import("./settings.js");
  return resolveGeminiKey();
}

async function getModel() {
  const key = await resolveKey();
  if (!key || key === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (_cache.model && _cache.key === key) return _cache.model;

  const client = new GoogleGenerativeAI(key);
  const model  = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,   // low temp for consistent structured output
    },
  });
  _cache = { key, model };
  return model;
}

// Separate cache for the chat model — it returns plain text (no JSON schema),
// so it can't share the structured-analysis model instance above.
let _chatCache = { key: null, model: null };

async function getChatModel() {
  const key = await resolveKey();
  if (!key || key === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (_chatCache.model && _chatCache.key === key) return _chatCache.model;

  const client = new GoogleGenerativeAI(key);
  const model  = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
  });
  _chatCache = { key, model };
  return model;
}

/** Drop the cached models so the next call rebuilds (used on key change). */
export function resetGeminiModel() {
  _cache = { key: null, model: null };
  _chatCache = { key: null, model: null };
}

/** Build the text block we send to Gemini from the DB record. */
export function buildContext(h) {
  const lines = [
    `TITLE: ${h.title}`,
    `PLATFORM: ${h.sourcePlatform}`,
    `ORGANIZER: ${h.organizer || "Unknown"}`,
    h.tagline        ? `TAGLINE: ${h.tagline}` : null,
    h.description    ? `DESCRIPTION:\n${h.description.slice(0, 3000)}` : null,
    h.themes?.length ? `EXISTING THEMES: ${h.themes.join(", ")}` : null,
    h.technologies?.length ? `EXISTING TECH TAGS: ${h.technologies.join(", ")}` : null,
    h.eligibility    ? `ELIGIBILITY: ${h.eligibility}` : null,
    h.mode           ? `MODE: ${h.mode}` : null,
    h.location?.city ? `LOCATION: ${h.location.city}, ${h.location.country || ""}` : null,
    h.teamSize?.max  ? `TEAM SIZE: ${h.teamSize.min || 1}–${h.teamSize.max}` : null,
    h.prizePool?.amount
      ? `TOTAL PRIZE: ${h.prizePool.currency} ${h.prizePool.amount.toLocaleString()}`
      : null,
    h.prizes?.length
      ? `PRIZE BREAKDOWN:\n${h.prizes.slice(0, 5).map(p =>
          `  ${p.name}: ${p.amount ? `${p.currency} ${p.amount}` : "non-cash"} — ${p.description || ""}`
        ).join("\n")}`
      : null,
    h.aiAnalysis?.requirements || h.requirements
      ? `REQUIREMENTS: ${(h.aiAnalysis?.requirements || h.requirements || "").slice(0, 1000)}`
      : null,
    h.aiAnalysis?.judgingCriteria?.length
      ? `JUDGING: ${h.aiAnalysis.judgingCriteria.join(", ")}`
      : null,
    `URL: ${h.sourceUrl}`,
  ];

  return lines.filter(Boolean).join("\n");
}

/**
 * The default analyst instructions. The admin dashboard can override this via
 * Settings.systemPrompt; when that field is blank we fall back to this text.
 * The "HACKATHON DATA:" block is appended automatically in analyzeHackathon().
 */
export const DEFAULT_PROMPT_HEADER = `You are an expert hackathon analyst. Analyze the following hackathon listing and return a structured JSON response. Be concise and accurate.

Key rules:
- legitimacyScore: penalize heavily for vague prizes ("exciting goodies"), no known organizer, no cash prizes, poor description, feels like a certificate farm
- qualityScore: reward cash prizes, clear requirements, reputable organizer, global reach, learning value
- rankScore: overall score from 1-10. Use qualityScore, prizePool, difficulty, legitimacy, clarity, and learning value together. Higher difficulty should help when the hackathon is still well organized and worth joining.
- highlights: exactly 3 short bullets a developer would want to know at a glance
- pitch: one sentence that makes a developer want to click through
- difficulty: base this on required skills and project complexity described
- longDescription: a thorough 300-1000 word write-up in multiple short paragraphs — grounded only in the
  provided data, never invented. This is the main read for someone deciding whether to join.`;

/**
 * Analyze a single hackathon DB record with Gemini.
 * Returns the raw parsed JSON from the model.
 * Throws on API error (caller handles retry/skip).
 */
export async function analyzeHackathon(hackathon) {
  const model   = await getModel();
  const context = buildContext(hackathon);

  // Use the admin-editable system prompt when set, else the built-in default.
  const { getSettings } = await import("./settings.js");
  const s = await getSettings();
  const header = (s.systemPrompt && s.systemPrompt.trim()) || DEFAULT_PROMPT_HEADER;

  const prompt = `${header}\n\nHACKATHON DATA:\n${context}`;

  const result = await model.generateContent(prompt);
  const text   = result.response.text();
  return JSON.parse(text);
}

/** System instructions for the per-hackathon chat widget. */
function chatSystemPrompt(context) {
  return `You are a friendly assistant embedded on a hackathon's detail page. Answer the visitor's questions using ONLY the hackathon data below — never invent facts that aren't stated.

Rules:
- Stay strictly on-topic: this hackathon's prizes, dates, eligibility, rules, themes, judging, registration, etc.
- If asked something unrelated to this hackathon, politely steer back: "I can only help with questions about this hackathon."
- If the data doesn't contain the answer, say so honestly and suggest checking the official page (the URL is in the data).
- Keep answers short and conversational — 2-4 sentences unless the visitor asks for more detail.

HACKATHON DATA:
${context}`;
}

/**
 * Answer a visitor question about one specific hackathon, grounded only in
 * that hackathon's DB record. `history` is the prior turns of this
 * conversation as [{ role: "user"|"assistant", text }], oldest first.
 */
export async function chatAboutHackathon(hackathon, message, history = []) {
  const model   = await getChatModel();
  const context = buildContext(hackathon);

  const chat = model.startChat({
    history: [
      { role: "user",  parts: [{ text: chatSystemPrompt(context) }] },
      { role: "model", parts: [{ text: "Got it — ask me anything about this hackathon." }] },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.text || "").slice(0, 2000) }],
      })),
    ],
  });

  const result = await chat.sendMessage(String(message).slice(0, 1000));
  return result.response.text();
}

/**
 * Normalize a raw Gemini result into the aiAnalysis subdocument shape and write
 * the derived fields back onto the hackathon. Shared by the batch job, the cron
 * job and the admin re-analyze endpoint. Does NOT save — caller persists.
 */
export function applyAnalysis(h, ai) {
  h.aiAnalysis = {
    analyzedAt:      new Date(),
    model:           "gemini-2.5-flash",
    summary:         ai.summary         || "",
    longDescription: ai.longDescription || "",
    pitch:           ai.pitch           || "",
    difficulty:      ai.difficulty      || "all",
    targetAudience:  ai.targetAudience  || "",
    requirements:    ai.requirements    || "",
    judgingCriteria: ai.judgingCriteria || [],
    highlights:      (ai.highlights     || []).slice(0, 3),
    legitimacyScore: ai.legitimacyScore ?? null,
    qualityScore:    ai.qualityScore    ?? null,
    rankScore:       ai.rankScore       ?? null,
  };
  if (ai.summary)                   h.description  = ai.summary;
  if (ai.themes?.length)            h.themes       = ai.themes;
  if (ai.technologies?.length)      h.technologies = ai.technologies;
  if (ai.eligibility)               h.eligibility  = ai.eligibility;
  if (ai.prizePool?.amount != null) h.prizePool    = ai.prizePool;
  return h;
}

/**
 * Check whether a Gemini key is configured (DB override or env).
 * Used by the health/admin endpoints. Now async because the key can live in DB.
 */
export async function isGeminiConfigured() {
  const key = await resolveKey();
  return Boolean(key && key !== "your_gemini_api_key_here");
}
