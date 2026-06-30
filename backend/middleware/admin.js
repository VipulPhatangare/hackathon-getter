import { requireAuth } from "./auth.js";

/**
 * Admin gate: a valid JWT whose user has isAdmin === true.
 * Runs requireAuth first (which attaches req.user), then checks the flag.
 */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  });
}
