export const ACTIVE_STATUSES = ["Travelling", "On Site", "In Progress", "Awaiting Hold Approval"];

export async function ensureSingleActiveJob(env, engineerUserId, targetJobId) {
  const row = await env.DB.prepare(`SELECT j.job_id, j.current_status FROM jobs j
    JOIN job_engineers je ON je.job_id=j.id
    WHERE je.engineer_user_id=?1 AND je.released_at IS NULL AND j.current_status IN (${ACTIVE_STATUSES.map(() => "?").join(",")}) AND j.job_id != ?${ACTIVE_STATUSES.length + 2}
    LIMIT 1`).bind(engineerUserId, ...ACTIVE_STATUSES, targetJobId).first();
  if (row) throw new Error(`Engineer already active on ${row.job_id} (${row.current_status})`);
}

export function completionValidation(input) {
  const errs = [];
  if (!input.completionNotes?.trim()) errs.push("Completion notes required");
  if (!input.signatureName?.trim()) errs.push("Customer signature required");
  if (!input.materialsComplete) errs.push("Materials workflow incomplete");
  return errs;
}
