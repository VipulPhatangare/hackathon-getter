import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");

  const upd = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      await login(form.email, form.password);
      nav("/recommended");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="container center-form">
      <h1>Welcome back</h1>
      <form onSubmit={submit}>
        <label>Email</label>
        <input type="email" value={form.email} onChange={upd("email")} required />
        <label>Password</label>
        <input type="password" value={form.password} onChange={upd("password")} required />
        <button className="btn" style={{ marginTop: 18, width: "100%" }}>Login</button>
        {err && <p className="reason" style={{ color: "#ff8a8a" }}>{err}</p>}
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        No account? <Link to="/register">Sign up</Link>
      </p>
    </div>
  );
}
