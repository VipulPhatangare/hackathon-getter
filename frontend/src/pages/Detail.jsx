import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import "../styles.css";

function fmt(d) {
  return d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "TBA";
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "TBA";
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 12px", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function PrizeBreakdown({ prizes }) {
  if (!prizes?.length) return null;
  return (
    <Section title="Prizes">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {prizes.map((p, i) => (
          <div key={i} className="card" style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: "12px 16px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{p.name || `Prize ${i + 1}`}</div>
              {p.description && <div className="meta" style={{ marginTop: 2 }}>{p.description}</div>}
            </div>
            {p.amount != null && (
              <div style={{ fontWeight: 800, color: "var(--accent-2)", fontSize: 16, whiteSpace: "nowrap" }}>
                {p.currency} {p.amount.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Sponsors({ sponsors }) {
  if (!sponsors?.length) return null;
  return (
    <Section title={`Sponsors (${sponsors.length})`}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {sponsors.map((s, i) => (
          <div key={i} className="card" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: "10px 14px", minWidth: 160 }}>
            {s.logo && (
              <img
                src={s.logo}
                alt={s.name}
                style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 4, background: "#fff", padding: 2 }}
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
              {s.domain && <div className="meta" style={{ fontSize: 11 }}>{s.domain}</div>}
              {s.tier && <span className="tag" style={{ fontSize: 10, padding: "1px 6px" }}>{s.tier}</span>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Schedule({ schedule }) {
  if (!schedule?.length) return null;
  const grouped = schedule.reduce((acc, event) => {
    const key = event.group || "Events";
    (acc[key] ??= []).push(event);
    return acc;
  }, {});

  return (
    <Section title="Schedule">
      {Object.entries(grouped).map(([groupName, events]) => (
        <div key={groupName} style={{ marginBottom: 16 }}>
          {Object.keys(grouped).length > 1 && (
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--accent)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {groupName}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.map((e, i) => (
              <div key={i} className="card" style={{ flexDirection: "row", gap: 16, padding: "10px 14px" }}>
                <div style={{ minWidth: 120, color: "var(--muted)", fontSize: 12 }}>
                  <div>{fmtDate(e.startsAt)}</div>
                  {e.endsAt && e.endsAt !== e.startsAt && <div>{fmtDate(e.endsAt)}</div>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  {e.description && <div className="meta" style={{ marginTop: 2 }}>{e.description}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

function FAQs({ faqs }) {
  const [open, setOpen] = useState(null);
  if (!faqs?.length) return null;
  return (
    <Section title="FAQs">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {faqs.map((f, i) => (
          <div key={i} className="card" style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => setOpen(open === i ? null : i)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, flex: 1 }}>{f.question}</div>
              <span style={{ color: "var(--accent)", fontWeight: 700, marginLeft: 12 }}>
                {open === i ? "−" : "+"}
              </span>
            </div>
            {open === i && (
              <div className="meta" style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {f.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function SocialLinks({ links, contactEmail }) {
  const active = Object.entries(links || {}).filter(([, v]) => v);
  if (!active.length && !contactEmail) return null;

  const icons = { instagram: "📸", linkedin: "💼", discord: "💬", telegram: "✈️" };

  return (
    <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {active.map(([platform, url]) => (
        <a key={platform} href={url} target="_blank" rel="noreferrer" className="btn secondary" style={{ fontSize: 13, padding: "6px 12px" }}>
          {icons[platform] || "🔗"} {platform.charAt(0).toUpperCase() + platform.slice(1)}
        </a>
      ))}
      {contactEmail && (
        <a href={`mailto:${contactEmail}`} className="btn secondary" style={{ fontSize: 13, padding: "6px 12px" }}>
          ✉️ {contactEmail}
        </a>
      )}
    </div>
  );
}

export default function Detail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [h, setH]               = useState(null);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeDone, setReanalyzeDone] = useState(false);

  useEffect(() => {
    api.get(id).then(setH).catch((e) => setErr(e.message));
  }, [id]);

  async function triggerReanalyze() {
    setReanalyzing(true);
    try {
      const r = await api.reanalyze(id);
      setH((prev) => ({ ...prev, aiAnalysis: r.aiAnalysis }));
      setReanalyzeDone(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setReanalyzing(false);
    }
  }

  async function toggleSave() {
    try {
      const r = await api.toggleSave(id);
      setSaved(r.saved);
    } catch (e) {
      setErr(e.message);
    }
  }

  if (err) return <div className="container empty">{err}</div>;
  if (!h) return <div className="container empty">Loading…</div>;

  return (
    <div className="container" style={{ maxWidth: 800, paddingTop: 28, paddingBottom: 48 }}>
      {/* Header */}
      <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className={`pill ${h.status}`}>{h.status}</span>
          <span className={`platform ${h.sourcePlatform}`}>{h.sourcePlatform}</span>
          {h.aiAnalysis?.difficulty && h.aiAnalysis.difficulty !== "all" && (
            <span className={`difficulty ${h.aiAnalysis.difficulty}`}>{h.aiAnalysis.difficulty}</span>
          )}
          {h.mode && h.mode !== "unknown" && (
            <span className="pill" style={{ background: "var(--panel-2)", color: "var(--accent)" }}>
              {h.mode}
            </span>
          )}
          {h.participantsCount > 0 && (
            <span className="muted" style={{ fontSize: 13 }}>
              👥 {h.participantsCount.toLocaleString()} participants
            </span>
          )}
        </div>

        {/* AI scores */}
        {h.aiAnalysis?.analyzedAt && (
          <div className="row" style={{ gap: 6 }}>
            {h.aiAnalysis.qualityScore != null && (
              <span className={`quality-chip${h.aiAnalysis.qualityScore >= 7 ? " high" : ""}`}
                title="AI quality score (1-10)">
                ★ Quality {h.aiAnalysis.qualityScore}/10
              </span>
            )}
            {h.aiAnalysis.legitimacyScore != null && (
              <span className="quality-chip" title="AI legitimacy score (1-10)">
                ✓ Legit {h.aiAnalysis.legitimacyScore}/10
              </span>
            )}
          </div>
        )}
      </div>

      {/* Banner */}
      {h.bannerImage && (
        <img
          src={h.bannerImage}
          alt={h.title}
          style={{ width: "100%", borderRadius: 12, marginTop: 16, maxHeight: 280, objectFit: "cover" }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      )}

      <h1 style={{ marginTop: 14, marginBottom: 4 }}>{h.title}</h1>
      {h.tagline && <div style={{ color: "var(--accent-2)", fontStyle: "italic", marginBottom: 4 }}>{h.tagline}</div>}
      <div className="muted">
        {h.organizer || h.sourcePlatform}
        {h.location?.city ? ` · ${h.location.city}` : ""}
        {h.location?.country ? `, ${h.location.country}` : ""}
        {h.timezone ? ` · ${h.timezone}` : ""}
      </div>

      {/* AI pitch — shown above description when available */}
      {h.aiAnalysis?.pitch && (
        <div style={{
          marginTop: 14, padding: "10px 14px", borderLeft: "3px solid var(--accent)",
          background: "var(--panel-2)", borderRadius: "0 8px 8px 0", fontStyle: "italic",
          fontSize: 14, lineHeight: 1.6,
        }}>
          {h.aiAnalysis.pitch}
        </div>
      )}

      {/* AI highlights */}
      {h.aiAnalysis?.highlights?.length > 0 && (
        <ul className="highlights" style={{ marginTop: 12 }}>
          {h.aiAnalysis.highlights.map((hl, i) => <li key={i}>{hl}</li>)}
        </ul>
      )}

      {h.description && <p style={{ marginTop: 14, lineHeight: 1.7 }}>{h.description}</p>}

      <div style={{ marginTop: 10 }}>
        {(h.themes || []).map((t) => (
          <span className="tag" key={t}>{t}</span>
        ))}
      </div>

      {/* Key Info */}
      <div className="card" style={{ gap: 8, marginTop: 20 }}>
        <div>🗓 Registration deadline: <b>{fmt(h.registrationDeadline)}</b></div>
        <div>📤 Submission deadline: <b>{fmt(h.submissionDeadline)}</b></div>
        <div>▶ Starts: <b>{fmt(h.startDate)}</b> · ⏹ Ends: <b>{fmt(h.endDate)}</b></div>
        {h.prizePool?.amount && (
          <div>
            🏆 Total prize pool:{" "}
            <b style={{ color: "var(--accent-2)" }}>
              {h.prizePool.currency} {h.prizePool.amount.toLocaleString()}
            </b>
          </div>
        )}
        {(h.teamSize?.min || h.teamSize?.max) && (
          <div>
            👥 Team size:{" "}
            <b>
              {h.teamSize.min === h.teamSize.max
                ? `${h.teamSize.min} (solo)`
                : `${h.teamSize.min || 1}–${h.teamSize.max || "∞"}`}
            </b>
          </div>
        )}
        {h.eligibility && <div>✅ Eligibility: <b>{h.eligibility}</b></div>}
      </div>

      {/* Social + Contact */}
      <SocialLinks links={h.socialLinks} contactEmail={h.contactEmail} />

      {/* Actions */}
      <div className="row" style={{ marginTop: 18, flexWrap: "wrap", gap: 8 }}>
        <a className="btn" href={h.registrationUrl || h.sourceUrl} target="_blank" rel="noreferrer">
          Register / View on {h.sourcePlatform}
        </a>
        {user && (
          <button className="btn secondary" onClick={toggleSave}>
            {saved ? "★ Saved" : "☆ Save"}
          </button>
        )}
        {/* Re-analyze button — clears aiAnalysis and re-runs Gemini */}
        <button
          className="btn ghost"
          onClick={triggerReanalyze}
          disabled={reanalyzing}
          title="Re-run Gemini analysis for this hackathon"
          style={{ fontSize: 12 }}
        >
          {reanalyzing ? "Analyzing…" : reanalyzeDone ? "✓ Done" : "⟳ Re-analyze with AI"}
        </button>
      </div>

      {/* Cross-platform links */}
      {h.sourceUrls?.length > 1 && (
        <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Also listed on:{" "}
          {h.sourceUrls.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>
              {s.platform}
            </a>
          ))}
        </div>
      )}

      {/* AI analysis panel */}
      {h.aiAnalysis?.analyzedAt && (
        <div style={{ marginTop: 28, padding: "16px", background: "var(--panel-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span>✦ AI Analysis · {h.aiAnalysis.model}</span>
            <span>analyzed {new Date(h.aiAnalysis.analyzedAt).toLocaleDateString()}</span>
          </div>

          {h.aiAnalysis.targetAudience && (
            <div style={{ marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Target audience: </span>
              <span style={{ fontSize: 13 }}>{h.aiAnalysis.targetAudience}</span>
            </div>
          )}

          {h.aiAnalysis.requirements && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>What to build</div>
              <div className="meta">{h.aiAnalysis.requirements}</div>
            </div>
          )}

          {h.aiAnalysis.judgingCriteria?.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Judging criteria</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {h.aiAnalysis.judgingCriteria.map((c, i) => (
                  <span key={i} className="tag">{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rich sections */}
      <PrizeBreakdown prizes={h.prizes} />
      <Sponsors sponsors={h.sponsors} />
      <Schedule schedule={h.schedule} />
      <FAQs faqs={h.faqs} />
    </div>
  );
}
