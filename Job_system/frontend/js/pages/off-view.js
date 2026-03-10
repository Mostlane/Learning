import { api } from "../api.js";
import { asDateTime, bindHeaderSession, byId, html, requireSession, statusBadgeClass, toast } from "../helpers.js";

async function load() {
  await requireSession(["master", "office", "engineer"]);
  bindHeaderSession();
  byId("logout").onclick = async () => { await api.logout(); location.href = "login.html"; };
  byId("off-filter").onsubmit = (e) => { e.preventDefault(); loadJobs(); };
  await loadJobs();
}

async function loadJobs() {
  const date = new FormData(byId("off-filter")).get("date");
  const jobs = await api.jobs({ my: true, date });
  html(byId("off-jobs"), jobs.map(j => `<article class="card"><div class="row spread"><strong>${j.job_id}</strong><span class="badge ${statusBadgeClass(j.current_status)}">${j.current_status}</span></div><p>${j.title}</p><div class="text-muted">${j.site_name}</div><div class="text-muted">Travel ${asDateTime(j.travel_started_at)} • On site ${asDateTime(j.on_site_at)}</div>${j.current_status==="Awaiting Hold Approval"?'<div class="notice warn">Blocked until hold decision.</div>':''}<a class="btn btn-secondary" href="job-view.html?jobId=${encodeURIComponent(j.job_id)}">Open</a></article>`).join(""));
}

load().catch((err) => toast(byId("off-notice"), err.message, "bad"));
