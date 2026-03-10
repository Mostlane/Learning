import { api } from "../api.js";
import { bindHeaderSession, byId, html, requireSession, toast } from "../helpers.js";

let state;
async function load() {
  await requireSession(["master", "office"]);
  bindHeaderSession();
  const dateInput = byId("sched-date");
  dateInput.valueAsDate = new Date();
  dateInput.onchange = loadBoard;
  await loadBoard();
}

async function loadBoard() {
  const date = byId("sched-date").value;
  state = await api.scheduler(date);
  render();
}

function chip(job) {
  return `<div class="job-chip" draggable="true" data-job="${job.job_id}">${job.job_id} • ${job.title}</div>`;
}

function render() {
  html(byId("unscheduled"), (state.unscheduledJobs||[]).map(chip).join(""));
  html(byId("lanes"), (state.engineers||[]).map(e => `<div class="card"><div class="row spread"><strong>${e.name}</strong><span class="text-muted">${e.code}</span></div><div class="lane" data-engineer="${e.id}">${(e.jobs||[]).map(chip).join("")}</div></div>`).join(""));
  bindDnD();
}

function bindDnD() {
  let dragging = null;
  document.querySelectorAll(".job-chip").forEach(el => {
    el.ondragstart = () => { dragging = el.dataset.job; };
  });
  document.querySelectorAll(".lane, #unscheduled").forEach(l => {
    l.ondragover = (e) => e.preventDefault();
    l.ondrop = async (e) => {
      e.preventDefault();
      if (!dragging) return;
      try {
        await api.saveSchedulerMove({ jobId: dragging, engineerId: l.dataset.engineer || null, date: byId("sched-date").value });
        toast(byId("scheduler-notice"), "Schedule updated");
        loadBoard();
      } catch (err) {
        toast(byId("scheduler-notice"), err.message, "bad");
      }
      dragging = null;
    };
  });
}

load().catch((err) => toast(byId("scheduler-notice"), err.message, "bad"));
