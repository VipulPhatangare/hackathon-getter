import { upsertHackathon } from "../scrapers/dedupe.js";
import { buildDedupeKey } from "../scrapers/normalize.js";

/**
 * A handful of realistic hackathons so the app has data even when offline
 * or when a live source's HTML/JSON shape changes. Used by `npm run scrape -- --seed`.
 */
function daysFromNow(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const SAMPLES = [
  {
    title: "Global AI Innovation Hackathon 2026",
    description:
      "Build AI-powered products solving real-world problems. Open to students and professionals worldwide.",
    organizer: "OpenAI Community",
    themes: ["AI", "Machine Learning", "Generative AI"],
    technologies: ["Python", "React", "Node.js"],
    mode: "online",
    location: { city: "Online", country: "Global" },
    prizePool: { amount: 50000, currency: "USD" },
    teamSize: { min: 1, max: 4 },
    start: 7,
    end: 14,
    reg: 5,
  },
  {
    title: "Web3 & Blockchain BuildFest",
    description: "A weekend to ship decentralized apps, smart contracts and DeFi tooling.",
    organizer: "ETHIndia",
    themes: ["Web3", "Blockchain"],
    technologies: ["Solidity", "JavaScript", "React"],
    mode: "hybrid",
    location: { city: "Bengaluru", country: "India" },
    prizePool: { amount: 1000000, currency: "INR" },
    teamSize: { min: 2, max: 5 },
    start: 20,
    end: 22,
    reg: 15,
  },
  {
    title: "HealthTech for Bharat Hackathon",
    description: "Design technology that improves healthcare access in rural India.",
    organizer: "Hack2Skill",
    themes: ["HealthTech", "AI", "IoT"],
    technologies: ["Python", "Flutter", "Node.js"],
    mode: "offline",
    location: { city: "Pune", country: "India" },
    prizePool: { amount: 200000, currency: "INR" },
    teamSize: { min: 1, max: 4 },
    start: 30,
    end: 31,
    reg: 25,
  },
  {
    title: "Climate Action Data Challenge",
    description: "Use open datasets to model, visualize and combat climate change.",
    organizer: "MLH",
    themes: ["Sustainability", "Data Science", "AI"],
    technologies: ["Python", "JavaScript"],
    mode: "online",
    location: { city: "Online", country: "Global" },
    prizePool: { amount: 15000, currency: "USD" },
    teamSize: { min: 1, max: 3 },
    start: 12,
    end: 14,
    reg: 9,
  },
];

export async function seedSampleData() {
  let count = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const submissionDeadline = daysFromNow(s.end);
    const doc = {
      sourcePlatform: "sample",
      sourceId: `sample-${i + 1}`,
      sourceUrl: `https://example.com/hackathons/sample-${i + 1}`,
      title: s.title,
      description: s.description,
      organizer: s.organizer,
      bannerImage: "",
      themes: s.themes,
      technologies: s.technologies,
      mode: s.mode,
      location: s.location,
      eligibility: "Open",
      teamSize: s.teamSize,
      registrationDeadline: daysFromNow(s.reg),
      submissionDeadline,
      startDate: daysFromNow(s.start),
      endDate: submissionDeadline,
      prizePool: s.prizePool,
      registrationUrl: `https://example.com/hackathons/sample-${i + 1}/register`,
      dedupeKey: buildDedupeKey(s.title, daysFromNow(s.start)),
    };
    await upsertHackathon(doc);
    count += 1;
  }
  return count;
}
