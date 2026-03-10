import { err, json } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { completionValidation, ensureSingleActiveJob } from "../services/workflow.js";

async function parseBody(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) return request.json();
  return {};
}

export async function handleApi(request, env, url) {
  const m = request.method;
  const p = url.pathname;

  if (m === "POST" && p === "/api/auth/login") return login(request, env);
  if (m === "POST" && p === "/api/auth/logout") return logout(request, env);
  if (m === "GET" && p === "/api/auth/session") return session(request, env);
  if (m === "GET" && p === "/api/auth/current-user") return session(request, env);
  if (m === "POST" && p === "/api/auth/view-as") return viewAs(request, env);
  if (m === "POST" && p === "/api/auth/view-as/clear") return clearViewAs(request, env);

  if (m === "GET" && p === "/api/dashboard") return dashboard(request, env);
  if (m === "GET" && p === "/api/jobs") return listJobs(request, env, url);
  if (m === "POST" && p === "/api/jobs") return createJob(request, env);
  if (m === "GET" && p.match(/^\/api\/jobs\/[^/]+$/)) return getJob(request, env, p.split("/").pop());
  if (m === "PATCH" && p.match(/^\/api\/jobs\/[^/]+$/)) return updateJob(request, env, p.split("/").pop());
  if (m === "POST" && p.match(/^\/api\/jobs\/[^/]+\/status$/)) return changeStatus(request, env, p.split("/")[3]);
  if (m === "POST" && p.match(/^\/api\/jobs\/[^/]+\/notes$/)) return addNote(request, env, p.split("/")[3]);
  if (m === "POST" && p.match(/^\/api\/jobs\/[^/]+\/hold\/request$/)) return requestHold(request, env, p.split("/")[3]);
  if (m === "POST" && p.match(/^\/api\/jobs\/[^/]+\/hold\/decision$/)) return holdDecision(request, env, p.split("/")[3]);
  if (m === "POST" && p.match(/^\/api\/jobs\/[^/]+\/materials$/)) return materials(request, env, p.split("/")[3]);
  if (m === "POST" && p.match(/^\/api\/jobs\/[^/]+\/complete$/)) return complete(request, env, p.split("/")[3]);
  if (m === "GET" && p.match(/^\/api\/jobs\/[^/]+\/history$/)) return history(request, env, p.split("/")[3]);

  if (m === "GET" && p === "/api/scheduler") return scheduler(request, env, url);
  if (m === "POST" && p === "/api/scheduler/move") return schedulerMove(request, env);

  if (m === "GET" && p === "/api/financial/defaults") return financialDefaults(request, env);
  if (m === "PATCH" && p === "/api/financial/defaults") return updateFinancialDefaults(request, env);
  if (m === "GET" && p === "/api/financial/summary") return financialSummary(request, env);

  return err("Not found", 404);
}

async function login(request, env) {
  const { username, password } = await parseBody(request);
  const user = await env.DB.prepare(`SELECT u.id, u.username, u.full_name, u.password_hash, r.name role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.username=?1`).bind(username).first();
  if (!user) return err("Invalid credentials", 401);
  if (user.password_hash !== password) return err("Invalid credentials", 401); // Replace with hash compare in production.
  const token = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO user_sessions (id,user_id,session_token,created_at,expires_at) VALUES (?1,?2,?3,datetime('now'),datetime('now','+1 day'))").bind(crypto.randomUUID(), user.id, token).run();
  return json({ authenticated: true, token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role_name } });
}
async function logout(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  await env.DB.prepare("UPDATE user_sessions SET revoked_at=datetime('now') WHERE session_token=?1").bind(request.headers.get("Authorization")?.replace("Bearer ", "") || request.headers.get("x-session-token")).run();
  return json({ ok: true });
}
async function session(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return json({ authenticated: false });
  return json({ authenticated: true, user: auth.user });
}
async function viewAs(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const { targetUserId } = await parseBody(request);
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") || request.headers.get("x-session-token");
  await env.DB.prepare("UPDATE user_sessions SET acting_as_user_id=?1 WHERE session_token=?2").bind(targetUserId, token).run();
  await env.DB.prepare("INSERT INTO impersonation_audit (id,office_user_id,target_user_id,created_at) VALUES (?1,?2,?3,datetime('now'))").bind(crypto.randomUUID(), auth.user.id, targetUserId).run();
  return json({ ok: true });
}
async function clearViewAs(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") || request.headers.get("x-session-token");
  await env.DB.prepare("UPDATE user_sessions SET acting_as_user_id=NULL WHERE session_token=?1").bind(token).run();
  return json({ ok: true });
}

async function dashboard(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const openJobs = await env.DB.prepare("SELECT count(*) c FROM jobs WHERE current_status NOT IN ('Complete','Closed')").first();
  const awaitingHold = await env.DB.prepare("SELECT count(*) c FROM hold_requests WHERE status='Awaiting Hold Approval'").first();
  const overdue = await env.DB.prepare("SELECT count(*) c FROM jobs WHERE completed_at IS NULL AND sla_target_at < datetime('now')").first();
  const holdQueue = await env.DB.prepare("SELECT id,job_id,reason FROM hold_requests WHERE status='Awaiting Hold Approval' ORDER BY requested_at ASC LIMIT 20").all();
  return json({ openJobs: openJobs.c, awaitingHold: awaitingHold.c, overdue: overdue.c, breached: overdue.c, todayScheduled: 0, activeEngineers: 0, holdQueue: holdQueue.results });
}

async function listJobs(request, env, url) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const my = url.searchParams.get("my") === "true";
  const actingUser = auth.user.actingAsUserId || auth.user.id;
  let sql = `SELECT j.job_id,j.title,j.current_status,j.priority,j.site_code,s.site_name FROM jobs j LEFT JOIN sites s ON s.id=j.site_id WHERE 1=1`;
  const binds = [];
  if (status) { sql += ` AND j.current_status=?${binds.length+1}`; binds.push(status); }
  if (search) {
    sql += ` AND (j.job_id LIKE ?${binds.length+1} OR j.helpdesk_ref LIKE ?${binds.length+2} OR j.site_code LIKE ?${binds.length+3} OR s.site_name_normalized LIKE ?${binds.length+4})`;
    binds.push(`%${search}%`,`%${search}%`,`%${search}%`,`%${search.toLowerCase()}%`);
  }
  if (my || auth.user.role === "engineer") { sql += ` AND EXISTS(SELECT 1 FROM job_engineers je WHERE je.job_id=j.id AND je.engineer_user_id=?${binds.length+1} AND je.released_at IS NULL)`; binds.push(actingUser); }
  sql += ` ORDER BY j.updated_at DESC LIMIT 200`;
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return json(rows.results);
}
async function getJob(request, env, jobId) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const row = await env.DB.prepare(`SELECT j.*, s.site_name FROM jobs j LEFT JOIN sites s ON s.id=j.site_id WHERE j.job_id=?1`).bind(jobId).first();
  if (!row) return err("Job not found", 404);
  row.materials = (await env.DB.prepare("SELECT * FROM job_materials WHERE job_id=?1 ORDER BY created_at DESC").bind(row.id).all()).results;
  return json(row);
}
async function createJob(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const body = await parseBody(request);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO jobs (id,job_id,title,helpdesk_ref,site_code,priority,current_status,created_at,updated_at,raised_date)
    VALUES (?1,?2,?3,?4,?5,?6,'Pending',datetime('now'),datetime('now'),datetime('now'))`).bind(id, `JOB-${Date.now()}`, body.title, body.helpdeskRef, body.siteCode, body.priority || "Medium").run();
  return json({ ok: true });
}
async function updateJob(request, env, jobId) { return json({ ok: true, jobId }); }
async function addNote(request, env, jobId) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const { body } = await parseBody(request);
  await env.DB.prepare("INSERT INTO job_events (id,job_id,event_type,details,actor_user_id,created_at) VALUES (?1,(SELECT id FROM jobs WHERE job_id=?2),'Note',?3,?4,datetime('now'))").bind(crypto.randomUUID(), jobId, body, auth.user.id).run();
  return json({ ok: true });
}
async function changeStatus(request, env, jobId) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const { status, note } = await parseBody(request);
  if (["Travelling","On Site","In Progress","Awaiting Hold Approval"].includes(status)) await ensureSingleActiveJob(env, auth.user.id, jobId);
  const job = await env.DB.prepare("SELECT id,current_status FROM jobs WHERE job_id=?1").bind(jobId).first();
  await env.DB.prepare("UPDATE jobs SET current_status=?1,updated_at=datetime('now') WHERE id=?2").bind(status, job.id).run();
  await env.DB.prepare("INSERT INTO job_status_history (id,job_id,from_status,to_status,changed_by_user_id,changed_at,note) VALUES (?1,?2,?3,?4,?5,datetime('now'),?6)").bind(crypto.randomUUID(), job.id, job.current_status, status, auth.user.id, note || "").run();
  return json({ ok: true });
}
async function requestHold(request, env, jobId) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const { reason } = await parseBody(request);
  await env.DB.prepare("INSERT INTO hold_requests (id,job_id,requested_by_user_id,status,reason,requested_at) VALUES (?1,(SELECT id FROM jobs WHERE job_id=?2),?3,'Awaiting Hold Approval',?4,datetime('now'))").bind(crypto.randomUUID(), jobId, auth.user.id, reason).run();
  await env.DB.prepare("UPDATE jobs SET current_status='Awaiting Hold Approval',updated_at=datetime('now') WHERE job_id=?1").bind(jobId).run();
  return json({ ok: true });
}
async function holdDecision(request, env, jobId) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const { requestId, approved, note } = await parseBody(request);
  await env.DB.prepare("UPDATE hold_requests SET status=?1,reviewed_by_user_id=?2,reviewed_at=datetime('now'),decision_note=?3 WHERE id=?4").bind(approved ? "Approved" : "Rejected", auth.user.id, note || "", requestId).run();
  await env.DB.prepare("UPDATE jobs SET current_status=?1,updated_at=datetime('now') WHERE job_id=?2").bind(approved ? "On Hold" : "Hold Rejected", jobId).run();
  return json({ ok: true });
}
async function materials(request, env, jobId) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const body = await parseBody(request);
  for (const m of (body.materials || [])) {
    await env.DB.prepare("INSERT INTO job_materials (id,job_id,description,quantity,unit_cost,supplier,notes,created_by_user_id,created_at) VALUES (?1,(SELECT id FROM jobs WHERE job_id=?2),?3,?4,?5,?6,?7,?8,datetime('now'))").bind(crypto.randomUUID(), jobId, m.description, m.quantity, m.unitCost || null, m.supplier || null, m.notes || null, auth.user.id).run();
  }
  return json({ ok: true });
}
async function complete(request, env, jobId) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const b = await parseBody(request);
  const count = await env.DB.prepare("SELECT count(*) c FROM job_materials WHERE job_id=(SELECT id FROM jobs WHERE job_id=?1)").bind(jobId).first();
  const materialsComplete = count.c > 0 || b.noMaterialsConfirmationText === "NO MATERIALS USED";
  const errors = completionValidation({ completionNotes: b.completionNotes, signatureName: b.signatureName, materialsComplete });
  if (errors.length) return json({ error: "Validation failed", details: errors }, 422);
  await env.DB.prepare("UPDATE jobs SET current_status='Complete',completion_notes=?1,customer_signature_name=?2,completed_at=datetime('now'),updated_at=datetime('now') WHERE job_id=?3").bind(b.completionNotes, b.signatureName, jobId).run();
  await env.DB.prepare("INSERT INTO job_completion_checks (id,job_id,completion_notes_ok,signature_ok,materials_ok,confirmed_by_user_id,created_at,no_materials_confirmation_text) VALUES (?1,(SELECT id FROM jobs WHERE job_id=?2),1,1,1,?3,datetime('now'),?4)").bind(crypto.randomUUID(), jobId, auth.user.id, b.noMaterialsConfirmationText || null).run();
  return json({ ok: true });
}
async function history(request, env, jobId) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const events = await env.DB.prepare("SELECT e.*, u.full_name actor_name FROM job_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.job_id=(SELECT id FROM jobs WHERE job_id=?1) ORDER BY e.created_at DESC").bind(jobId).all();
  const status = await env.DB.prepare("SELECT h.*, u.full_name actor_name FROM job_status_history h LEFT JOIN users u ON u.id=h.changed_by_user_id WHERE h.job_id=(SELECT id FROM jobs WHERE job_id=?1) ORDER BY h.changed_at DESC").bind(jobId).all();
  return json({ events: events.results, status: status.results });
}

async function scheduler(request, env, url) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);
  const engineers = (await env.DB.prepare("SELECT id,name,code FROM engineers WHERE active=1 ORDER BY name").all()).results;
  for (const e of engineers) {
    e.jobs = (await env.DB.prepare(`SELECT j.job_id,j.title FROM scheduler_entries s JOIN jobs j ON j.id=s.job_id WHERE s.engineer_id=?1 AND s.scheduled_date=?2 ORDER BY s.sequence ASC`).bind(e.id, date).all()).results;
  }
  const unscheduledJobs = (await env.DB.prepare(`SELECT j.job_id,j.title FROM jobs j WHERE j.current_status IN ('Pending','Scheduled') AND NOT EXISTS(SELECT 1 FROM scheduler_entries s WHERE s.job_id=j.id AND s.scheduled_date=?1) ORDER BY j.priority_rank DESC LIMIT 200`).bind(date).all()).results;
  return json({ date, engineers, unscheduledJobs });
}
async function schedulerMove(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const { jobId, engineerId, date } = await parseBody(request);
  await env.DB.prepare("DELETE FROM scheduler_entries WHERE job_id=(SELECT id FROM jobs WHERE job_id=?1) AND scheduled_date=?2").bind(jobId, date).run();
  if (engineerId) {
    await env.DB.prepare("INSERT INTO scheduler_entries (id,job_id,engineer_id,scheduled_date,sequence,created_by_user_id,created_at) VALUES (?1,(SELECT id FROM jobs WHERE job_id=?2),?3,?4,(SELECT coalesce(max(sequence),0)+1 FROM scheduler_entries WHERE engineer_id=?3 AND scheduled_date=?4),?5,datetime('now'))").bind(crypto.randomUUID(), jobId, engineerId, date, auth.user.id).run();
  }
  await env.DB.prepare("INSERT INTO job_events (id,job_id,event_type,details,actor_user_id,created_at) VALUES (?1,(SELECT id FROM jobs WHERE job_id=?2),'ScheduleMove',?3,?4,datetime('now'))").bind(crypto.randomUUID(), jobId, `Moved to ${engineerId || 'unscheduled'} on ${date}`, auth.user.id).run();
  return json({ ok: true });
}

async function financialDefaults(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const row = await env.DB.prepare("SELECT * FROM system_config WHERE key='financial_defaults'").first();
  return json(row ? JSON.parse(row.value_json) : {});
}
async function updateFinancialDefaults(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const body = await parseBody(request);
  await env.DB.prepare("INSERT INTO system_config (key,value_json,updated_at) VALUES ('financial_defaults',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')").bind(JSON.stringify(body)).run();
  return json({ ok: true });
}
async function financialSummary(request, env) {
  const auth = await requireAuth(request, env); if (auth.error) return auth.error;
  const deny = requireRole(auth.user, ["office", "master"]); if (deny) return deny;
  const rows = await env.DB.prepare("SELECT j.job_id,j.current_status,c.actual_total,c.client_total FROM jobs j LEFT JOIN job_costing c ON c.job_id=j.id ORDER BY j.updated_at DESC LIMIT 100").all();
  return json(rows.results);
}
