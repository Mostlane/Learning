# Cloudflare Internal Engineering Job Portal

Complete plain HTML/CSS/vanilla JS frontend and Cloudflare Worker architecture for a role-based internal job system.

## Implemented
- Real pages: `login.html`, `admin.html`, `job-view.html`, `off-view.html`, `financial.html`, `scheduler.html`
- Shared theme system (global CSS variables, cards, timeline, badges, tables, forms)
- Shared frontend API layer to live Worker backend:
  - `https://job-application.jamie-def.workers.dev`
- Worker route architecture with role checks, workflow guards, scheduling persistence, hold approval flow, completion validation, and financial endpoints.
- Full D1 schema with indexes and entities for auth, jobs, events, scheduling, costing, files, approvals, materials.

## Quick start (frontend)
Serve `frontend/` statically and open `frontend/pages/login.html`.

Example:
```bash
cd Job_system/frontend
python3 -m http.server 4173
```

## Worker reference
Worker code is under `worker/src` and is structured for a universal API Worker using D1 and R2 metadata patterns.

## Database
Apply `database/schema.sql` to D1.

## Temporary constants requiring your real values
- Password hashing implementation is currently marked for replacement in Worker login logic.
- R2 bucket binding name and signed URL strategy (depends on your Cloudflare account naming).
