import express from "express";
import Hackathon from "../models/Hackathon.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { requireApiKey } from "../middleware/apiKeyAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { recommendForUser } from "../services/recommend.js";
import {
  analyzeHackathon,
  applyAnalysis,
  isGeminiConfigured,
  chatAboutHackathon,
} from "../services/geminiAnalyzer.js";
import { getSettings } from "../services/settings.js";

const router = express.Router();

// Heavy/unused-on-the-public-site fields are stripped from list & detail
// responses (kept in the DB, used internally / by the analyzer).
const PUBLIC_EXCLUDE = "-faqs -sponsors -schedule -bannerImage";

// The chat endpoint is public but costs real Gemini quota per message —
// cap each visitor to 20 messages per 10-minute window.
const chatLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

/**
 * GET /api/hackathons
 * Query params: search, theme, tech, mode, status, platform,
 *               difficulty, minQuality, sort, page, limit
 */
router.get("/", async (req, res) => {
  try {
    const {
      search,
      theme,
      tech,
      mode,
      status,
      platform,
      difficulty,
      minQuality,
      sort  = "geminiRank",
      page  = 1,
      limit = 24,
    } = req.query;

    const filter = {};
    if (search)    filter.$text = { $search: search };
    if (theme)     filter.themes = { $in: theme.split(",") };
    if (tech)      filter.technologies = { $in: tech.split(",") };
    if (mode)      filter.mode = mode;
    if (platform)  filter.sourcePlatform = platform;
    if (difficulty) filter["aiAnalysis.difficulty"] = difficulty;

    // Default view = live + upcoming only.
    if (status) filter.status = status;
    else filter.status = { $in: ["upcoming", "ongoing"] };

    // Quality slider: only apply when AI has scored the hackathon.
    if (minQuality) {
      const q = parseFloat(minQuality);
      if (q > 0) filter["aiAnalysis.qualityScore"] = { $gte: q };
    }

    // Legitimacy gate: hide junk hackathons that Gemini has scored.
    // Un-analyzed hackathons (legitimacyScore = null) still show — we never
    // hide something just because we haven't analyzed it yet.
    const { legitimacyMin } = await getSettings();
    filter.$or = [
      { "aiAnalysis.legitimacyScore": null },
      { "aiAnalysis.legitimacyScore": { $gte: legitimacyMin } },
    ];

    const sortMap = {
      deadline: { _hasDeadline: -1, registrationDeadline: 1 },
      newest:   { createdAt: -1 },
      prize:    { _hasPrize: -1, "prizePool.amount": -1 },
      quality:  { "aiAnalysis.qualityScore": -1 },
      geminiRank: { "aiAnalysis.rankScore": -1, "aiAnalysis.qualityScore": -1, "prizePool.amount": -1 },
    };

    const pageNum = Math.max(1, parseInt(page));
    const lim     = Math.min(100, Math.max(1, parseInt(limit)));

    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          _hasDeadline: { $cond: [{ $gt: ["$registrationDeadline", null] }, 1, 0] },
          _hasPrize:    { $cond: [{ $gt: ["$prizePool.amount",        null] }, 1, 0] },
        },
      },
      { $sort: sortMap[sort] || sortMap.deadline },
      { $skip: (pageNum - 1) * lim },
      { $limit: lim },
      { $project: { _hasDeadline: 0, _hasPrize: 0, faqs: 0, sponsors: 0, schedule: 0, bannerImage: 0 } },
    ];

    const [items, total] = await Promise.all([
      Hackathon.aggregate(pipeline),
      Hackathon.countDocuments(filter),
    ]);

    res.json({ total, page: pageNum, limit: lim, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/hackathons/external/all
 * Server-to-server access: returns every hackathon in the DB.
 * Requires the API key, sent either as the "x-api-key" header or as
 * "apiKey" in the JSON body (base64 of "hackathons_for_synthomind").
 */
router.post("/external/all", requireApiKey, async (_req, res) => {
  try {
    const items = await Hackathon.find({});
    res.json({ total: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/hackathons/recommended  (auth) */
router.get("/recommended", requireAuth, async (req, res) => {
  try {
    const all    = await Hackathon.find({ status: { $ne: "ended" } }).limit(500);
    const ranked = recommendForUser(req.user, all, 20);
    res.json({ count: ranked.length, items: ranked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/hackathons/filters */
router.get("/filters", async (_req, res) => {
  try {
    const [themes, technologies, modes, platforms, difficulties] = await Promise.all([
      Hackathon.distinct("themes"),
      Hackathon.distinct("technologies"),
      Hackathon.distinct("mode"),
      Hackathon.distinct("sourcePlatform"),
      Hackathon.distinct("aiAnalysis.difficulty"),
    ]);
    res.json({
      themes:        themes.sort(),
      technologies:  technologies.sort(),
      modes,
      platforms:     platforms.sort(),
      difficulties:  difficulties.filter(Boolean).sort(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/hackathons/:id  (public — heavy fields stripped) */
router.get("/:id", async (req, res) => {
  try {
    const h = await Hackathon.findById(req.params.id).select(PUBLIC_EXCLUDE);
    if (!h) return res.status(404).json({ error: "Not found" });
    res.json(h);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/hackathons/:id/chat  (public, rate-limited)
 * Ask Gemini a question about one specific hackathon. The model is grounded
 * only in that hackathon's own data — it won't answer unrelated questions.
 * Body: { message: string, history?: [{ role: "user"|"assistant", text }] }
 */
router.post("/:id/chat", chatLimiter, async (req, res) => {
  try {
    if (!(await isGeminiConfigured())) {
      return res.status(503).json({ error: "Gemini is not configured" });
    }

    const { message, history } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const h = await Hackathon.findById(req.params.id).select(PUBLIC_EXCLUDE);
    if (!h) return res.status(404).json({ error: "Not found" });

    const safeHistory = Array.isArray(history)
      ? history.filter((m) => m && typeof m.text === "string").slice(-10)
      : [];

    const reply = await chatAboutHackathon(h, message.trim(), safeHistory);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/hackathons/:id/save  (auth) */
router.post("/:id/save", requireAuth, async (req, res) => {
  try {
    const id  = req.params.id;
    const idx = req.user.savedHackathons.findIndex((x) => String(x) === id);
    if (idx >= 0) req.user.savedHackathons.splice(idx, 1);
    else           req.user.savedHackathons.push(id);
    await req.user.save();
    res.json({ saved: idx < 0, savedHackathons: req.user.savedHackathons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/hackathons/:id/reanalyze  (admin only)
 * Force a fresh Gemini analysis for one hackathon.
 */
router.post("/:id/reanalyze", requireAdmin, async (req, res) => {
  try {
    if (!(await isGeminiConfigured())) {
      return res.status(503).json({ error: "GEMINI_API_KEY is not configured" });
    }

    const h = await Hackathon.findById(req.params.id);
    if (!h) return res.status(404).json({ error: "Not found" });

    const ai = await analyzeHackathon(h);
    applyAnalysis(h, ai);
    await h.save();
    res.json({ ok: true, aiAnalysis: h.aiAnalysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
