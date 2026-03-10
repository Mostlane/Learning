import { json } from "./utils/response.js";
import { handleApi } from "./routes/index.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "job-system-worker" });
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return json({ error: "Not found" }, 404);
  }
};
