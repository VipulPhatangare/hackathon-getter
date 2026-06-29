import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import Home from "./pages/Home.jsx";
import Detail from "./pages/Detail.jsx";
import Recommended from "./pages/Recommended.jsx";
import Profile from "./pages/Profile.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";

function Nav() {
  const { user, logout } = useAuth();
  return (
    <nav className="nav">
      <NavLink to="/" className="brand">
        Hack<span>Hub</span>
      </NavLink>
      <NavLink to="/">Discover</NavLink>
      {user && <NavLink to="/recommended">For You</NavLink>}
      <div className="spacer" />
      {user ? (
        <>
          <NavLink to="/profile">{user.name}</NavLink>
          <button className="btn ghost" onClick={logout}>
            Logout
          </button>
        </>
      ) : (
        <>
          <NavLink to="/login">Login</NavLink>
          <NavLink to="/register">
            <button className="btn">Sign up</button>
          </NavLink>
        </>
      )}
    </nav>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container empty">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
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
      </Routes>
    </>
  );
}
