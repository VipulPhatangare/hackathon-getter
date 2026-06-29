import express from "express";
import User from "../models/User.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "name, email and password are required" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const user = new User({ name, email });
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
