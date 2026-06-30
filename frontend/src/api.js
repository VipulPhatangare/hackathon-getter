// Tiny fetch wrapper that attaches the JWT and parses JSON.
const TOKEN_KEY = "hackhub_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  // auth
  register: (body) => request("/auth/register", { method: "POST", body }),
  login: (body) => request("/auth/login", { method: "POST", body }),
  me: () => request("/auth/me", { auth: true }),
  updateProfile: (body) => request("/auth/profile", { method: "PUT", body, auth: true }),

  // hackathons
  list:         (qs = "") => request(`/hackathons${qs}`),
  get:          (id) => request(`/hackathons/${id}`),
  filters:      () => request("/hackathons/filters"),
  recommended:  () => request("/hackathons/recommended", { auth: true }),
  toggleSave:   (id) => request(`/hackathons/${id}/save`, { method: "POST", auth: true }),
  reanalyze:    (id) => request(`/hackathons/${id}/reanalyze`, { method: "POST", auth: true }),
  chat:         (id, body) => request(`/hackathons/${id}/chat`, { method: "POST", body }),

  // admin (all require an admin JWT)
  adminStats:    () => request("/admin/stats", { auth: true }),
  adminSettings: () => request("/admin/settings", { auth: true }),
  adminSaveSettings: (body) => request("/admin/settings", { method: "PUT", body, auth: true }),
  adminScrape:   () => request("/admin/scrape", { method: "POST", auth: true }),
  adminAnalyze:  () => request("/admin/analyze", { method: "POST", auth: true }),
  adminRuns:     () => request("/admin/runs", { auth: true }),
};
