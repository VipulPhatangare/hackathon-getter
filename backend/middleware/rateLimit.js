/**
 * Minimal in-memory fixed-window rate limiter — no extra dependency needed for
 * a single-process app. Keyed by IP, used to stop the public Gemini chat
 * endpoint from being hammered (it costs real API quota per message).
 */
export function rateLimit({ windowMs = 10 * 60 * 1000, max = 20 } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      return res.status(429).json({ error: "Too many requests — please slow down and try again shortly." });
    }
    next();
  };
}
