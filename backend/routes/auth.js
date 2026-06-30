import express from "express";
import User from "../models/User.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Emails listed here (or in ADMIN_EMAILS, comma-separated) are auto-promoted to
// admin on register/login, so the dashboard is available without manual DB edits.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "deepakmbhosale@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const isAdminEmail = (email) => ADMIN_EMAILS.includes((email || "").toLowerCase());

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "name, email and password are required" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const user = new User({ name, email, isAdmin: isAdminEmail(email) });
    await user.setPassword(password);
    await user.save();

    return res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await user.verifyPassword(password || "");
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // Keep admin status in sync if the email was added to ADMIN_EMAILS later.
    if (isAdminEmail(user.email) && !user.isAdmin) {
      user.isAdmin = true;
      await user.save();
    }

    return res.json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

// PUT /api/auth/profile  -> update recommendation profile
router.put("/profile", requireAuth, async (req, res) => {
  const fields = ["interests", "skills", "experienceLevel", "preferredMode", "location"];
  for (const f of fields) {
    if (req.body[f] !== undefined) req.user[f] = req.body[f];
  }
  await req.user.save();
  res.json({ user: req.user.toSafeJSON() });
});

export default router;
