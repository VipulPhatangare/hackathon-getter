import { useEffect, useState, useCallback } from "react";
import { api } from "../api";

function fmtTime(d) {
  return d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";
}

function Switch({ checked, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

export default function Admin() {
  const [stats, setStats]       = useState(null);
  const [settings, setSettings] = useState(null);
  const [runs, setRuns]         = useState([]);
  const [toast, setToast]       = useState("");
  const [saving, setSaving]     = useState(false);

  // editable settings form
  const [form, setForm]   = useState(null);
  const [newGemini, setNewGemini]     = useState("");
  const [newExternal, setNewExternal] = useState("");

  // find & re-analyze a specific hackathon
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching]       = useState(false);
  const [reanalyzingId, setReanalyzingId] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };

  const loadStats = useCallback(() => api.adminStats().then(setStats).catch(() => {}), []);
  const loadRuns  = useCallback(() => api.adminRuns().then((d) => setRuns(d.runs)).catch(() => {}), []);

  useEffect(() => {
    loadStats();
    loadRuns();
    api.adminSettings().then((s) => {
      setSettings(s);
      setForm({
        systemPrompt: s.systemPrompt,
        legitimacyMin: s.legitimacyMin,
        qualityDefault: s.qualityDefault,
        autoScrapeEnabled: s.autoScrapeEnabled,
        autoAnalyzeAfterScrape: s.autoAnalyzeAfterScrape,
      });
    }).catch(() => {});
  }, [loadStats, loadRuns]);

  // Poll while a job is running so the UI reflects progress/completion.
  useEffect(() => {
    if (!stats?.scrapeRunning && !stats?.analyzeRunning) return;
    const t = setInterval(() => { loadStats(); loadRuns(); }, 4000);
    return () => clearInterval(t);
  }, [stats?.scrapeRunning, stats?.analyzeRunning, loadStats, loadRuns]);

  async function runScrape() {
    try { await api.adminScrape(); showToast("Scrape started"); loadStats(); loadRuns(); }
    catch (e) { showToast(e.message); }
  }
  async function runAnalyze() {
    try { await api.adminAnalyze(); showToast("Analysis started"); loadStats(); loadRuns(); }
    catch (e) { showToast(e.message); }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const body = { ...form };
      if (newGemini.trim())   body.geminiApiKey   = newGemini.trim();
      if (newExternal.trim()) body.externalApiKey = newExternal.trim();
      await api.adminSaveSettings(body);
      setNewGemini(""); setNewExternal("");
      const s = await api.adminSettings();
      setSettings(s);
      showToast("Settings saved");
      loadStats();
    } catch (e) { showToast(e.message); }
    finally { setSaving(false); }
  }

  const upd = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function runSearch(e) {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const d = await api.list(`?search=${encodeURIComponent(searchQuery.trim())}&limit=15`);
      setSearchResults(d.items);
    } catch (e) {
      showToast(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function reanalyzeOne(id) {
    setReanalyzingId(id);
    try {
      await api.reanalyze(id);
      showToast("Re-analyzed");
      setSearchResults((items) => items.map((h) => (h._id === id ? { ...h, _reanalyzed: true } : h)));
      loadStats();
    } catch (e) {
      showToast(e.message);
    } finally {
      setReanalyzingId(null);
    }
  }

  if (!stats || !form) return <div className="container empty">Loading dashboard…</div>;

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="admin-head">
        <h1>Admin dashboard</h1>
        <span className={`badge ${stats.geminiConfigured ? "on" : "off"}`}>
          Gemini {stats.geminiConfigured ? "connected" : "not configured"}
        </span>
      </div>

      {/* ---- Stats ---- */}
      <div className="stat-grid">
        <div className="stat"><div className="num">{stats.total}</div><div className="lbl">Total hackathons</div></div>
        <div className="stat ok"><div className="num">{stats.analyzed}</div><div className="lbl">AI-analyzed</div></div>
        <div className="stat warn"><div className="num">{stats.pending}</div><div className="lbl">Pending analysis</div></div>
        <div className="stat accent"><div className="num">{stats.byPlatform?.length || 0}</div><div className="lbl">Sources</div></div>
      </div>

      {/* ---- Manual jobs ---- */}
      <div className="panel">
        <h2>Run jobs manually</h2>
        <p className="sub">Auto scrape + analyze also runs every morning at 6:00 AM IST.</p>
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <button className="btn" onClick={runScrape} disabled={stats.scrapeRunning}>
            {stats.scrapeRunning ? "Scraping…" : "↻ Scrape now"}
          </button>
          <button className="btn secondary" onClick={runAnalyze} disabled={stats.analyzeRunning || !stats.geminiConfigured}>
            {stats.analyzeRunning ? "Analyzing…" : "✦ Analyze pending"}
          </button>
          {stats.scrapeRunning && <span className="badge run">scrape running</span>}
          {stats.analyzeRunning && <span className="badge run">analysis running</span>}
        </div>
        <div className="row" style={{ gap: 24, marginTop: 14, flexWrap: "wrap", fontSize: 13 }}>
          <span className="muted">Last scrape: <b>{fmtTime(stats.lastScrapeAt)}</b>
            {stats.lastScrapeSummary && <> · +{stats.lastScrapeSummary.inserted ?? 0} new, {stats.lastScrapeSummary.updated ?? 0} updated</>}</span>
          <span className="muted">Last analyze: <b>{fmtTime(stats.lastAnalyzeAt)}</b>
            {stats.lastAnalyzeSummary && <> · ✓{stats.lastAnalyzeSummary.succeeded ?? 0} ✗{stats.lastAnalyzeSummary.failed ?? 0}</>}</span>
        </div>
      </div>

      {/* ---- Find & re-analyze a specific hackathon ---- */}
      <div className="panel">
        <h2>Re-analyze a hackathon</h2>
        <p className="sub">Search by title, then force a fresh Gemini analysis for one result. (The public site no longer exposes this — admin only.)</p>
        <form className="row" onSubmit={runSearch} style={{ gap: 8 }}>
          <input
            placeholder="Search by title…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn secondary" disabled={searching || !searchQuery.trim()}>
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {searchResults && (
          searchResults.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>No matches.</p>
          ) : (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="table">
                <thead><tr><th>Title</th><th>Platform</th><th>Analyzed</th><th></th></tr></thead>
                <tbody>
                  {searchResults.map((h) => (
                    <tr key={h._id}>
                      <td style={{ maxWidth: 320 }}>{h.title}</td>
                      <td style={{ textTransform: "capitalize" }}>{h.sourcePlatform}</td>
                      <td>
                        <span className={`badge ${h.aiAnalysis?.analyzedAt ? "on" : "off"}`}>
                          {h.aiAnalysis?.analyzedAt ? "yes" : "no"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn ghost sm"
                          onClick={() => reanalyzeOne(h._id)}
                          disabled={reanalyzingId === h._id}
                        >
                          {reanalyzingId === h._id ? "Analyzing…" : h._reanalyzed ? "✓ Done" : "⟳ Re-analyze"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ---- Per-platform ---- */}
      {stats.byPlatform?.length > 0 && (
        <div className="panel">
          <h2>By source</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Platform</th><th>Total</th><th>Analyzed</th></tr></thead>
              <tbody>
                {stats.byPlatform.map((p) => (
                  <tr key={p._id}><td style={{ textTransform: "capitalize" }}>{p._id}</td><td>{p.total}</td><td>{p.analyzed}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Automation + thresholds ---- */}
      <div className="panel">
        <h2>Automation & filters</h2>
        <p className="sub">Changes take effect immediately — no redeploy.</p>
        <div className="toggle-row">
          <div><b>Auto scrape at 6 AM IST</b><div className="muted" style={{ fontSize: 12 }}>Daily scheduled scrape</div></div>
          <Switch checked={form.autoScrapeEnabled} onChange={upd("autoScrapeEnabled")} />
        </div>
        <div className="toggle-row">
          <div><b>Auto-analyze after scrape</b><div className="muted" style={{ fontSize: 12 }}>Run Gemini on new hackathons right after the morning scrape</div></div>
          <Switch checked={form.autoAnalyzeAfterScrape} onChange={upd("autoAnalyzeAfterScrape")} />
        </div>
        <div className="row" style={{ gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label>Legitimacy threshold (hide below)</label>
            <input type="number" min={0} max={10} value={form.legitimacyMin}
              onChange={(e) => upd("legitimacyMin")(Number(e.target.value))} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label>Default min-quality slider</label>
            <input type="number" min={0} max={10} value={form.qualityDefault}
              onChange={(e) => upd("qualityDefault")(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* ---- System prompt ---- */}
      <div className="panel">
        <h2>Gemini system prompt</h2>
        <p className="sub">Instructions sent to the analyzer. Leave blank to use the built-in default.</p>
        <textarea rows={10} value={form.systemPrompt}
          placeholder={settings.defaultPrompt}
          onChange={(e) => upd("systemPrompt")(e.target.value)} />
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <button className="btn ghost sm" onClick={() => upd("systemPrompt")(settings.defaultPrompt)}>Load default</button>
          <button className="btn ghost sm" onClick={() => upd("systemPrompt")("")}>Clear (use default)</button>
        </div>
      </div>

      {/* ---- API keys ---- */}
      <div className="panel">
        <h2>API keys</h2>
        <p className="sub">Keys are stored securely and never shown in full. Leave blank to keep the current key.</p>
        <label>Gemini API key {settings.geminiApiKey?.set
          ? <span className="badge on">set {settings.geminiApiKey.hint}</span>
          : <span className="badge off">using .env / none</span>}</label>
        <input type="password" placeholder="Enter new Gemini key to replace" value={newGemini} onChange={(e) => setNewGemini(e.target.value)} />
        <label style={{ marginTop: 14 }}>External (server-to-server) API key {settings.externalApiKey?.set
          ? <span className="badge on">set {settings.externalApiKey.hint}</span>
          : <span className="badge off">using default</span>}</label>
        <input type="password" placeholder="Enter new external key to replace" value={newExternal} onChange={(e) => setNewExternal(e.target.value)} />
      </div>

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button className="btn" onClick={saveSettings} disabled={saving}>
          {saving ? "Saving…" : "Save all settings"}
        </button>
      </div>

      {/* ---- Run history ---- */}
      <div className="panel">
        <h2>Recent runs</h2>
        {runs.length === 0 ? <p className="muted">No runs yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Type</th><th>Trigger</th><th>Status</th><th>Started</th><th>Result</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r._id}>
                    <td style={{ textTransform: "capitalize" }}>{r.type}</td>
                    <td>{r.trigger}</td>
                    <td><span className={`badge ${r.status === "success" ? "on" : r.status === "failed" ? "off" : "run"}`}>{r.status}</span></td>
                    <td>{fmtTime(r.startedAt)}</td>
                    <td className="muted">
                      {r.error ? r.error
                        : r.type === "scrape" && r.summary ? `+${r.summary.inserted ?? 0} new, ${r.summary.updated ?? 0} upd`
                        : r.type === "analyze" && r.summary ? `✓${r.summary.succeeded ?? 0} ✗${r.summary.failed ?? 0}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
