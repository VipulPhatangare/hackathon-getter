import { useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import Home from "./pages/Home.jsx";
import Detail from "./pages/Detail.jsx";
import Recommended from "./pages/Recommended.jsx";
import Profile from "./pages/Profile.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Admin from "./pages/Admin.jsx";

function Nav() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = () => setOpen(false);

  // Close the mobile dropdown whenever the route changes.
  useEffect(close, [location.pathname]);

  return (
    <nav className="nav">
      <NavLink to="/" className="brand" onClick={close}>
        Hack<span>Hub</span>
      </NavLink>
      <div className="spacer" />
      <button className="nav-toggle" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
        {open ? "✕" : "☰"}
      </button>
      <div className={`nav-links${open ? " open" : ""}`}>
        <NavLink to="/" onClick={close}>Discover</NavLink>
        {user && <NavLink to="/recommended" onClick={close}>For You</NavLink>}
        {user?.isAdmin && <NavLink to="/admin" className="admin-link" onClick={close}>Admin</NavLink>}
        {user && (
          <>
            <NavLink to="/profile" onClick={close}>{user.name}</NavLink>
            <button className="btn ghost" onClick={() => { logout(); close(); }}>
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container empty">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AdminOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container empty">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return user.isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/hackathon/:id" element={<Detail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/recommended"
          element={
            <Protected>
              <Recommended />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <Profile />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminOnly>
              <Admin />
            </AdminOnly>
          }
        />
      </Routes>
    </>
  );
}
