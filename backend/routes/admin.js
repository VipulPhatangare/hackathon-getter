import express from "express";
import Hackathon from "../models/Hackathon.js";
import Run from "../models/Run.js";
import { requireAdmin } from "../middleware/admin.js";
import { getSettings, updateSettings } from "../services/settings.js";
import { isGeminiConfigured, DEFAULT_PROMPT_HEADER } from "../services/geminiAnalyzer.js";
import { runScrapeJob, runAnalyzeJob, isJobRunning } from "../services/jobs.js";

const router = express.Router();

// Everything below requires an admin JWT.
router.use(requireAdmin);

/** Keys are never sent to the client raw — only whether they're set + a hint. */
function maskKey(value) {
  if (!value) return { set: false, hint: "" };
  return { set: true, hint: `••••${value.slice(-4)}` };
}

/** GET /api/admin/stats — dashboard overview numbers. */
router.get("/stats", async (_req, res) => {
  try {
    const [total, analyzed, pending, byStatus, byPlatform, geminiOk] = await Promise.all([
      Hackathon.countDocuments({}),
      Hackathon.countDocuments({ "aiAnalysis.analyzedAt": { $ne: null } }),
      Hackathon.countDocuments({ "aiAnalysis.analyzedAt": null, status: { $in: ["upcoming", "ongoing"] } }),
      Hackathon.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Hackathon.aggregate([
        { $group: {
          _id: "$sourcePlatform",
          total: { $sum: 1 },
          analyzed: { $sum: { $cond: [{ $ne: ["$aiAnalysis.analyzedAt", null] }, 1, 0] } },
        } },
        { $sort: { total: -1 } },
      ]),
      isGeminiConfigured(),
    ]);

    const settings = await getSettings();

    res.json({
      geminiConfigured: geminiOk,
      total,
      analyzed,
      pending,
      byStatus,
      byPlatform,
      lastScrapeAt: settings.lastScrapeAt,
      lastScrapeSummary: settings.lastScrapeSummary,
      lastAnalyzeAt: settings.lastAnalyzeAt,
      lastAnalyzeSummary: settings.lastAnalyzeSummary,
      scrapeRunning: isJobRunning("scrape"),
      analyzeRunning: isJobRunning("analyze"),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/settings — editable settings (keys masked). */
router.get("/settings", async (_req, res) => {
  try {
    const s = await getSettings();
    res.json({
      systemPrompt: s.systemPrompt,
      defaultPrompt: DEFAULT_PROMPT_HEADER,
      legitimacyMin: s.legitimacyMin,
      qualityDefault: s.qualityDefault,
      autoScrapeEnabled: s.autoScrapeEnabled,
      autoAnalyzeAfterScrape: s.autoAnalyzeAfterScrape,
      geminiApiKey: maskKey(s.geminiApiKey),
      externalApiKey: maskKey(s.externalApiKey),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/admin/settings — update settings. Empty key strings are ignored. */
router.put("/settings", async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};

    if (b.systemPrompt !== undefined) patch.systemPrompt = String(b.systemPrompt);
    if (b.legitimacyMin !== undefined) patch.legitimacyMin = Number(b.legitimacyMin);
    if (b.qualityDefault !== undefined) patch.qualityDefault = Number(b.qualityDefault);
    if (b.autoScrapeEnabled !== undefined) patch.autoScrapeEnabled = Boolean(b.autoScrapeEnabled);
    if (b.autoAnalyzeAfterScrape !== undefined) patch.autoAnalyzeAfterScrape = Boolean(b.autoAnalyzeAfterScrape);

    // Keys only change when a non-empty value is supplied, so blanks left in the
    // form don't wipe an existing key.
    if (typeof b.geminiApiKey === "string" && b.geminiApiKey.trim()) patch.geminiApiKey = b.geminiApiKey.trim();
    if (typeof b.externalApiKey === "string" && b.externalApiKey.trim()) patch.externalApiKey = b.externalApiKey.trim();

    await updateSettings(patch);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/scrape — kick off a scrape in the background. */
router.post("/scrape", (_req, res) => {
  if (isJobRunning("scrape")) return res.status(409).json({ error: "A scrape is already running" });
  res.json({ ok: true, message: "Scrape started" });
  runScrapeJob("manual").catch((e) => console.error("[admin] scrape error:", e.message));
});

/** POST /api/admin/analyze — kick off analysis of pending hackathons. */
router.post("/analyze", async (_req, res) => {
  if (isJobRunning("analyze")) return res.status(409).json({ error: "An analysis is already running" });
  if (!(await isGeminiConfigured())) return res.status(503).json({ error: "GEMINI_API_KEY is not configured" });
  res.json({ ok: true, message: "Analysis started" });
  runAnalyzeJob("manual").catch((e) => console.error("[admin] analyze error:", e.message));
});

/** GET /api/admin/runs — recent scrape/analyze history. */
router.get("/runs", async (_req, res) => {
  try {
    const runs = await Run.find({}).sort({ createdAt: -1 }).limit(20);
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
