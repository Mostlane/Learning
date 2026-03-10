import { api } from "../api.js";
import { asDateTime, bindHeaderSession, byId, html, requireSession, statusBadgeClass, toast } from "../helpers.js";

let session;
async function load() {
  session = await requireSession(["master", "office"]);
  bindHeaderSession();
  byId("logout").onclick = async () => { await api.logout(); location.href = "login.html"; };
  byId("create-job").onsubmit = createJob;
  byId("job-filter").onsubmit = (e) => { e.preventDefault(); loadJobs(); };
  byId("view-as-form").onsubmit = setViewAs;
  byId("clear-view-as").onclick = async () => { await api.clearViewAs(); toast(byId("admin-notice"), "View-as cleared"); };
  await Promise.all([loadDashboard(), loadJobs()]);
}

async function loadDashboard() {
  const d = await api.dashboard();
  const kpis = [
    ["Open jobs", d.openJobs], ["Awaiting hold", d.awaitingHold], ["Overdue", d.overdue], ["Today scheduled", d.todayScheduled], ["Engineers active", d.activeEngineers], ["Breached SLA", d.breached]
  ];
  html(byId("kpis"), kpis.map(([k,v]) => `<article class="card"><div class="text-muted">${k}</div><div style="font-size:1.5rem;font-weight:800">${v ?? 0}</div></article>`).join(""));
  renderHoldQueue(d.holdQueue || []);
}

function renderHoldQueue(items) {
  html(byId("hold-queue"), items.map(i => `<div class="panel" style="padding:10px"><strong>${i.job_id}</strong> ${i.reason}<div class="row" style="margin-top:8px"><button class="btn btn-primary" data-a="approve" data-r="${i.id}" data-j="${i.job_id}">Approve</button><button class="btn btn-danger" data-a="reject" data-r="${i.id}" data-j="${i.job_id}">Reject</button></div></div>`).join("") || '<p class="text-muted">No pending holds.</p>');
  byId("hold-queue").onclick = async (e) => {
    const btn = e.target.closest("button[data-a]"); if (!btn) return;
    const approved = btn.dataset.a === "approve";
    await api.approveHold(btn.dataset.j, btn.dataset.r, approved, approved ? "Approved" : "Rejected");
    toast(byId("admin-notice"), `Hold ${approved ? "approved" : "rejected"}`);
    loadDashboard(); loadJobs();
  };
}

async function loadJobs() {
  const f = new FormData(byId("job-filter"));
  const jobs = await api.jobs({ search: f.get("search"), status: f.get("status") });
  html(byId("jobs-body"), jobs.map(j => `<tr><td>${j.job_id}</td><td>${j.title}</td><td><span class="badge ${statusBadgeClass(j.current_status)}">${j.current_status}</span></td><td>${j.priority}</td><td>${j.site_code}</td><td>${(j.engineers||[]).join(", ")}</td><td><a class="btn btn-secondary" href="job-view.html?jobId=${encodeURIComponent(j.job_id)}">Open</a></td></tr>`).join(""));
}

async function createJob(e) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  await api.createJob(Object.fromEntries(f.entries()));
  toast(byId("admin-notice"), "Job created");
  e.currentTarget.reset();
  loadJobs(); loadDashboard();
}

async function setViewAs(e) {
  e.preventDefault();
  const targetUserId = new FormData(e.currentTarget).get("targetUserId");
  await api.viewAs(targetUserId);
  toast(byId("admin-notice"), `Impersonating ${targetUserId}`, "warn");
}

load().catch((err) => toast(byId("admin-notice"), err.message, "bad"));
