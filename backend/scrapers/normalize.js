/**
 * Shared helpers every scraper uses to turn messy source data into the
 * unified Hackathon shape.
 */

// Map of common technology/theme aliases -> canonical name.
const CANON = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  reactjs: "React",
  react: "React",
  node: "Node.js",
  nodejs: "Node.js",
  py: "Python",
  python: "Python",
  ml: "Machine Learning",
  "machine learning": "Machine Learning",
  ai: "AI",
  "artificial intelligence": "AI",
  genai: "Generative AI",
  blockchain: "Blockchain",
  web3: "Web3",
  iot: "IoT",
  ar: "AR/VR",
  vr: "AR/VR",
};

export function canonTag(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  return CANON[key] || raw.trim();
}

export function canonTags(list = []) {
  const out = new Set();
  for (const t of list) {
    const c = canonTag(t);
    if (c) out.add(c);
  }
  return [...out];
}

/** Parse a date-ish value into a UTC Date, or null if unparseable. */
export function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Parse a prize string like "$50,000" / "₹1,00,000" into { amount, currency }. */
export function parsePrize(raw) {
  if (raw == null) return { amount: null, currency: "" };
  if (typeof raw === "number") return { amount: raw, currency: "" };
  const str = String(raw);
  let currency = "";
  if (/\$|usd/i.test(str)) currency = "USD";
  else if (/₹|inr|rs\.?/i.test(str)) currency = "INR";
  else if (/€|eur/i.test(str)) currency = "EUR";
  else if (/£|gbp/i.test(str)) currency = "GBP";
  const digits = str.replace(/[^0-9]/g, "");
  const amount = digits ? Number(digits) : null;
  return { amount, currency };
}

/** Normalize participation mode text into our enum. */
export function normalizeMode(raw) {
  if (!raw) return "unknown";
  const s = String(raw).toLowerCase();
  if (s.includes("hybrid")) return "hybrid";
  if (s.includes("online") || s.includes("virtual") || s.includes("remote")) return "online";
  if (s.includes("offline") || s.includes("in-person") || s.includes("in person")) return "offline";
  return "unknown";
}

/**
 * Build a stable dedupe key from a title + a reference date.
 * Same event across platforms -> (almost) the same key.
 */
export function buildDedupeKey(title, refDate) {
  const slug = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  let month = "na";
  const d = toDate(refDate);
  if (d) month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${slug}|${month}`;
}
