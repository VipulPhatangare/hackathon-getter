import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";

/**
 * Create or update an admin user.
 *
 * Usage:
 *   node scripts/createAdmin.js <email> <password> [name]
 *
 * If the user already exists, their password is reset and isAdmin is set true.
 */
async function main() {
  const [, , email, password, name = "Admin"] = process.argv;
  if (!email || !password) {
    console.error("Usage: node scripts/createAdmin.js <email> <password> [name]");
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.isAdmin = true;
    await user.setPassword(password);
    await user.save();
    console.log(`✓ Updated existing user as admin: ${user.email}`);
  } else {
    user = new User({ name, email: email.toLowerCase(), isAdmin: true });
    await user.setPassword(password);
    await user.save();
    console.log(`✓ Created admin user: ${user.email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
