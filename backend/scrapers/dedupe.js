import stringSimilarity from "string-similarity";
import Hackathon from "../models/Hackathon.js";

/**
 * Upsert a normalized hackathon record while handling cross-platform duplicates.
 *
 * Strategy:
 *  1. Idempotent upsert on (sourcePlatform, sourceId) so re-scraping the same
 *     event just refreshes it instead of inserting a copy.
 *  2. Before inserting a NEW record, look for an existing event from a DIFFERENT
 *     platform with a very similar title in the same time window. If found, we
 *     treat it as the same event and just attach this source's URL.
 *
 * Returns: "updated" | "merged" | "inserted"
 */
export async function upsertHackathon(doc) {
  // 1) Same platform + same id -> refresh in place.
  const existingSame = await Hackathon.findOne({
    sourcePlatform: doc.sourcePlatform,
    sourceId: doc.sourceId,
  });

  if (existingSame) {
    Object.assign(existingSame, doc);
    existingSame.lastSeenAt = new Date();
    existingSame.recomputeStatus();
    await existingSame.save();
    return "updated";
  }

  // 2) Possible cross-platform duplicate? Compare against same-dedupeKey events.
  const candidates = await Hackathon.find({
    dedupeKey: doc.dedupeKey,
    sourcePlatform: { $ne: doc.sourcePlatform },
  });

  for (const c of candidates) {
    const sim = stringSimilarity.compareTwoStrings(
      c.title.toLowerCase(),
      doc.title.toLowerCase()
    );
    if (sim >= 0.82) {
      // Same event from another platform — record the alternate link only.
      const already = (c.sourceUrls || []).some((s) => s.platform === doc.sourcePlatform);
      if (!already) {
        c.sourceUrls.push({ platform: doc.sourcePlatform, url: doc.sourceUrl });
        await c.save();
      }
      return "merged";
    }
  }

  // 3) Genuinely new event.
  const created = new Hackathon({
    ...doc,
    sourceUrls: [{ platform: doc.sourcePlatform, url: doc.sourceUrl }],
  });
  created.recomputeStatus();
  await created.save();
  return "inserted";
}
