import { api } from "./api.js";
import { APP_ROUTES } from "./config.js";

export function byId(id) { return document.getElementById(id); }
export function text(el, value) { if (el) el.textContent = value ?? ""; }
export function html(el, value) { if (el) el.innerHTML = value ?? ""; }
export function toast(target, msg, type = "ok") {
  if (!target) return;
  target.className = `notice ${type}`;
  target.textContent = msg;
  target.classList.remove("hidden");
}
export function asDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}
export function statusBadgeClass(status = "") {
  if (["Complete", "Closed"].includes(status)) return "sla-ok";
  if (["Hold Requested", "Awaiting Hold Approval", "On Hold"].includes(status)) return "sla-warn";
  if (["Overdue", "Breached"].includes(status)) return "sla-bad";
  return "";
}

export async function requireSession(roles = []) {
  const session = await api.session();
  if (!session?.authenticated) {
    location.href = "login.html";
    throw new Error("Unauthenticated");
  }
  if (roles.length && !roles.includes(session.user.role)) {
    location.href = APP_ROUTES[session.user.role] || "off-view.html";
    throw new Error("Unauthorized");
  }
  return session;
}

export async function bindHeaderSession() {
  const badge = document.querySelector("[data-session-status]");
  if (!badge) return;
  try {
    const session = await api.session();
    badge.textContent = `${session.user.fullName} (${session.user.role})`;
    badge.classList.add("sla-ok");
  } catch {
    badge.textContent = "Not signed in";
    badge.classList.add("sla-warn");
  }
}
