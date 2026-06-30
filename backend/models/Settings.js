import mongoose from "mongoose";

/**
 * Singleton settings document. Exactly one of these exists (key: "global").
 * Everything here is editable from the admin dashboard at runtime — no redeploy
 * needed to change the Gemini system prompt, thresholds, schedule, or keys.
 *
 * API keys stored here OVERRIDE the matching .env values when non-empty. This
 * lets an admin rotate keys from the UI; leaving a field blank falls back to env.
 */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "global", unique: true },

    // ----- Gemini analyzer -----
    systemPrompt:  { type: String, default: "" }, // blank => use built-in default
    geminiApiKey:  { type: String, default: "" }, // blank => use process.env.GEMINI_API_KEY

    // ----- public-listing gates -----
    legitimacyMin:  { type: Number, default: 4 },  // hide AI-scored junk below this
    qualityDefault: { type: Number, default: 0 },  // default min-quality slider value

    // ----- server-to-server key -----
    externalApiKey: { type: String, default: "" }, // blank => env / built-in default

    // ----- automation -----
    autoScrapeEnabled: { type: Boolean, default: true },  // run the 6 AM IST cron
    autoAnalyzeAfterScrape: { type: Boolean, default: true },

    // ----- last-run bookkeeping (shown on dashboard) -----
    lastScrapeAt:      { type: Date, default: null },
    lastScrapeSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    lastAnalyzeAt:     { type: Date, default: null },
    lastAnalyzeSummary:{ type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", settingsSchema);
