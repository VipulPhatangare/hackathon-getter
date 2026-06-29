import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import HackathonCard from "../components/HackathonCard.jsx";

export default function Recommended() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .recommended()
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h1>Recommended for you</h1>
      <p className="muted">
        Ranked by how well each hackathon matches your interests, skills and preferences.{" "}
        <Link to="/profile">Update your profile</Link> to improve results.
      </p>

      {loading ? (
        <div className="empty">Scoring hackathons…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          No matches yet. Add interests and skills in your <Link to="/profile">profile</Link>.
        </div>
      ) : (
        <div className="grid">
          {items.map(({ hackathon, score, reasons }) => (
            <HackathonCard key={hackathon._id} h={hackathon} score={score} reasons={reasons} />
          ))}
        </div>
      )}
    </div>
  );
}
