import Settings from "../models/Settings.js";
import { resetGeminiModel } from "./geminiAnalyzer.js";

/**
 * Cached accessor for the singleton Settings document.
 * The cache is invalidated on every update so callers always see fresh values.
 */
let _cache = null;

/** Get the singleton settings doc, creating it on first use. */
export async function getSettings() {
  if (_cache) return _cache;
  _cache = (await Settings.findOne({ key: "global" })) || (await Settings.create({ key: "global" }));
  return _cache;
}

/** Apply a partial update and persist. Returns the updated doc. */
export async function updateSettings(patch = {}) {
  const s = await getSettings();
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) s[k] = v;
  }
  await s.save();
  _cache = s;
  // The Gemini model is keyed by API key — drop it so the next call rebuilds.
  resetGeminiModel();
  return s;
}

/** Force the next getSettings() to re-read from the DB. */
export function invalidateSettings() {
  _cache = null;
}

/** Resolve the effective Gemini key: DB override first, then env. */
export async function resolveGeminiKey() {
  const s = await getSettings();
  return (s.geminiApiKey && s.geminiApiKey.trim()) || process.env.GEMINI_API_KEY || "";
}

/** Resolve the effective external (server-to-server) API key. */
export async function resolveExternalKey() {
  const s = await getSettings();
  // Base64 of "hackathons_for_synthomind" — historical default.
  const DEFAULT_KEY = "aGFja2F0aG9uc19mb3Jfc3ludGhvbWluZA==";
  return (
    (s.externalApiKey && s.externalApiKey.trim()) ||
    process.env.EXTERNAL_API_KEY ||
    DEFAULT_KEY
  );
}
