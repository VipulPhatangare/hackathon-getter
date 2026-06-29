import axios from "axios";
import * as cheerio from "cheerio";
import {
  canonTags,
  toDate,
  parsePrize,
  normalizeMode,
  buildDedupeKey,
} from "./normalize.js";

/**
 * Unstop scraper — listing + detail enrichment.
 *
 * Listing:  GET /api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open
 *           Returns all live hackathons; paginated but small (~30 total). All
 *           fields except description come from here.
 *
 * Detail:   GET /api/public/competition/{id}
 *           Provides the HTML description (`details`), round schedule, and the
 *           per-rank prize breakdown. Fetched concurrently for every listing item.
 */

const LISTING_URL = "https://unstop.com/api/public/opportunity/search-result";
const DETAIL_URL  = "https://unstop.com/api/public/competition";
const PLATFORM    = "unstop";
const CONCURRENCY = 6;
const DESC_MAX    = 500;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
};

// ── Currency icon → ISO code ──────────────────────────────────────────────────

const CURRENCY_MAP = {
  "fa-rupee": "INR",
  "fa-dollar": "USD",
  "fa-euro": "EUR",
  "fa-pound": "GBP",
};

function currencyCode(raw) {
  if (!raw) return "";
  return CURRENCY_MAP[raw] || raw.replace("fa-", "").toUpperCase();
}

// ── HTML → plain text (description field is HTML from Unstop) ────────────────

function htmlToText(html) {
  if (!html) return "";
  const $ = cheerio.load(html);
  return $.root().text().replace(/\s+/g, " ").trim();
}

// ── Concurrency limiter (same worker-pool pattern as devfolio.js) ─────────────

async function withConcurrency(tasks, limit) {
  const results = new Array(tasks.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      try { results[i] = { value: await tasks[i]() }; }
      catch (err) { results[i] = { error: err }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ── Listing ───────────────────────────────────────────────────────────────────

async function fetchAllListings() {
  const allItems = [];
  let page = 1;
  let lastPage = Infinity;

  while (page <= lastPage) {
    const { data } = await axios.get(LISTING_URL, {
      params: {
        opportunity: "hackathons",
        per_page: 100,       // max; gets everything in as few requests as possible
        page,
        oppstatus: "open",   // only currently live hackathons
        usertype: "students",
        domain: 2,           // hackathon domain filter
      },
      headers: HEADERS,
      timeout: 20_000,
    });

    const meta  = data?.data;
    const items = meta?.data || [];
    lastPage    = meta?.last_page ?? 1;

    if (items.length === 0) break;

    allItems.push(...items);
    process.stdout.write(`\r[unstop] listing page ${page}/${lastPage} — ${allItems.length} hackathons`);
    page++;
  }

  console.log(`\n[unstop] listing complete — ${allItems.length} open hackathons`);
  return allItems;
}

// ── Detail ────────────────────────────────────────────────────────────────────

async function fetchDetail(id) {
  const { data } = await axios.get(`${DETAIL_URL}/${id}`, {
    params: { round_lang: 1, getSaasFeatures: "true" },
    headers: HEADERS,
    timeout: 20_000,
  });
  return data?.data?.competition || {};
}

// ── Prize parsing ─────────────────────────────────────────────────────────────

function parsePrizes(prizes = []) {
  return prizes.map((p) => {
    const code = p.currencyCode || currencyCode(p.currency);
    return {
      name: p.rank || "",
      amount: p.cash ?? null,
      currency: code,
      description: p.others || "",
    };
  });
}

/** Derive aggregate prize pool from the prizes array. */
function aggregatePrize(prizes = []) {
  const cash = prizes.filter((p) => p.cash != null);
  if (!cash.length) return { amount: null, currency: "" };
  const code = cash[0].currencyCode || currencyCode(cash[0].currency);
  const total = cash.reduce((s, p) => s + (p.cash || 0), 0);
  return { amount: total || null, currency: code };
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw) {
  switch ((raw || "").toUpperCase()) {
    case "LIVE": return "ongoing";
    case "UPCOMING": return "upcoming";
    case "ENDED":
    case "PAST": return "ended";
    default: return "unknown";
  }
}

// ── Mode mapping ──────────────────────────────────────────────────────────────

function mapMode(region) {
  const r = (region || "").toLowerCase();
  if (r === "online") return "online";
  if (r === "offline" || r === "in-person") return "offline";
  if (r === "hybrid") return "hybrid";
  return normalizeMode(region);
}

// ── Map listing + detail into unified Hackathon shape ─────────────────────────

function mapUnstop(listing, detail) {
  const regn  = detail?.regnRequirements || listing?.regnRequirements || {};
  const prizes = detail?.prizes || listing?.prizes || [];
  const prizeList = parsePrizes(prizes);
  const prizePool = aggregatePrize(prizes);

  // description: HTML in `details` — strip tags
  const rawDesc  = htmlToText(detail?.details || listing?.details || "");
  const description = rawDesc.length > DESC_MAX
    ? rawDesc.slice(0, DESC_MAX).trimEnd() + "…"
    : rawDesc;

  // Skills → technologies + themes
  const skills = (listing?.required_skills || [])
    .map((s) => (typeof s === "string" ? s : s?.skill || s?.skill_name || ""))
    .filter(Boolean);
  const technologies = canonTags(skills);

  const themes = canonTags(
    (listing?.tags || []).map((t) => t?.value || t?.name || t || "")
  );

  // Dates
  const registrationDeadline = toDate(regn.end_regn_dt);
  const startDate            = toDate(detail?.start_date || regn.start_regn_dt);
  const endDate              = toDate(detail?.end_date   || listing?.end_date);

  // Banner
  const bannerImage =
    (detail?.banner_mobile?.image_url) ||
    (typeof detail?.banner === "string" ? detail.banner : detail?.banner?.image_url) ||
    listing?.thumb || "";

  // Rounds (schedule)
  const schedule = (detail?.rounds || []).map((r) => ({
    group: "Rounds",
    title: r.name || "",
    startsAt: toDate(r.start_date),
    endsAt: toDate(r.end_date),
    description: htmlToText(r.description || ""),
  }));

  const url = listing?.seo_url || listing?.public_url || "";

  return {
    sourcePlatform: PLATFORM,
    sourceId: String(listing.id),
    sourceUrl: url,
    title: listing.title || detail?.title || "Untitled",
    description,
    organizer: listing?.organisation?.name || detail?.organisation?.name || "",
    bannerImage,
    themes,
    technologies,
    mode: mapMode(listing?.region || detail?.region),
    location: {
      city: (listing?.locations?.[0]?.city) || "",
      country: (listing?.locations?.[0]?.country) || "India",
    },
    eligibility: regn.eligibility || "Open",
    teamSize: {
      min: regn.min_team_size ?? null,
      max: regn.max_team_size ?? null,
    },
    registrationDeadline,
    submissionDeadline: endDate,
    startDate,
    endDate,
    prizePool,
    registrationUrl: url,
    status: mapStatus(listing?.status || detail?.status),
    prizes: prizeList,
    schedule,
    dedupeKey: buildDedupeKey(listing.title || detail?.title, registrationDeadline || endDate),
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function scrapeUnstop() {
  console.log("[unstop] fetching listing…");
  const listings = await fetchAllListings();

  if (!listings.length) {
    console.log("[unstop] no hackathons found");
    return [];
  }

  console.log(`[unstop] enriching ${listings.length} hackathons from detail API…`);
  let done = 0;

  const tasks = listings.map((listing) => async () => {
    try {
      const detail = await fetchDetail(listing.id);
      done++;
      process.stdout.write(`\r[unstop] enriched ${done}/${listings.length}`);
      return mapUnstop(listing, detail);
    } catch (err) {
      done++;
      process.stdout.write(`\r[unstop] enriched ${done}/${listings.length} (${listing.id} failed: ${err.message})`);
      // Fall back to listing-only data so one bad detail doesn't drop the record.
      return mapUnstop(listing, {});
    }
  });

  const settled = await withConcurrency(tasks, CONCURRENCY);
  console.log(`\n[unstop] complete`);

  return settled
    .filter((r) => r?.value != null)
    .map((r) => r.value);
}
