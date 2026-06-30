import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";

import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import hackathonRoutes from "./routes/hackathons.js";
import adminRoutes from "./routes/admin.js";
import { getSettings } from "./services/settings.js";
import { runScrapeJob, runAnalyzeJob } from "./services/jobs.js";
import { isGeminiConfigured } from "./services/geminiAnalyzer.js";

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
app.use("/api/admin", adminRoutes);

const PORT = process.env.PORT || 3002;

/** The daily morning job: scrape, then (optionally) analyze what's new. */
async function morningJob() {
  const settings = await getSettings();
  if (!settings.autoScrapeEnabled) {
    console.log("[cron] auto-scrape disabled in settings — skipping");
    return;
  }
  console.log("[cron] morning scrape starting…");
  try {
    await runScrapeJob("cron");
    if (settings.autoAnalyzeAfterScrape && (await isGeminiConfigured())) {
      console.log("[cron] analysis starting…");
      await runAnalyzeJob("cron");
    }
  } catch (e) {
    console.error("[cron] morning job error:", e.message);
  }
}

async function start() {
  await connectDB();

  app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));

  // Auto scrape + analyze every morning at 6:00 AM India time (Asia/Kolkata).
  // The job itself re-checks the autoScrapeEnabled toggle at fire time, so it
  // can be turned on/off from the admin dashboard without a restart.
  cron.schedule("0 6 * * *", morningJob, { timezone: "Asia/Kolkata" });
  console.log("[cron] scheduled: scrape + analyze daily at 6:00 AM IST (Asia/Kolkata)");
}

start();
