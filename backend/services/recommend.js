/**
 * Transparent, explainable recommendation scoring.
 *
 * No ML needed to start: we score each hackathon against the user's profile
 * across a few weighted signals and return the reasons behind the score so the
 * UI can show "why this matches". Swap in embeddings later without changing
 * the API — just replace computeScore().
 */

const WEIGHTS = {
  interestOverlap: 35, // themes the user cares about
  skillOverlap: 30, // technologies the user knows
  modeMatch: 10,
  locationMatch: 10,
  deadlineUrgency: 10, // sooner (but not passed) = slightly higher
  prizeBonus: 5,
};

function overlap(a = [], b = []) {
  const setB = new Set(b.map((x) => String(x).toLowerCase()));
  const hits = a.filter((x) => setB.has(String(x).toLowerCase()));
  const ratio = a.length ? hits.length / a.length : 0;
  return { hits, ratio };
}

/** Score a single hackathon for a user. Returns { score, reasons }. */
export function scoreHackathon(user, h) {
  let score = 0;
  const reasons = [];

  // interests vs themes
  const interest = overlap(user.interests || [], h.themes || []);
  if (interest.hits.length) {
    score += WEIGHTS.interestOverlap * interest.ratio;
    reasons.push(`Matches your interests: ${interest.hits.join(", ")}`);
  }

  // skills vs technologies
  const skill = overlap(user.skills || [], h.technologies || []);
  if (skill.hits.length) {
    score += WEIGHTS.skillOverlap * skill.ratio;
    reasons.push(`Uses your skills: ${skill.hits.join(", ")}`);
  }

  // mode
  if (user.preferredMode && user.preferredMode !== "any" && h.mode === user.preferredMode) {
    score += WEIGHTS.modeMatch;
    reasons.push(`Runs in your preferred mode (${h.mode})`);
  }

  // location
  if (
    user.location?.country &&
    h.location?.country &&
    user.location.country.toLowerCase() === h.location.country.toLowerCase()
  ) {
    score += WEIGHTS.locationMatch;
    reasons.push(`Located in ${h.location.country}`);
  }

  // deadline urgency (favor events whose deadline is soon but not passed)
  const deadline = h.registrationDeadline || h.submissionDeadline;
  if (deadline) {
    const days = (new Date(deadline) - Date.now()) / (1000 * 60 * 60 * 24);
    if (days > 0 && days <= 30) {
      score += WEIGHTS.deadlineUrgency * (1 - days / 30);
      reasons.push(`Registration closes in ${Math.ceil(days)} day(s)`);
    }
  }

  // prize bonus (mild, log-scaled so big pools don't dominate)
  if (h.prizePool?.amount) {
    const bonus = Math.min(1, Math.log10(h.prizePool.amount) / 6);
    score += WEIGHTS.prizeBonus * bonus;
  }

  return { score: Math.round(score * 10) / 10, reasons };
}

/** Rank a list of hackathons for a user. Only future/ongoing events. */
export function recommendForUser(user, hackathons, limit = 20) {
  return hackathons
    .filter((h) => h.status !== "ended")
    .map((h) => {
      const { score, reasons } = scoreHackathon(user, h);
      return { hackathon: h, score, reasons };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
