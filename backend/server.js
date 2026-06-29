import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";

import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import hackathonRoutes from "./routes/hackathons.js";
import { runAllScrapers } from "./scrapers/index.js";
import { analyzeHackathon, isGeminiConfigured } from "./services/geminiAnalyzer.js";
import Hackathon from "./models/Hackathon.js";

const app = express();

const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date() }));
app.use("/api/auth", authRoutes);
app.use("/api/hackathons", hackathonRoutes);

// Manual scrape trigger.
app.post("/api/admin/scrape", async (_req, res) => {
  const summary = await runAllScrapers();
  res.json(summary);
});

// Manual analyze trigger — analyzes all pending hackathons.
app.post("/api/admin/analyze", async (_req, res) => {
  if (!isGeminiConfigured()) {
    return res.status(503).json({ error: "GEMINI_API_KEY is not configured" });
  }
  res.json({ ok: true, message: "Analysis started in background" });
  runPendingAnalysis().catch((e) => console.error("[analyze] background error:", e.message));
});

const PORT = process.env.PORT || 3002;

/** Analyze all hackathons that don't have aiAnalysis.analyzedAt yet. */
async function runPendingAnalysis() {
  const pending = await Hackathon.find({
    status: { $in: ["upcoming", "ongoing"] },
    "aiAnalysis.analyzedAt": null,
  });

  if (!pending.length) {
    console.log("[analyze] nothing pending");
    return;
  }

  console.log(`[analyze] ${pending.length} hackathons to analyze`);
  let done = 0;

  // Process 8 at a time with a small stagger to avoid burst-429.
  const CONCURRENCY = 8;
  const queue = [...pending];

  async function worker() {
    while (queue.length) {
      const h = queue.shift();
      try {
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
        if (ai.summary)              h.description  = ai.summary;
        if (ai.themes?.length)       h.themes       = ai.themes;
        if (ai.technologies?.length) h.technologies = ai.technologies;
        if (ai.eligibility)          h.eligibility  = ai.eligibility;
        if (ai.prizePool?.amount != null) h.prizePool = ai.prizePool;
        await h.save();
      } catch (err) {
        console.error(`[analyze] ✗ ${h.title?.slice(0, 40)}: ${err.message}`);
      }
      done++;
      if (done % 10 === 0) console.log(`[analyze] ${done}/${pending.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[analyze] done — ${done} processed`);
}

async function start() {
  await connectDB();

  app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));

  if (String(process.env.ENABLE_CRON).toLowerCase() === "true") {
    // Scrape every 6 hours.
    cron.schedule("0 */6 * * *", () => {
      console.log("[cron] scrape starting…");
      runAllScrapers().catch((e) => console.error("[cron] scrape error:", e.message));
    });

    // Analyze pending hackathons once a day at 2 am.
    cron.schedule("0 2 * * *", () => {
      if (!isGeminiConfigured()) return;
      console.log("[cron] daily analysis starting…");
      runPendingAnalysis().catch((e) => console.error("[cron] analyze error:", e.message));
    });

    console.log("[cron] enabled: scraping every 6 h, analyzing daily at 2 am");
  }
}

start();
