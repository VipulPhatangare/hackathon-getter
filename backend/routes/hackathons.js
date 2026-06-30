import express from "express";
import Hackathon from "../models/Hackathon.js";
import { requireAuth } from "../middleware/auth.js";
import { requireApiKey } from "../middleware/apiKeyAuth.js";
import { recommendForUser } from "../services/recommend.js";
import { analyzeHackathon, isGeminiConfigured } from "../services/geminiAnalyzer.js";

const router = express.Router();

const LEGITIMACY_MIN = parseInt(process.env.LEGITIMACY_MIN || "4", 10);

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
      sort  = "deadline",
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
    filter.$or = [
      { "aiAnalysis.legitimacyScore": null },
      { "aiAnalysis.legitimacyScore": { $gte: LEGITIMACY_MIN } },
    ];

    const sortMap = {
      deadline: { _hasDeadline: -1, registrationDeadline: 1 },
      newest:   { createdAt: -1 },
      prize:    { _hasPrize: -1, "prizePool.amount": -1 },
      quality:  { "aiAnalysis.qualityScore": -1 },
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
      { $project: { _hasDeadline: 0, _hasPrize: 0 } },
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

/** GET /api/admin/analysis-status — how many are analyzed vs pending */
router.get("/admin/analysis-status", async (_req, res) => {
  try {
    const [analyzed, pending, total, byPlatform] = await Promise.all([
      Hackathon.countDocuments({ "aiAnalysis.analyzedAt": { $ne: null } }),
      Hackathon.countDocuments({ "aiAnalysis.analyzedAt": null, status: { $in: ["upcoming", "ongoing"] } }),
      Hackathon.countDocuments({ status: { $in: ["upcoming", "ongoing"] } }),
      Hackathon.aggregate([
        { $group: { _id: "$sourcePlatform", analyzed: { $sum: { $cond: [{ $ne: ["$aiAnalysis.analyzedAt", null] }, 1, 0] } }, total: { $sum: 1 } } },
      ]),
    ]);
    res.json({
      geminiConfigured: isGeminiConfigured(),
      analyzed,
      pending,
      total,
      byPlatform,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/hackathons/:id */
router.get("/:id", async (req, res) => {
  try {
    const h = await Hackathon.findById(req.params.id);
    if (!h) return res.status(404).json({ error: "Not found" });
    res.json(h);
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
 * POST /api/hackathons/:id/reanalyze
 * Force a fresh Gemini analysis for one hackathon. No auth required for now
 * (this is a dev/admin tool — add requireAuth if you want to lock it down).
 */
router.post("/:id/reanalyze", async (req, res) => {
  try {
    if (!isGeminiConfigured()) {
      return res.status(503).json({ error: "GEMINI_API_KEY is not configured" });
    }

    const h = await Hackathon.findById(req.params.id);
    if (!h) return res.status(404).json({ error: "Not found" });

    // Clear the gate field so analyzeHackathon runs fresh.
    h.aiAnalysis = { ...h.aiAnalysis?.toObject?.() || {}, analyzedAt: null };

    const ai = await analyzeHackathon(h);

    h.aiAnalysis = {
      analyzedAt:      new Date(),
      model:           "gemini-2.5-flash",
      summary:         ai.summary         || "",
      pitch:           ai.pitch           || "",
      difficulty:      ai.difficulty      || "all",
      targetAudience:  ai.targetAudience  || "",
      requirements:    ai.requirements    || "",
      judgingCriteria: ai.judgingCriteria || [],
      highlights:      (ai.highlights     || []).slice(0, 3),
      legitimacyScore: ai.legitimacyScore ?? null,
      qualityScore:    ai.qualityScore    ?? null,
    };

    if (ai.summary)             h.description  = ai.summary;
    if (ai.themes?.length)      h.themes       = ai.themes;
    if (ai.technologies?.length) h.technologies = ai.technologies;
    if (ai.eligibility)         h.eligibility  = ai.eligibility;
    if (ai.prizePool?.amount != null) h.prizePool = ai.prizePool;

    await h.save();
    res.json({ ok: true, aiAnalysis: h.aiAnalysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
