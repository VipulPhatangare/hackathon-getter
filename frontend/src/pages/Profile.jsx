import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";

// helpers to edit comma-separated arrays in a text input
const toStr = (arr) => (arr || []).join(", ");
const toArr = (str) => str.split(",").map((s) => s.trim()).filter(Boolean);

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    interests: toStr(user.interests),
    skills: toStr(user.skills),
    experienceLevel: user.experienceLevel || "beginner",
    preferredMode: user.preferredMode || "any",
    country: user.location?.country || "",
    city: user.location?.city || "",
  });
  const [msg, setMsg] = useState("");

  const upd = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setMsg("");
    try {
      const d = await api.updateProfile({
        interests: toArr(form.interests),
        skills: toArr(form.skills),
        experienceLevel: form.experienceLevel,
        preferredMode: form.preferredMode,
        location: { country: form.country, city: form.city },
      });
      setUser(d.user);
      setMsg("Saved! Check 'For You' for updated recommendations.");
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 560, paddingTop: 24 }}>
      <h1>Your profile</h1>
      <p className="muted">This drives your personalized recommendations.</p>
      <form onSubmit={save}>
        <label>Interests / themes (comma-separated)</label>
        <input value={form.interests} onChange={upd("interests")} placeholder="AI, Web3, HealthTech" />

        <label>Skills / technologies (comma-separated)</label>
        <input value={form.skills} onChange={upd("skills")} placeholder="Python, React, Node.js" />

        <label>Experience level</label>
        <select value={form.experienceLevel} onChange={upd("experienceLevel")}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>

        <label>Preferred mode</label>
        <select value={form.preferredMode} onChange={upd("preferredMode")}>
          <option value="any">Any</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="hybrid">Hybrid</option>
        </select>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Country</label>
            <input value={form.country} onChange={upd("country")} placeholder="India" />
          </div>
          <div style={{ flex: 1 }}>
            <label>City</label>
            <input value={form.city} onChange={upd("city")} placeholder="Pune" />
          </div>
        </div>

        <button className="btn" style={{ marginTop: 18 }}>Save profile</button>
        {msg && <p className="reason" style={{ marginTop: 12 }}>{msg}</p>}
      </form>
    </div>
  );
}
