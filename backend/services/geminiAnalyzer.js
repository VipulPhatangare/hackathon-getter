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
  },
  required: ["summary", "pitch", "difficulty", "highlights", "legitimacyScore", "qualityScore"],
};

let _client = null;
let _model  = null;

function getModel() {
  if (_model) return _model;
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }
  _client = new GoogleGenerativeAI(key);
  _model  = _client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,   // low temp for consistent structured output
    },
  });
  return _model;
}

/** Build the text block we send to Gemini from the DB record. */
function buildContext(h) {
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

const PROMPT_HEADER = `You are an expert hackathon analyst. Analyze the following hackathon listing and return a structured JSON response. Be concise and accurate.

Key rules:
- legitimacyScore: penalize heavily for vague prizes ("exciting goodies"), no known organizer, no cash prizes, poor description, feels like a certificate farm
- qualityScore: reward cash prizes, clear requirements, reputable organizer, global reach, learning value
- highlights: exactly 3 short bullets a developer would want to know at a glance
- pitch: one sentence that makes a developer want to click through
- difficulty: base this on required skills and project complexity described

HACKATHON DATA:
`;

/**
 * Analyze a single hackathon DB record with Gemini.
 * Returns the raw parsed JSON from the model.
 * Throws on API error (caller handles retry/skip).
 */
export async function analyzeHackathon(hackathon) {
  const model   = getModel();
  const context = buildContext(hackathon);
  const prompt  = PROMPT_HEADER + context;

  const result = await model.generateContent(prompt);
  const text   = result.response.text();
  return JSON.parse(text);
}

/**
 * Check whether the Gemini key is configured and the API is reachable.
 * Used by the health endpoint.
 */
export function isGeminiConfigured() {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== "your_gemini_api_key_here");
}
