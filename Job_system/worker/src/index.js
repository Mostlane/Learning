import { json } from "./utils/response.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "job-system-worker" });
    }

    return json({ error: "Not found" }, 404);
  }
};
