import { useEffect, useState } from "react";
import { api } from "../api";
import HackathonCard from "../components/HackathonCard.jsx";

const PAGE_SIZE = 24;

export default function Home() {
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [filters, setFilters] = useState({
    themes: [], technologies: [], modes: [], platforms: [], difficulties: [],
  });
  const [q, setQ] = useState({
    search: "", theme: "", tech: "", mode: "", platform: "",
    difficulty: "", sort: "deadline",
  });
  const [minQuality, setMinQuality] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.filters().then(setFilters).catch(() => {});
  }, []);

  const buildQs = (pageNum, quality = minQuality) => {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => v && params.set(k, v));
    if (quality > 0) params.set("minQuality", quality);
    params.set("page", pageNum);
    params.set("limit", PAGE_SIZE);
    return `?${params.toString()}`;
  };

  const fetchPage1 = (quality = minQuality) => {
    setLoading(true);
    setPage(1);
    api.list(buildQs(1, quality))
      .then((d) => { setItems(d.items); setTotal(d.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPage1(); }, [q]);                          // filter change
  useEffect(() => { fetchPage1(minQuality); }, [minQuality]);       // slider change

  const loadMore = () => {
    const next = page + 1;
    setLoading(true);
    api.list(buildQs(next))
      .then((d) => { setItems((p) => [...p, ...d.items]); setTotal(d.total); setPage(next); })
      .finally(() => setLoading(false));
  };

  const upd = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value }));

  const difficultyLabels = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", all: "All levels" };

  return (
    <div className="container">
      <div className="hero">
        <h1>Every hackathon, in one place.</h1>
        <p>
          Aggregated from Devpost, Devfolio, and Unstop — AI-analyzed, de-duplicated, and searchable.
        </p>
      </div>

      <div className="filters">
        {/* Search */}
        <div style={{ flex: 2, minWidth: 180 }}>
          <label>Search</label>
          <input placeholder="AI, web3, climate…" value={q.search} onChange={upd("search")} />
        </div>

        {/* Platform */}
        <div>
          <label>Platform</label>
          <select value={q.platform} onChange={upd("platform")}>
            <option value="">All platforms</option>
            {filters.platforms.map((p) => (
              <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Difficulty */}
        <div>
          <label>Difficulty</label>
          <select value={q.difficulty} onChange={upd("difficulty")}>
            <option value="">All levels</option>
            {filters.difficulties.map((d) => (
              <option key={d} value={d}>{difficultyLabels[d] || d}</option>
            ))}
          </select>
        </div>

        {/* Theme */}
        <div>
          <label>Theme</label>
          <select value={q.theme} onChange={upd("theme")}>
            <option value="">All</option>
            {filters.themes.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Mode */}
        <div>
          <label>Mode</label>
          <select value={q.mode} onChange={upd("mode")}>
            <option value="">All</option>
            {filters.modes.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>

        {/* Sort */}
        <div>
          <label>Sort</label>
          <select value={q.sort} onChange={upd("sort")}>
            <option value="deadline">Deadline</option>
            <option value="newest">Newest</option>
            <option value="prize">Prize</option>
            <option value="quality">Quality</option>
          </select>
        </div>

        {/* Quality slider */}
        <div style={{ minWidth: 160 }}>
          <label>Min quality {minQuality > 0 ? `≥ ${minQuality}` : "(any)"}</label>
          <div className="quality-slider-wrap">
            <span className="val">0</span>
            <input
              type="range" min={0} max={10} step={1} value={minQuality}
              onChange={(e) => setMinQuality(Number(e.target.value))}
            />
            <span className="val">10</span>
          </div>
        </div>
      </div>

      <div className="muted" style={{ marginBottom: 12 }}>
        {loading && items.length === 0
          ? "Loading…"
          : `Showing ${items.length} of ${total} live & upcoming hackathons`
        }
        {minQuality > 0 && (
          <span style={{ marginLeft: 10, color: "var(--accent-2)", fontSize: 12 }}>
            · quality ≥ {minQuality} filter active
          </span>
        )}
      </div>

      {items.length === 0 && !loading ? (
        <div className="empty">
          No hackathons match these filters.
          {minQuality > 0 && (
            <> Try lowering the quality slider. <button className="btn ghost" onClick={() => setMinQuality(0)}>Reset</button></>
          )}
        </div>
      ) : (
        <>
          <div className="grid">
            {items.map((h) => <HackathonCard key={h._id} h={h} />)}
          </div>
          {items.length < total && (
            <div style={{ textAlign: "center", margin: "24px 0" }}>
              <button className="btn" onClick={loadMore} disabled={loading}>
                {loading ? "Loading…" : `Load more (${total - items.length} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
