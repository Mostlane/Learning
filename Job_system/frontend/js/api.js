import { API_BASE } from "./config.js";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

function q(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.set(k, v);
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  login: (username, password) => request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  session: () => request("/api/auth/session"),
  currentUser: () => request("/api/auth/current-user"),
  viewAs: (targetUserId) => request("/api/auth/view-as", { method: "POST", body: JSON.stringify({ targetUserId }) }),
  clearViewAs: () => request("/api/auth/view-as/clear", { method: "POST" }),

  dashboard: () => request("/api/dashboard"),
  jobs: (filters) => request(`/api/jobs${q(filters)}`),
  getJob: (jobId) => request(`/api/jobs/${encodeURIComponent(jobId)}`),
  createJob: (payload) => request("/api/jobs", { method: "POST", body: JSON.stringify(payload) }),
  updateJob: (jobId, payload) => request(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  changeStatus: (jobId, status, note) => request(`/api/jobs/${encodeURIComponent(jobId)}/status`, { method: "POST", body: JSON.stringify({ status, note }) }),
  changePriority: (jobId, priority) => request(`/api/jobs/${encodeURIComponent(jobId)}/priority`, { method: "POST", body: JSON.stringify({ priority }) }),
  addNote: (jobId, body) => request(`/api/jobs/${encodeURIComponent(jobId)}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
  allocateEngineer: (jobId, engineerId) => request(`/api/jobs/${encodeURIComponent(jobId)}/engineers`, { method: "POST", body: JSON.stringify({ engineerId }) }),
  removeEngineer: (jobId, engineerId) => request(`/api/jobs/${encodeURIComponent(jobId)}/engineers/${encodeURIComponent(engineerId)}`, { method: "DELETE" }),
  history: (jobId) => request(`/api/jobs/${encodeURIComponent(jobId)}/history`),
  requestHold: (jobId, reason) => request(`/api/jobs/${encodeURIComponent(jobId)}/hold/request`, { method: "POST", body: JSON.stringify({ reason }) }),
  approveHold: (jobId, requestId, approved, note) => request(`/api/jobs/${encodeURIComponent(jobId)}/hold/decision`, { method: "POST", body: JSON.stringify({ requestId, approved, note }) }),
  saveMaterials: (jobId, payload) => request(`/api/jobs/${encodeURIComponent(jobId)}/materials`, { method: "POST", body: JSON.stringify(payload) }),
  completeJob: (jobId, payload) => request(`/api/jobs/${encodeURIComponent(jobId)}/complete`, { method: "POST", body: JSON.stringify(payload) }),

  scheduler: (date) => request(`/api/scheduler${q({ date })}`),
  saveSchedulerMove: (payload) => request("/api/scheduler/move", { method: "POST", body: JSON.stringify(payload) }),

  financialSummary: (filters) => request(`/api/financial/summary${q(filters)}`),
  financialDefaults: () => request("/api/financial/defaults"),
  updateFinancialDefaults: (payload) => request("/api/financial/defaults", { method: "PATCH", body: JSON.stringify(payload) }),
  updateJobCosts: (jobId, payload) => request(`/api/financial/jobs/${encodeURIComponent(jobId)}`, { method: "PATCH", body: JSON.stringify(payload) }),
  exportJob: (jobId, payload) => request(`/api/exports/jobs/${encodeURIComponent(jobId)}`, { method: "POST", body: JSON.stringify(payload) }),

  uploadFile: async (jobId, file, kind = "attachment") => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/files`, { method: "POST", credentials: "include", body: fd });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  }
};
