import axios from "axios";
import {
  canonTags,
  toDate,
  parsePrize,
  normalizeMode,
  buildDedupeKey,
} from "./normalize.js";
import { scrapeDevpostDetail } from "./devpostDetail.js";

/**
 * Devpost exposes a JSON listing at:
 *   https://devpost.com/api/hackathons?page=1
 * The listing gives us most fields, but NOT a description/tagline — those only
 * exist on each challenge page — so after listing we enrich every record with a
 * detail fetch (see enrichDetails) to fill in description, tagline and prizes.
 */
const BASE = "https://devpost.com/api/hackathons";
const PLATFORM = "devpost";
const DETAIL_CONCURRENCY = 6; // parallel detail-page fetches
const DESCRIPTION_MAX = 500; // chars kept as the card/detail summary

/**
 * Fetch EVERY open + upcoming hackathon (no fixed page cap). This mirrors the
 * site filter https://devpost.com/hackathons?status[]=upcoming&status[]=open —
 * axios serializes `status: ["upcoming", "open"]` to `status=upcoming&status=open`,
 * which Devpost accepts identically to the bracketed form. The API reports
 * meta.total_count, so we page until we've collected them all (maxPages is just
 * a safety valve against an unexpected response).
 */
export async function scrapeDevpost({ maxPages = 60, enrich = true } = {}) {
  const results = [];
  let totalCount = Infinity;
  let page = 1;

  while (page <= maxPages && results.length < totalCount) {
    try {
      const { data } = await axios.get(BASE, {
        params: { page, order_by: "deadline", status: ["upcoming", "open"] },
        headers: {
          "User-Agent": "Mozilla/5.0 (hackathon-aggregator student project)",
          Accept: "application/json",
        },
        timeout: 15000,
      });

      totalCount = data?.meta?.total_count ?? results.length;
      const items = data?.hackathons || [];
      if (items.length === 0) break;

      for (const h of items) results.push(mapDevpost(h));
      process.stdout.write(`\r[devpost] ${results.length}/${totalCount} fetched (open+upcoming)`);
      page++;
    } catch (err) {
      console.error(`\n[devpost] page ${page} failed:`, err.message);
      break;
    }
  }

  console.log(`\n[devpost] listing complete — ${results.length} open/upcoming hackathons`);

  // The listing has no description, so enrich each record from its detail page.
  if (enrich && results.length) await enrichDetails(results);

  return results;
}

/**
 * Fill in the fields the listing API omits (description, tagline, individual
 * prizes) by fetching each hackathon's detail page. Runs a fixed-size worker
 * pool so we don't open 169 sockets at once; a failed detail fetch just leaves
 * that record with its listing data intact.
 */
async function enrichDetails(records) {
  const queue = records.map((_, i) => i);
  let done = 0;

  async function worker() {
    let i;
    while ((i = queue.shift()) !== undefined) {
      const rec = records[i];
      try {
        const d = await scrapeDevpostDetail(rec.sourceUrl);

        rec.tagline = (d.tagline || "").trim();

        // Prefer the rich overview text; fall back to the tagline. Keep it to a
        // summary length — the full text lives one click away on Devpost.
        const full = (d.description || "").trim() || rec.tagline;
        rec.description =
          full.length > DESCRIPTION_MAX
            ? full.slice(0, DESCRIPTION_MAX).trimEnd() + "…"
            : full;

        // Per-prize breakdown (listing only gave a single total).
        if (d.prizes?.length) {
          rec.prizes = d.prizes.map((p) => {
            const { amount, currency } = parsePrize(p.value);
            return {
              name: p.title || "",
              amount,
              currency,
              description: p.winners || "",
            };
          });
        }
      } catch {
        // Network/parse error for one page — keep the listing-only record.
      }
      process.stdout.write(`\r[devpost] enriched ${++done}/${records.length} detail pages`);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, records.length) }, worker)
  );
  console.log(`\n[devpost] enrichment complete`);
}

/**
 * Parse the end (deadline) date out of Devpost's submission_period_dates string.
 * Handles the three shapes Devpost uses:
 *   "May 19 - Aug 17, 2026"  -> "Aug 17, 2026"
 *   "Dec 11 - 15, 2026"      -> "Dec 15, 2026" (end omits the month)
 *   "Aug 15, 2026"           -> "Aug 15, 2026" (single date)
 */
function parseDevpostEnd(raw) {
  if (!raw) return null;
  const parts = String(raw).split("-");
  let end = parts.pop().trim();
  // If the end half has no month name, borrow it from the start half.
  if (parts.length && !/[A-Za-z]/.test(end)) {
    const month = (parts[0].trim().match(/[A-Za-z]+/) || [""])[0];
    end = `${month} ${end}`.trim();
  }
  return toDate(end);
}

/** Transform one raw Devpost item into the unified Hackathon shape. */
function mapDevpost(h) {
  const themes = canonTags((h.themes || []).map((t) => t.name));
  const submissionDeadline = parseDevpostEnd(h.submission_period_dates);
  const prize = parsePrize(h.prize_amount?.replace(/<[^>]+>/g, "") || "");

  const url = h.url?.startsWith("http") ? h.url : `https:${h.url || ""}`;

  // Devpost startDate is unknown from the listing, so date-based status can't
  // classify these. Use the API's own open_state instead ("open" = live now,
  // "upcoming" = not started). recomputeStatus() preserves this when it has no
  // startDate to work from, and still overrides to "ended" once the deadline passes.
  const status =
    h.open_state === "open"
      ? "ongoing"
      : h.open_state === "upcoming"
      ? "upcoming"
      : "unknown";

  return {
    sourcePlatform: PLATFORM,
    sourceId: String(h.id),
    sourceUrl: url,
    title: h.title || "Untitled hackathon",
    description: (h.tagline || "").trim(),
    organizer: h.organization_name || "",
    bannerImage: h.thumbnail_url?.startsWith("http")
      ? h.thumbnail_url
      : `https:${h.thumbnail_url || ""}`,
    themes,
    technologies: themes, // Devpost themes double as tech tags here
    mode: normalizeMode(h.displayed_location?.location || (h.open_state || "")),
    location: {
      city: h.displayed_location?.location || "",
      country: "",
    },
    eligibility: h.eligibility_requirement_invite_only ? "Invite only" : "Open",
    teamSize: { min: null, max: null },
    registrationDeadline: submissionDeadline,
    submissionDeadline,
    startDate: null,
    endDate: submissionDeadline,
    prizePool: prize,
    registrationUrl: url,
    status,
    dedupeKey: buildDedupeKey(h.title, submissionDeadline),
  };
}
