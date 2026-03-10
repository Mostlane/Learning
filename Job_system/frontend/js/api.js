import { API_BASE } from "./config.js";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === "object" && body?.error ? body.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export const api = {
  getCurrentSession: () => request("/api/auth/session"),
  login: (username, password) => request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  }),
  logout: () => request("/api/auth/logout", { method: "POST" })
};
