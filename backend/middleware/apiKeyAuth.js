// Base64 of "hackathons_for_synthomind" — used as a shared API key for
// server-to-server access (no user login required).
const DEFAULT_KEY = "aGFja2F0aG9uc19mb3Jfc3ludGhvbWluZA==";

const EXPECTED_KEY = () => process.env.EXTERNAL_API_KEY || DEFAULT_KEY;

/**
 * Require the encoded API key, sent either as the "x-api-key" header
 * or as "apiKey" in the JSON body.
 */
export function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.body?.apiKey;
  if (!key || key !== EXPECTED_KEY()) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}
