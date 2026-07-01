import { Link } from "react-router-dom";

function fmtDate(d) {
  if (!d) return "TBA";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtPrize(p) {
  if (!p?.amount) return null;
  return `${p.currency || ""} ${p.amount.toLocaleString()}`.trim();
}

function QualityChip({ score }) {
  if (score == null) return null;
  const isHigh = score >= 7;
  return (
    <span className={`quality-chip${isHigh ? " high" : ""}`} title={`Quality score: ${score}/10`}>
      ★ {score}/10
    </span>
  );
}

function Badges({ h, rank, difficulty }) {
  return (
    <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
      {rank != null && <span className="rank-badge">#{rank}</span>}
      <span className={`pill ${h.status}`}>{h.status}</span>
      {h.sourcePlatform && <span className={`platform ${h.sourcePlatform}`}>{h.sourcePlatform}</span>}
      {difficulty && difficulty !== "all" && <span className={`difficulty ${difficulty}`}>{difficulty}</span>}
    </div>
  );
}

/** reasons/score/rank are optional — shown only on ranking-heavy pages.
 *  Pass horizontal to render the wide row layout used on the Discover list. */
export default function HackathonCard({ h, reasons, score, rank, horizontal = false }) {
  const prize      = fmtPrize(h.prizePool);
  const ai         = h.aiAnalysis || {};
  // AI-generated copy only — never fall back to the raw scraped description.
  const pitch      = ai.pitch || "";
  const difficulty = ai.difficulty;
  const highlights = ai.highlights || [];

  if (horizontal) {
    return (
      <Link to={`/hackathon/${h._id}`} className="card card-link card-horizontal">
        <div className="ch-main">
          <Badges h={h} rank={rank} difficulty={difficulty} />
          <h3>{h.title}</h3>
          <div className="meta">
            {h.organizer || h.sourcePlatform} · {h.mode}
            {h.location?.city ? ` · ${h.location.city}` : ""}
          </div>
          {pitch && (
            <div className="pitch">{pitch.slice(0, 160)}{pitch.length > 160 ? "…" : ""}</div>
          )}
          {highlights.length > 0 ? (
            <ul className="highlights">
              {highlights.map((hl, i) => <li key={i}>{hl}</li>)}
            </ul>
          ) : (
            <div>
              {(h.themes || []).slice(0, 4).map((t) => <span className="tag" key={t}>{t}</span>)}
            </div>
          )}
          {reasons?.length > 0 && (
            <div>
              {reasons.slice(0, 2).map((r, i) => <div className="reason" key={i}>✓ {r}</div>)}
            </div>
          )}
        </div>

        <div className="ch-side">
          <div className="row" style={{ gap: 5 }}>
            <QualityChip score={ai.qualityScore} />
            {score != null && <span className="score">{score} match</span>}
          </div>
          <div className="meta" style={{ textAlign: "right" }}>
            🗓 Deadline<br /><b>{fmtDate(h.registrationDeadline)}</b>
          </div>
          {prize && (
            <div className="meta" style={{ textAlign: "right" }}>
              🏆 Prize<br /><b>{prize}</b>
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/hackathon/${h._id}`} className="card card-link">
      {/* Row 1: status + platform + difficulty + quality */}
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
        <Badges h={h} rank={rank} difficulty={difficulty} />
        <div className="row" style={{ gap: 5 }}>
          <QualityChip score={ai.qualityScore} />
          {score != null && <span className="score">{score} match</span>}
        </div>
      </div>

      {/* Title */}
      <h3>{h.title}</h3>

      {/* Organizer / mode / location */}
      <div className="meta">
        {h.organizer || h.sourcePlatform} · {h.mode}
        {h.location?.city ? ` · ${h.location.city}` : ""}
      </div>

      {/* AI pitch — only shown once Gemini has analyzed this hackathon */}
      {pitch && (
        <div className="pitch">{pitch.slice(0, 130)}{pitch.length > 130 ? "…" : ""}</div>
      )}

      {/* Highlights — shown when Gemini has analyzed this hackathon */}
      {highlights.length > 0 && (
        <ul className="highlights">
          {highlights.map((hl, i) => <li key={i}>{hl}</li>)}
        </ul>
      )}

      {/* Theme tags — shown when no highlights yet */}
      {highlights.length === 0 && (
        <div>
          {(h.themes || []).slice(0, 4).map((t) => (
            <span className="tag" key={t}>{t}</span>
          ))}
        </div>
      )}

      {/* Deadline + prize */}
      <div className="meta">
        🗓 Deadline: <b>{fmtDate(h.registrationDeadline)}</b>
        {prize && <> · 🏆 {prize}</>}
      </div>

      {/* Recommendation reasons */}
      {reasons?.length > 0 && (
        <div>
          {reasons.slice(0, 2).map((r, i) => (
            <div className="reason" key={i}>✓ {r}</div>
          ))}
        </div>
      )}
    </Link>
  );
}
