import { useEffect, useState } from "react";
import { api } from "../api";
import HackathonCard from "../components/HackathonCard.jsx";

const PAGE_SIZE = 24;

function getPageButtons(currentPage, totalPages) {
  const raw = [1, totalPages, currentPage - 1, currentPage, currentPage + 1]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  return raw.reduce((acc, p) => {
    const prev = acc[acc.length - 1];
    if (typeof prev === "number" && p - prev > 1) acc.push("…");
    if (prev !== p) acc.push(p);
    return acc;
  }, []);
}

const EMPTY_Q = { search: "", theme: "", tech: "", mode: "", platform: "", difficulty: "", sort: "geminiRank" };

export default function Home() {
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [filters, setFilters] = useState({
    themes: [], technologies: [], modes: [], platforms: [], difficulties: [],
  });
  const [q, setQ] = useState(EMPTY_Q);
  const [minQuality, setMinQuality] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const loadPage = (pageNum, quality = minQuality) => {
    setLoading(true);
    api.list(buildQs(pageNum, quality))
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
        setPage(pageNum);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPage(1, minQuality); }, [q, minQuality]);

  const goToPage = (nextPage) => {
    if (nextPage < 1 || nextPage === page) return;
    loadPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const upd = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value }));
  const resetFilters = () => { setQ(EMPTY_Q); setMinQuality(0); };

  const difficultyLabels = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", all: "All levels" };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageButtons = getPageButtons(page, totalPages);

  return (
    <>
      <div className="discover-shell">
        {/* ---- Sidebar filters — fixed to the viewport's left edge ---- */}
        <aside className={`filters-sidebar${filtersOpen ? " open" : ""}`}>
          <div className="fs-head">
            <h3>Filters</h3>
            <button className="btn ghost sm" onClick={resetFilters}>Reset</button>
          </div>

          <label>Search</label>
          <input placeholder="AI, web3, climate…" value={q.search} onChange={upd("search")} />

          <label>Sort by</label>
          <select value={q.sort} onChange={upd("sort")}>
            <option value="geminiRank">Gemini rank</option>
            <option value="deadline">Deadline</option>
            <option value="newest">Newest</option>
            <option value="prize">Prize</option>
            <option value="quality">Quality</option>
          </select>

          <label>Platform</label>
          <select value={q.platform} onChange={upd("platform")}>
            <option value="">All platforms</option>
            {filters.platforms.map((p) => (
              <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
            ))}
          </select>

          <label>Difficulty</label>
          <select value={q.difficulty} onChange={upd("difficulty")}>
            <option value="">All levels</option>
            {filters.difficulties.map((d) => (
              <option key={d} value={d}>{difficultyLabels[d] || d}</option>
            ))}
          </select>

          <label>Theme</label>
          <select value={q.theme} onChange={upd("theme")}>
            <option value="">All</option>
            {filters.themes.map((t) => <option key={t}>{t}</option>)}
          </select>

          <label>Mode</label>
          <select value={q.mode} onChange={upd("mode")}>
            <option value="">All</option>
            {filters.modes.map((m) => <option key={m}>{m}</option>)}
          </select>

          <label>Min quality {minQuality > 0 ? `≥ ${minQuality}` : "(any)"}</label>
          <div className="quality-slider-wrap">
            <span className="val">0</span>
            <input
              type="range" min={0} max={10} step={1} value={minQuality}
              onChange={(e) => setMinQuality(Number(e.target.value))}
            />
            <span className="val">10</span>
          </div>
        </aside>

        {/* ---- Results ---- */}
        <div className="results-col">
          {/* Filters toggle — only visible on mobile, sits above the card list */}
          <button className="btn secondary filters-toggle" onClick={() => setFiltersOpen((o) => !o)}>
            ⚙ Filters {filtersOpen ? "▲" : "▼"}
          </button>

          <div className="muted" style={{ marginBottom: 12 }}>
            {loading && items.length === 0
              ? "Loading…"
              : `Showing ${items.length} of ${total} live & upcoming hackathons · Page ${page} of ${totalPages}`
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
              <div className="list">
                {items.map((h, idx) => (
                  <HackathonCard
                    key={h._id}
                    h={h}
                    rank={(page - 1) * PAGE_SIZE + idx + 1}
                    horizontal
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="pager">
                  <button className="btn secondary" onClick={() => goToPage(page - 1)} disabled={loading || page === 1}>
                    ← Prev
                  </button>

                  <div className="pager-pages">
                    {pageButtons.map((p, i) => (
                      p === "…" ? (
                        <span className="pager-ellipsis" key={`ellipsis-${i}`}>…</span>
                      ) : (
                        <button
                          key={p}
                          className={`pager-page${p === page ? " active" : ""}`}
                          onClick={() => goToPage(p)}
                          disabled={loading}
                        >
                          {p}
                        </button>
                      )
                    ))}
                  </div>

                  <button className="btn secondary" onClick={() => goToPage(page + 1)} disabled={loading || page === totalPages}>
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
