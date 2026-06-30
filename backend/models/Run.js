import mongoose from "mongoose";

/**
 * One record per scrape or analyze execution — powers the "run history" panel
 * on the admin dashboard so you can see what ran, when, by what trigger, and
 * how it went.
 */
const runSchema = new mongoose.Schema(
  {
    type:    { type: String, enum: ["scrape", "analyze"], required: true, index: true },
    trigger: { type: String, enum: ["manual", "cron"], default: "manual" },
    status:  { type: String, enum: ["running", "success", "failed"], default: "running", index: true },
    summary: { type: mongoose.Schema.Types.Mixed, default: null }, // counts / stats
    error:   { type: String, default: "" },
    startedAt:  { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Run", runSchema);
