# Setup Notes

## 1) Review repository structure
1. Open `docs/file-structure.md`.
2. Confirm frontend pages exist in `frontend/pages/`.
3. Confirm Worker architecture exists in `worker/src/`.
4. Confirm schema exists at `database/schema.sql`.

## 2) Configure Cloudflare D1
1. Create database: `wrangler d1 create job-system`.
2. Bind DB in `worker/wrangler.toml` as `DB`.
3. Apply schema:
   - `wrangler d1 execute job-system --file=../database/schema.sql`
4. Seed roles/users including master `JamieLine`.

## 3) Configure Cloudflare R2
1. Create bucket for job files (photos, signatures, attachments).
2. Add Worker binding in `wrangler.toml` (e.g. `JOB_FILES`).
3. Implement signed retrieval endpoint in Worker if private object access is required.
4. Store only metadata in `job_files`; store binaries in R2.

## 4) Connect frontend pages
1. Keep `frontend/js/config.js` API base as:
   - `https://job-application.jamie-def.workers.dev`
2. Serve frontend statically.
3. Validate `/api/auth/session` from browser network tab.

## 5) Test login
1. Open `frontend/pages/login.html`.
2. Login with master/office/engineer account.
3. Verify role-aware redirect (`admin` vs `off-view`).
4. Verify logout from admin/engineer pages.

## 6) Test jobs
1. In `admin.html`, create a new job.
2. Filter/search by status and search text.
3. Open `job-view.html` and change status, add notes, add materials.
4. Attempt completion without requirements to confirm backend validation.

## 7) Test hold approvals
1. From `job-view`, request hold.
2. Verify status changes to `Awaiting Hold Approval`.
3. In `admin`, approve/reject hold and verify status transition + logs.

## 8) Test scheduler
1. Open `scheduler.html`.
2. Drag job chip from unscheduled to engineer lane.
3. Verify persisted move after page reload.
4. Confirm blocked invalid moves return visible error notice.

## 9) Test financial page
1. Open `financial.html` as office/master.
2. Save default rates.
3. Update a job cost and trigger export payload.
4. Verify summary list refreshes.
