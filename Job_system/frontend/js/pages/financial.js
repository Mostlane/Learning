import { api } from "../api.js";
import { bindHeaderSession, byId, html, requireSession, toast } from "../helpers.js";

async function load() {
  await requireSession(["master", "office"]);
  bindHeaderSession();
  byId("defaults-form").onsubmit = saveDefaults;
  byId("job-cost-form").onsubmit = saveJobCostAndExport;
  await Promise.all([loadDefaults(), loadSummary()]);
}

async function loadDefaults() {
  const d = await api.financialDefaults();
  Object.entries(d || {}).forEach(([k,v]) => { if (byId("defaults-form")[k]) byId("defaults-form")[k].value = v; });
}
async function saveDefaults(e) {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  await api.updateFinancialDefaults(payload);
  toast(byId("financial-notice"), "Defaults saved");
}
async function loadSummary() {
  const rows = await api.financialSummary({ limit: 50 });
  html(byId("financial-body"), rows.map(r => `<tr><td>${r.job_id}</td><td>${r.actual_total ?? '-'}</td><td>${r.client_total ?? '-'}</td><td>${r.current_status}</td></tr>`).join(""));
}
async function saveJobCostAndExport(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.currentTarget).entries());
  await api.updateJobCosts(f.jobId, { mostlaneTotal: f.mostlaneTotal, clientTotal: f.clientTotal, exportNotes: f.exportNotes });
  await api.exportJob(f.jobId, { exportMode: f.exportMode, include: ["core", "site", "engineers", "statusHistory", "eventHistory", "sla", "materials", "signature", "attachments"] });
  toast(byId("financial-notice"), "Costing saved and export generated");
  loadSummary();
}
load().catch((err) => toast(byId("financial-notice"), err.message, "bad"));
