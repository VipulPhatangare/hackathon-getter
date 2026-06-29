# HackHub — AI-Powered Hackathon Discovery & Recommendation Platform

A MERN-stack platform that **aggregates hackathons from multiple sources** (Devpost, MLH,
Unstop, …), **normalizes** them into one schema, **de-duplicates** events that appear on
several platforms, and gives each user **personalized, explainable recommendations**.

```
hackthons/
├── backend/     Express + MongoDB API, scrapers, recommendation engine
└── frontend/    React (Vite) single-page app
```

## What's implemented

| Feature | Where |
|---|---|
| Unified hackathon schema (every source maps into it) | `backend/models/Hackathon.js` |
| Normalization helpers (dates, prizes, tags, modes) | `backend/scrapers/normalize.js` |
| Cross-platform de-duplication (fuzzy title match) | `backend/scrapers/dedupe.js` |
| Devpost scraper (public JSON endpoint) | `backend/scrapers/devpost.js` |
| Pluggable scraper registry + runner | `backend/scrapers/index.js` |
| Offline sample data (so the app works without internet) | `backend/scripts/sampleData.js` |
| Explainable recommendation engine ("why it matches") | `backend/services/recommend.js` |
| JWT auth + user profiles | `backend/routes/auth.js` |
| Search / filter / sort / detail / save API | `backend/routes/hackathons.js` |
| Scheduled scraping (cron, every 6h) | `backend/server.js` |
| React UI: Discover, For-You, Detail, Profile, Auth | `frontend/src/` |

## Prerequisites

- **Node.js 18+**
- **MongoDB** running locally (`mongodb://127.0.0.1:27017`) — or a free MongoDB Atlas URI.

## 1) Backend setup

```bash
cd backend
npm install
cp .env.example .env      # then edit .env (set MONGO_URI, JWT_SECRET)
```

Load data, then start the API:

```bash
# Load sample data + try the live Devpost scraper
npm run scrape -- --seed

# Start the API on http://localhost:5000
npm run dev
```

> No internet / Devpost shape changed? The `--seed` flag still loads realistic
> sample hackathons so the whole app is usable.

## 2) Frontend setup

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend on port 5000 (see `vite.config.js`),
so no extra config is needed.

## 3) Try it

1. Open http://localhost:5173 — browse/search hackathons on **Discover**.
2. Click **Sign up**, then fill in your **Profile** (interests, skills, mode, location).
3. Open **For You** — ranked recommendations with a match score and reasons.

## API reference (quick)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/hackathons` | – | list with `search,theme,tech,mode,status,sort,page,limit` |
| GET | `/api/hackathons/filters` | – | distinct themes/tech/modes for UI filters |
| GET | `/api/hackathons/:id` | – | single hackathon |
| GET | `/api/hackathons/recommended` | ✓ | personalized ranking + reasons |
| POST | `/api/hackathons/:id/save` | ✓ | bookmark toggle |
| POST | `/api/auth/register` `/login` | – | get JWT |
| GET | `/api/auth/me` | ✓ | current user |
| PUT | `/api/auth/profile` | ✓ | update recommendation profile |
| POST | `/api/admin/scrape` | – | trigger a scrape (dev convenience) |

## How to add another platform (e.g. MLH, Unstop)

1. Create `backend/scrapers/mlh.js` exporting `async function scrapeMLH()` that returns
   an array of objects in the unified shape (use the helpers in `normalize.js`).
   - JSON endpoint available? Use `axios` (like Devpost).
   - JS-rendered page? Add `puppeteer` and render it first.
2. Register it in `backend/scrapers/index.js`:
   ```js
   { name: "mlh", run: () => scrapeMLH() }
   ```
3. That's it — normalization, dedup, upsert, search and recommendations all work
   automatically because everything flows through the same schema.

## Roadmap / next steps

- **More scrapers**: MLH, Unstop, Devfolio (Puppeteer), Eventbrite/Luma (official APIs).
- **Semantic recommendations**: embed descriptions + user profile, rank by cosine
  similarity using MongoDB Atlas Vector Search. Swap into `services/recommend.js`.
- **Notifications**: email deadline reminders (Nodemailer/Resend) + new-match alerts.
- **Background jobs at scale**: move cron to BullMQ + Redis.

> ⚠️ **Note on scraping:** some platforms restrict scraping in their Terms of Service.
> Prefer official APIs where they exist; this project is structured for educational use.
