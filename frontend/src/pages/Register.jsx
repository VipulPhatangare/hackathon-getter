import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");

  const upd = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      await register(form.name, form.email, form.password);
      nav("/profile");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="container center-form">
      <h1>Create your account</h1>
      <form onSubmit={submit}>
        <label>Name</label>
        <input value={form.name} onChange={upd("name")} required />
        <label>Email</label>
        <input type="email" value={form.email} onChange={upd("email")} required />
        <label>Password</label>
        <input type="password" value={form.password} onChange={upd("password")} required minLength={6} />
        <button className="btn" style={{ marginTop: 18, width: "100%" }}>Sign up</button>
        {err && <p className="reason" style={{ color: "#ff8a8a" }}>{err}</p>}
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
