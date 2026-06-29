import jwt from "jsonwebtoken";
import User from "../models/User.js";

const SECRET = () => process.env.JWT_SECRET || "dev_secret_change_me";

export function signToken(user) {
  return jwt.sign({ id: user._id }, SECRET(), { expiresIn: "7d" });
}

/** Require a valid Bearer token; attaches req.user. */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const payload = jwt.verify(token, SECRET());
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ error: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
