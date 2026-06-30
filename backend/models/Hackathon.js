import mongoose from "mongoose";

/**
 * The unified hackathon schema. Every scraper, no matter the source platform,
 * MUST transform its raw data into this exact shape. This single normalization
 * point is what makes cross-platform search, filtering and dedup possible.
 */
const hackathonSchema = new mongoose.Schema(
  {
    // ----- provenance -----
    sourcePlatform: { type: String, required: true, index: true }, // "devpost", "mlh", ...
    sourceId: { type: String, required: true }, // the platform's own id
    sourceUrl: { type: String, required: true },
    // when the same event is found on multiple platforms we keep every link here
    sourceUrls: [{ platform: String, url: String }],

    // ----- core info -----
    title: { type: String, required: true, index: "text" },
    description: { type: String, default: "" },
    organizer: { type: String, default: "" },
    bannerImage: { type: String, default: "" },

    // ----- normalized tags -----
    themes: { type: [String], default: [], index: true }, // ["AI", "Web3"]
    technologies: { type: [String], default: [], index: true }, // ["Python", "React"]

    // ----- participation -----
    mode: { type: String, enum: ["online", "offline", "hybrid", "unknown"], default: "unknown" },
    location: {
      city: { type: String, default: "" },
      country: { type: String, default: "" },
    },
    eligibility: { type: String, default: "" },
    teamSize: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
    },

    // ----- timeline (ALL dates stored as UTC Date objects) -----
    registrationDeadline: { type: Date, default: null },
    submissionDeadline: { type: Date, default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    // ----- prizes -----
    prizePool: {
      amount: { type: Number, default: null },
      currency: { type: String, default: "" },
    },

    // ----- links -----
    registrationUrl: { type: String, default: "" },

    // ----- extended fields (Devfolio + future platforms) -----
    tagline: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    participantsCount: { type: Number, default: null },
    timezone: { type: String, default: "" },
    socialLinks: {
      instagram: { type: String, default: "" },
      linkedin: { type: String, default: "" },
      discord: { type: String, default: "" },
      telegram: { type: String, default: "" },
    },
    faqs: [
      {
        question: { type: String, default: "" },
        answer: { type: String, default: "" },
      },
    ],
    sponsors: [
      {
        name: { type: String, default: "" },
        domain: { type: String, default: "" },
        logo: { type: String, default: "" },
        tier: { type: String, default: "" },
      },
    ],
    prizes: [
      {
        name: { type: String, default: "" },
        amount: { type: Number, default: null },
        currency: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    ],
    schedule: [
      {
        group: { type: String, default: "" },
        title: { type: String, default: "" },
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
        description: { type: String, default: "" },
      },
    ],

    // ----- participation count (refreshed every scrape) -----
    registrationsCount: { type: Number, default: null },

    // ----- Gemini AI analysis (written once, never overwritten by scraper) -----
    aiAnalysis: {
      analyzedAt:      { type: Date, default: null },   // null = not yet analyzed (the gate field)
      model:           { type: String, default: "" },
      summary:         { type: String, default: "" },   // 2-3 sentence clean description
      longDescription: { type: String, default: "" },   // 300-1000 word in-depth write-up
      pitch:           { type: String, default: "" },   // 1-sentence "why join this"
      difficulty:      { type: String, default: "" },   // beginner | intermediate | advanced | all
      targetAudience:  { type: String, default: "" },
      requirements:    { type: String, default: "" },
      judgingCriteria: { type: [String], default: [] },
      highlights:      { type: [String], default: [] }, // 3 key bullets for card/detail
      legitimacyScore: { type: Number, default: null }, // 1-10; gate: hide < LEGITIMACY_MIN
      qualityScore:    { type: Number, default: null }, // 1-10; UI quality-filter slider
      rankScore:       { type: Number, default: null }, // 1-10; overall Gemini ranking score
    },

    // ----- system fields -----
    dedupeKey: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["upcoming", "ongoing", "ended", "unknown"],
      default: "unknown",
      index: true,
    },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One logical record per (platform, sourceId) — used for idempotent upserts.
hackathonSchema.index({ sourcePlatform: 1, sourceId: 1 }, { unique: true });

// Recompute status from dates whenever we save.
hackathonSchema.methods.recomputeStatus = function () {
  const now = new Date();
  if (this.endDate && this.endDate < now) this.status = "ended";
  else if (this.startDate && this.startDate <= now) this.status = "ongoing";
  else if (this.startDate && this.startDate > now) this.status = "upcoming";
  // No usable dates (e.g. Devpost has no startDate): keep the status the scraper
  // supplied (from open_state); only fall back to "unknown" if none was set.
  else if (!this.status) this.status = "unknown";
  return this.status;
};

export default mongoose.model("Hackathon", hackathonSchema);
