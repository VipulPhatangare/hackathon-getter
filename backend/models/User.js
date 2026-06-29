import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    // ----- profile used by the recommendation engine -----
    interests: { type: [String], default: [] }, // themes the user cares about
    skills: { type: [String], default: [] }, // technologies the user knows
    experienceLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    preferredMode: {
      type: String,
      enum: ["online", "offline", "hybrid", "any"],
      default: "any",
    },
    location: {
      city: { type: String, default: "" },
      country: { type: String, default: "" },
    },

    // events the user bookmarked
    savedHackathons: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hackathon" }],
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model("User", userSchema);
