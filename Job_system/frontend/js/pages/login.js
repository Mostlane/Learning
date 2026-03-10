import { api } from "../api.js";
import { APP_ROUTES } from "../config.js";
import { bindHeaderSession, byId, toast } from "../helpers.js";

bindHeaderSession();
const form = byId("login-form");
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = byId("username").value.trim();
  const password = byId("password").value;
  const notice = byId("login-notice");
  try {
    const resp = await api.login(username, password);
    const role = resp?.user?.role || "engineer";
    location.href = APP_ROUTES[role] || "off-view.html";
  } catch (err) {
    toast(notice, err.message, "bad");
  }
});
