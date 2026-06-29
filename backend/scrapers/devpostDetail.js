import axios from "axios";
import * as cheerio from "cheerio";
import { pathToFileURL } from "node:url";

/**
 * Devpost detail scraper.
 *
 * The JS port of the Python Playwright+BeautifulSoup script. Devpost challenge
 * pages (e.g. https://xprize.devpost.com/) are fully server-rendered, so unlike
 * the Python version we do NOT need a headless browser — plain axios + cheerio
 * (the same stack devfolio.js uses) gets identical results and is far faster.
 *
 * Pulls the rich fields the listing API (devpost.js) doesn't expose: full
 * requirements text, per-prize breakdown, judges and judging criteria.
 */

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/** Collapsed text content of the first match, or "" when absent. */
function text($el, separator = "") {
  if (!$el || $el.length === 0) return "";
  return $el.text().replace(/\s+/g, " ").trim().length
    ? separator
      ? $el.text().split("\n").map((s) => s.trim()).filter(Boolean).join(separator)
      : $el.text().replace(/\s+/g, " ").trim()
    : "";
}

/**
 * Scrape a single Devpost challenge page.
 * @param {string} url  e.g. "https://xprize.devpost.com/"
 * @returns {Promise<object>} structured detail data
 */
export async function scrapeDevpostDetail(url) {
  const { data: html } = await axios.get(url, {
    headers: HEADERS,
    timeout: 30_000,
  });
  const $ = cheerio.load(html);

  const data = { url };

  // ── Basic info ──────────────────────────────────────────────────────────
  data.title = text($("#introduction h1").first());
  data.tagline = text($("#introduction h3").first(), " ");

  // ── Full description ──────────────────────────────────────────────────────
  // The Devpost listing API exposes NO description at all, so this is the only
  // place to get one. #challenge-description holds the rich overview text.
  const desc = $("article#challenge-description").first();
  data.description = desc.length ? desc.text().replace(/\s+/g, " ").trim() : "";

  // ── Deadline ────────────────────────────────────────────────────────────
  data.deadline = text($("[data-dates-text]").first(), " ");

  // ── Organizer ───────────────────────────────────────────────────────────
  data.organizer = text($(".host-label").first());

  // ── Themes ──────────────────────────────────────────────────────────────
  data.themes = $(".theme-label")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  // ── Requirements ────────────────────────────────────────────────────────
  data.requirements = text($("article#challenge-requirements").first(), "\n");

  // ── Prizes ──────────────────────────────────────────────────────────────
  data.prizes = $("article#prizes .prize")
    .map((_, el) => {
      const $p = $(el);
      return {
        title: text($p.find(".prize-title div").first()),
        value: text($p.find(".prize-value").first(), " "),
        winners: text($p.find(".prize-winners").first()),
      };
    })
    .get();

  // ── Judges ──────────────────────────────────────────────────────────────
  data.judges = $("#judges .challenge_judge")
    .map((_, el) => $(el).find("strong").first().text().trim())
    .get()
    .filter(Boolean);

  // ── Judging criteria ────────────────────────────────────────────────────
  data.judgingCriteria = $("#judging-criteria li")
    .map((_, el) => {
      const $li = $(el);
      return {
        criterion: $li.find("strong").first().text().trim(),
        description: $li.text().replace(/\s+/g, " ").trim(),
      };
    })
    .get();

  return data;
}

// ── CLI: `node scrapers/devpostDetail.js <url>` ─────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.argv[2] || "https://xprize.devpost.com/";
  scrapeDevpostDetail(url)
    .then((d) => console.log(JSON.stringify(d, null, 4)))
    .catch((e) => {
      console.error("[devpostDetail] failed:", e.message);
      process.exit(1);
    });
}
