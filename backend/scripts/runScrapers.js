import "dotenv/config";
import { connectDB } from "../config/db.js";
import { runAllScrapers } from "../scrapers/index.js";
import { seedSampleData } from "./sampleData.js";
import mongoose from "mongoose";

/**
 * Standalone scraper run. Usage:
 *   npm run scrape           -> run real scrapers
 *   npm run scrape -- --seed -> also load offline sample data first
 */
async function main() {
  await connectDB();

  if (process.argv.includes("--seed")) {
    const n = await seedSampleData();
    console.log(`[seed] loaded ${n} sample hackathons`);
  }

  await runAllScrapers();

  await mongoose.disconnect();
  console.log("[scrape] disconnected, exiting.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
