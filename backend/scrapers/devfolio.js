import axios from "axios";
import * as cheerio from "cheerio";
import {
  canonTags,
  toDate,
  parsePrize,
  normalizeMode,
  buildDedupeKey,
} from "./normalize.js";

const PLATFORM = "devfolio";
const CONCURRENCY = 5; // parallel hackathon detail fetches
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

// ─── HTTP / HTML helpers ──────────────────────────────────────────────────────

async function getPageProps(url) {
  const { data: html } = await axios.get(url, {
    headers: HEADERS,
    timeout: 30_000,
  });
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").html();
  if (!raw) throw new Error(`__NEXT_DATA__ not found: ${url}`);
  return JSON.parse(raw).props.pageProps;
}

// ─── Concurrency limiter (worker-pool pattern) ────────────────────────────────

async function withConcurrency(tasks, limit) {
  const results = new Array(tasks.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      try {
        results[i] = { value: await tasks[i]() };
      } catch (err) {
        results[i] = { error: err };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );
  return results;
}

// ─── List scraper ─────────────────────────────────────────────────────────────

async function scrapeList() {
  const props = await getPageProps("https://devfolio.co/hackathons");
  // Devfolio embeds all hackathons in the first React Query cache entry
  const data = props.dehydratedState.queries[0].state.data;
  // Only live + upcoming — we don't surface ended hackathons, so skip past_hackathons.
  return [
    ...(data.open_hackathons || []),
    ...(data.upcoming_hackathons || []),
  ];
}

// ─── Detail scraper (3 sub-pages fetched in parallel per hackathon) ───────────
// Uses allSettled so a missing /prizes or /schedule page doesn't kill the rest.

async function scrapeDetail(slug) {
  const base = `https://${slug}.devfolio.co`;
  const [overviewRes, prizesRes, scheduleRes] = await Promise.allSettled([
    getPageProps(`${base}/overview`),
    getPageProps(`${base}/prizes`),
    getPageProps(`${base}/schedule`),
  ]);

  // Overview is the minimum required — throw so the caller can fall back to listing data.
  if (overviewRes.status === "rejected") throw overviewRes.reason;

  return {
    overview: overviewRes.value,
    prizesPage:   prizesRes.status   === "fulfilled" ? prizesRes.value   : { prizeDetails: [], aggregatePrizeValue: null, aggregatePrizeCurrency: null },
    schedulePage: scheduleRes.status === "fulfilled" ? scheduleRes.value : { hackathon: {} },
    base,
    missing: [
      prizesRes.status   === "rejected" && "prizes",
      scheduleRes.status === "rejected" && "schedule",
    ].filter(Boolean),
  };
}

// ─── Data mapping ─────────────────────────────────────────────────────────────

function mapDevfolio(raw, detail) {
  const h = detail.overview.hackathon;
  const { prizesPage, schedulePage, base } = detail;

  // Themes / tags
  const themes = canonTags(
    (raw.themes || []).filter((t) => t?.theme).map((t) => t.theme.name)
  );

  // Dates
  const registrationDeadline = toDate(h.settings?.reg_ends_at);
  const startDate = toDate(h.starts_at);
  const endDate = toDate(h.ends_at);

  // Individual prizes (for display in detail view)
  const prizes = [];
  for (const group of prizesPage.prizeDetails || []) {
    for (const prize of group.prizes || []) {
      prizes.push({
        name: prize.name || "",
        amount: prize.amount ?? null,
        currency: prize.currency || "",
        description: prize.desc || "",
      });
    }
  }

  // Aggregate prize pool (for card + sorting)
  const aggValue = prizesPage.aggregatePrizeValue;
  const aggCurrency = prizesPage.aggregatePrizeCurrency;
  const prizePool =
    aggValue != null
      ? { amount: aggValue, currency: aggCurrency || "USD" }
      : prizes[0]?.amount
      ? { amount: prizes[0].amount, currency: prizes[0].currency || "" }
      : parsePrize("");

  // Sponsors
  const sponsors = [];
  for (const tier of h.sponsor_tiers || []) {
    for (const sponsor of tier.sponsors || []) {
      sponsors.push({
        name: sponsor.name || "",
        domain: sponsor.company?.domain || "",
        logo: sponsor.logo || "",
        tier: tier.name || "",
      });
    }
  }

  // FAQs
  const faqs = (h.faqs || []).map((f) => ({
    question: f.question || "",
    answer: f.answer || "",
  }));

  // Schedule
  const schedule = [];
  const scheduleHackathon = schedulePage.hackathon || {};
  for (const group of scheduleHackathon.hackathon_event_groups || []) {
    for (const event of group.hackathon_events || []) {
      schedule.push({
        group: group.name || "",
        title: event.name || "",
        startsAt: toDate(event.starts_at),
        endsAt: toDate(event.ends_at),
        description: event.description || "",
      });
    }
  }

  return {
    // ── unified schema fields ──
    sourcePlatform: PLATFORM,
    sourceId: h.slug || raw.slug,
    sourceUrl: base,
    title: h.name || raw.name || "Untitled",
    description: (h.desc || h.tagline || "").trim(),
    organizer: h.settings?.organizer_name || h.settings?.contact_email?.split("@")[1]?.split(".")[0] || "",
    bannerImage: h.cover_img || "",
    themes,
    technologies: themes,
    mode: normalizeMode(h.is_online ? "online" : "offline"),
    location: {
      city: h.settings?.city || "",
      country: h.settings?.country || "India",
    },
    eligibility: "Open",
    teamSize: {
      min: h.team_min ?? 1,
      max: h.team_max ?? null,
    },
    registrationDeadline,
    submissionDeadline: endDate,
    startDate,
    endDate,
    prizePool,
    registrationUrl: base,
    dedupeKey: buildDedupeKey(
      h.name || raw.name,
      registrationDeadline || startDate
    ),

    // ── Devfolio extended fields ──
    tagline: h.tagline || "",
    contactEmail: h.settings?.contact_email || "",
    participantsCount: raw.participants_count ?? 0,
    timezone: h.timezone || "",
    socialLinks: {
      instagram: h.settings?.instagram || "",
      linkedin: h.settings?.linkedin || "",
      discord: h.settings?.discord || "",
      telegram: h.settings?.telegram || "",
    },
    faqs,
    sponsors,
    prizes,
    schedule,
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function scrapeDevfolio() {
  console.log("[devfolio] fetching hackathon list…");
  const rawList = await scrapeList();
  console.log(`[devfolio] found ${rawList.length} hackathons, scraping details in parallel (limit=${CONCURRENCY})…`);

  let done = 0;
  const tasks = rawList.map((raw) => async () => {
    const slug = raw.slug;
    if (!slug) return null;
    try {
      const detail = await scrapeDetail(slug);
      const mapped = mapDevfolio(raw, detail);
      done++;
      const warn = detail.missing?.length ? ` (no ${detail.missing.join(", ")} page)` : "";
      process.stdout.write(`\r[devfolio] ${done}/${rawList.length} done${warn ? `  ← ${slug}${warn}` : ""}`);
      return mapped;
    } catch (err) {
      const status = err.response?.status;
      console.warn(`\n[devfolio] ✗ ${slug}: HTTP ${status ?? err.message}`);
      return null;
    }
  });

  const settled = await withConcurrency(tasks, CONCURRENCY);
  console.log(); // newline after progress counter

  const results = settled
    .filter((r) => r?.value != null)
    .map((r) => r.value);

  console.log(`[devfolio] complete — ${results.length}/${rawList.length} hackathons scraped`);
  return results;
}
