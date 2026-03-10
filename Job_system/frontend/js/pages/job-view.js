import { api } from "../api.js";
import { APP_CONSTANTS } from "../config.js";
import { asDateTime, bindHeaderSession, byId, html, requireSession, text, toast } from "../helpers.js";

const jobId = new URLSearchParams(location.search).get("jobId");
let job;
async function load() {
  await requireSession(["master", "office", "engineer"]);
  bindHeaderSession();
  if (!jobId) throw new Error("Missing jobId");
  byId("status-form").onsubmit = onStatus;
  byId("hold-form").onsubmit = onHold;
  byId("materials-form").onsubmit = onMaterials;
  byId("file-form").onsubmit = onFile;
  byId("complete-form").onsubmit = onComplete;
  await refresh();
}
async function refresh() {
  job = await api.getJob(jobId);
  const history = await api.history(jobId);
  text(byId("job-title"), `${job.job_id} - ${job.title}`);
  text(byId("job-meta"), `${job.site_name} • ${job.current_status} • SLA target ${asDateTime(job.sla_target_at)}`);
  html(byId("materials-body"), (job.materials||[]).map(m=>`<tr><td>${m.description}</td><td>${m.quantity}</td><td>${m.unit_cost ?? '-'}</td></tr>`).join("") || '<tr><td colspan="3" class="text-muted">No materials.</td></tr>');
  html(byId("event-history"), (history.events||[]).map(e=>`<li><strong>${e.event_type}</strong><div class="text-muted">${asDateTime(e.created_at)} • ${e.actor_name}</div><div>${e.details || ""}</div></li>`).join(""));
  html(byId("status-history"), (history.status||[]).map(s=>`<li><strong>${s.to_status}</strong><div class="text-muted">${asDateTime(s.changed_at)} • ${s.actor_name}</div></li>`).join(""));
}

async function onStatus(e) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  await api.changeStatus(jobId, f.get("status"), f.get("note"));
  toast(byId("job-notice"), "Status updated");
  refresh();
}
async function onHold(e) {
  e.preventDefault();
  const reason = new FormData(e.currentTarget).get("reason");
  await api.requestHold(jobId, reason);
  toast(byId("job-notice"), "Hold requested", "warn");
  e.currentTarget.reset();
  refresh();
}
async function onMaterials(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  payload.quantity = Number(payload.quantity || 0);
  await api.saveMaterials(jobId, { materials: [payload] });
  toast(byId("job-notice"), "Material added");
  e.currentTarget.reset();
  refresh();
}
async function onComplete(e) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const payload = {
    completionNotes: f.get("completionNotes"),
    signatureName: f.get("signature"),
    noMaterialsConfirmationText: f.get("noMaterialsConfirm")
  };
  if ((job.materials || []).length === 0 && payload.noMaterialsConfirmationText !== APP_CONSTANTS.noMaterialsPhrase) {
    throw toast(byId("job-notice"), `Type exactly: ${APP_CONSTANTS.noMaterialsPhrase}`, "bad");
  }
  await api.completeJob(jobId, payload);
  toast(byId("job-notice"), "Job completed", "ok");
  refresh();
}
load().catch((err) => toast(byId("job-notice"), err.message, "bad"));

async function onFile(e) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const file = f.get("file");
  const kind = f.get("kind");
  await api.uploadFile(jobId, file, kind);
  toast(byId("job-notice"), "File uploaded");
  e.currentTarget.reset();
}
