import { scrapeDevpost } from "./devpost.js";
import { scrapeDevfolio } from "./devfolio.js";
import { scrapeUnstop } from "./unstop.js";
import { upsertHackathon } from "./dedupe.js";

/**
 * Register every scraper here. Each scraper is an async function returning an
 * array of normalized hackathon objects. Adding a new platform = add one file
 * and one line below.
 */
const SCRAPERS = [
  { name: "devpost",  run: () => scrapeDevpost() },
  { name: "devfolio", run: () => scrapeDevfolio() },
  { name: "unstop",   run: () => scrapeUnstop() },
  // { name: "mlh", run: () => scrapeMLH() },
];

/** Run all scrapers, normalize -> dedupe -> upsert. Returns a summary. */
export async function runAllScrapers() {
  const summary = { inserted: 0, updated: 0, merged: 0, failed: 0, bySource: {} };

  // Fetch every source in parallel — they hit independent sites, so there's no
  // reason to wait for devpost before starting devfolio. allSettled keeps one
  // crashed scraper from taking down the others.
  console.log(`[scrape] running ${SCRAPERS.length} scrapers in parallel: ${SCRAPERS.map((s) => s.name).join(", ")}`);
  const settled = await Promise.allSettled(
    SCRAPERS.map(async (scraper) => {
      const records = await scraper.run();
      console.log(`[scrape] ${scraper.name} returned ${records.length} records`);
      return records;
    })
  );

  // Upsert sequentially so dedupe across sources stays consistent (two sources
  // listing the same event must not race on the same dedupeKey).
  for (let i = 0; i < SCRAPERS.length; i++) {
    const scraper = SCRAPERS[i];
    const sourceStats = { inserted: 0, updated: 0, merged: 0, failed: 0 };
    const result = settled[i];

    if (result.status === "rejected") {
      console.error(`[scrape] ${scraper.name} crashed:`, result.reason?.message || result.reason);
      summary.bySource[scraper.name] = sourceStats;
      continue;
    }

    for (const rec of result.value) {
      try {
        const action = await upsertHackathon(rec);
        sourceStats[action] += 1;
        summary[action] += 1;
      } catch (err) {
        sourceStats.failed += 1;
        summary.failed += 1;
        console.error(`[scrape] upsert failed (${scraper.name}):`, err.message);
      }
    }
    summary.bySource[scraper.name] = sourceStats;
  }

  console.log("[scrape] done:", JSON.stringify(summary));
  return summary;
}
