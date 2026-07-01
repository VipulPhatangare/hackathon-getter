import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import HackathonChat from "../components/HackathonChat.jsx";
import "../styles.css";

function fmt(d) {
  return d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "TBA";
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

function AboutSection({ text }) {
  if (!text) return null;
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <Section title="About this hackathon">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {paragraphs.map((p, i) => (
          <p key={i} style={{ margin: 0, lineHeight: 1.75, color: "#374151" }}>{p}</p>
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
  const navigate = useNavigate();
  const { user } = useAuth();

  // Go back if there's history, otherwise fall back to the discover page.
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));
  const [h, setH]               = useState(null);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState("");
  useEffect(() => {
    api.get(id).then(setH).catch((e) => setErr(e.message));
  }, [id]);

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
    <div className="container" style={{ paddingTop: 28, paddingBottom: 48 }}>
      {/* Back */}
      <button className="btn ghost sm back-btn" onClick={goBack} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <div className="detail-layout">
      <div className="detail-main">
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

      <h1 style={{ marginTop: 18, marginBottom: 4 }}>{h.title}</h1>
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

      {/* AI-generated summary only — never the raw scraped description */}
      {h.aiAnalysis?.summary && <p style={{ marginTop: 14, lineHeight: 1.7 }}>{h.aiAnalysis.summary}</p>}

      <div style={{ marginTop: 10 }}>
        {(h.themes || []).map((t) => (
          <span className="tag" key={t}>{t}</span>
        ))}
      </div>

      {/* AI-generated in-depth write-up (300-1000 words) */}
      <AboutSection text={h.aiAnalysis?.longDescription} />

      {/* Key Info */}
      <div className="info-card" style={{ marginTop: 20 }}>
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

      {/* Prizes (sponsors / schedule / FAQs are intentionally not shown publicly) */}
      <PrizeBreakdown prizes={h.prizes} />
      </div>

      {/* Gemini chat — fixed right sidebar on desktop, stacks below content on mobile */}
      <div className="detail-chat-col">
        <HackathonChat hackathonId={id} hackathonTitle={h.title} />
      </div>
      </div>
    </div>
  );
}
