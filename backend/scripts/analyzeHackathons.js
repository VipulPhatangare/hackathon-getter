import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Hackathon from "../models/Hackathon.js";
import { analyzeHackathon, isGeminiConfigured } from "../services/geminiAnalyzer.js";

/**
 * Batch Gemini analysis script.
 *
 * Usage:
 *   npm run analyze              → analyze only un-analyzed hackathons
 *   npm run analyze -- --all     → re-analyze every hackathon (prompt refresh)
 *   npm run analyze -- --id <id> → re-analyze one specific hackathon
 *
 * Skip logic:
 *   A hackathon is skipped when aiAnalysis.analyzedAt is already set AND
 *   --all / --id flags are absent. The scraper still refreshes dynamic fields
 *   (status, dates, counts) on every run regardless.
 *
 * Rate limiting:
 *   Gemini Flash 2.5 free tier: 10 RPM. We run CONCURRENCY=8 with a 100 ms
 *   stagger between starts, and retry once on 429 with a 15 s back-off.
 */

const CONCURRENCY   = 8;
const RETRY_DELAY   = 15_000; // ms to wait after a 429
const MAX_RETRIES   = 2;
const STAGGER_MS    = 100;    // ms between task starts to spread burst

// ── Worker pool (same pattern used in devfolio.js / unstop.js) ───────────────

async function withConcurrency(tasks, limit, stagger = 0) {
  const results = new Array(tasks.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      if (stagger && i > 0) await sleep(stagger * (i % limit));
      try { results[i] = { value: await tasks[i]() }; }
      catch (err) { results[i] = { error: err }; }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Single hackathon: call Gemini with retry on 429 ──────────────────────────

async function analyzeWithRetry(h, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await analyzeHackathon(h);
    } catch (err) {
      const is429 = err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("quota");
      if (is429 && attempt < retries) {
        await sleep(RETRY_DELAY * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

// ── Write Gemini result back to DB ───────────────────────────────────────────

async function applyAnalysis(h, ai) {
  // ai.* fields go into aiAnalysis subdoc.
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
    eligibility:     ai.eligibility     || "",
    legitimacyScore: ai.legitimacyScore ?? null,
    qualityScore:    ai.qualityScore    ?? null,
  };

  // Gemini-provided values override scraper values for richer fields.
  if (ai.summary)                        h.description   = ai.summary;
  if (ai.themes?.length)                 h.themes        = ai.themes;
  if (ai.technologies?.length)           h.technologies  = ai.technologies;
  if (ai.eligibility)                    h.eligibility   = ai.eligibility;
  if (ai.prizePool?.amount != null)      h.prizePool     = ai.prizePool;

  await h.save();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!isGeminiConfigured()) {
    console.error("[analyze] GEMINI_API_KEY is not set in .env — aborting.");
    process.exit(1);
  }

  await connectDB();

  const forceAll = process.argv.includes("--all");
  const idFlag   = process.argv.indexOf("--id");
  const singleId = idFlag >= 0 ? process.argv[idFlag + 1] : null;

  let query;
  if (singleId) {
    query = { _id: singleId };
  } else if (forceAll) {
    query = { status: { $in: ["upcoming", "ongoing"] } };
  } else {
    // Default: only hackathons not yet analyzed.
    query = {
      status: { $in: ["upcoming", "ongoing"] },
      "aiAnalysis.analyzedAt": null,
    };
  }

  const hackathons = await Hackathon.find(query);

  if (!hackathons.length) {
    console.log("[analyze] nothing to analyze — all hackathons already have AI analysis.");
    await mongoose.disconnect();
    return;
  }

  const flag = singleId ? `--id ${singleId}` : forceAll ? "--all" : "pending only";
  console.log(`[analyze] ${hackathons.length} hackathons to analyze (${flag})`);

  let done = 0, succeeded = 0, failed = 0;

  const tasks = hackathons.map((h) => async () => {
    try {
      const ai = await analyzeWithRetry(h);
      await applyAnalysis(h, ai);
      succeeded++;
    } catch (err) {
      failed++;
      console.error(`\n[analyze] ✗ ${h.title.slice(0, 50)}: ${err.message}`);
    } finally {
      done++;
      process.stdout.write(
        `\r[analyze] ${done}/${hackathons.length} done  ✓${succeeded} ✗${failed}`
      );
    }
  });

  await withConcurrency(tasks, CONCURRENCY, STAGGER_MS);

  console.log(`\n[analyze] complete — ✓ ${succeeded} succeeded, ✗ ${failed} failed`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[analyze] fatal:", err.message);
  process.exit(1);
});
