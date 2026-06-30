import Hackathon from "../models/Hackathon.js";
import Run from "../models/Run.js";
import { runAllScrapers } from "../scrapers/index.js";
import { analyzeHackathon, applyAnalysis, isGeminiConfigured } from "./geminiAnalyzer.js";
import { updateSettings } from "./settings.js";

/**
 * Centralized scrape / analyze orchestration. Both the admin endpoints and the
 * cron use these, so every run is logged to the Run collection and the
 * Settings "last run" timestamps stay accurate.
 *
 * A simple in-memory lock prevents two scrapes (or two analyses) overlapping —
 * e.g. an admin clicking "Scrape now" while the 6 AM cron is mid-flight.
 */
const locks = { scrape: false, analyze: false };

export const isJobRunning = (type) => Boolean(locks[type]);

/** Run all scrapers, log the run, update lastScrapeAt. Returns the summary. */
export async function runScrapeJob(trigger = "manual") {
  if (locks.scrape) throw new Error("A scrape is already running");
  locks.scrape = true;

  const run = await Run.create({ type: "scrape", trigger, status: "running" });
  try {
    const summary = await runAllScrapers();
    run.status = "success";
    run.summary = summary;
    run.finishedAt = new Date();
    await run.save();
    await updateSettings({ lastScrapeAt: new Date(), lastScrapeSummary: summary });
    return summary;
  } catch (err) {
    run.status = "failed";
    run.error = err.message;
    run.finishedAt = new Date();
    await run.save();
    throw err;
  } finally {
    locks.scrape = false;
  }
}

/**
 * Analyze every upcoming/ongoing hackathon that hasn't been analyzed yet.
 * Concurrency-limited to avoid Gemini burst-429s.
 */
export async function runAnalyzeJob(trigger = "manual") {
  if (locks.analyze) throw new Error("An analysis is already running");
  if (!(await isGeminiConfigured())) throw new Error("GEMINI_API_KEY is not configured");
  locks.analyze = true;

  const run = await Run.create({ type: "analyze", trigger, status: "running" });
  try {
    const pending = await Hackathon.find({
      status: { $in: ["upcoming", "ongoing"] },
      "aiAnalysis.analyzedAt": null,
    });

    let done = 0, succeeded = 0, failed = 0;
    const CONCURRENCY = 8;
    const queue = [...pending];

    async function worker() {
      while (queue.length) {
        const h = queue.shift();
        try {
          const ai = await analyzeHackathon(h);
          applyAnalysis(h, ai);
          await h.save();
          succeeded++;
        } catch (err) {
          failed++;
          console.error(`[analyze] ✗ ${h.title?.slice(0, 40)}: ${err.message}`);
        }
        done++;
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const summary = { total: pending.length, succeeded, failed };
    run.status = "success";
    run.summary = summary;
    run.finishedAt = new Date();
    await run.save();
    await updateSettings({ lastAnalyzeAt: new Date(), lastAnalyzeSummary: summary });
    console.log(`[analyze] done — ✓${succeeded} ✗${failed} of ${pending.length}`);
    return summary;
  } catch (err) {
    run.status = "failed";
    run.error = err.message;
    run.finishedAt = new Date();
    await run.save();
    throw err;
  } finally {
    locks.analyze = false;
  }
}
