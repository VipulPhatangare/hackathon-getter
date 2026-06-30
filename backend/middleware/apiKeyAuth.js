import { resolveExternalKey } from "../services/settings.js";

/**
 * Require the encoded API key, sent either as the "x-api-key" header
 * or as "apiKey" in the JSON body. The expected key is resolved from the
 * admin-editable Settings (DB override → env → built-in default).
 */
export async function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.body?.apiKey;
  const expected = await resolveExternalKey();
  if (!key || key !== expected) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}
