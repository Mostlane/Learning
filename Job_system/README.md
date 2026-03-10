# Job_system

Stage-based implementation for the Cloudflare internal engineering job portal.

## Stage 1 scaffold

### Folder structure

- `frontend/pages/` - UI pages (`login.html`, `admin.html`, `job-view.html`, `off-view.html`, `financial.html`, `scheduler.html`)
- `frontend/css/theme.css` - global theme variables and shared component styles
- `frontend/js/config.js` - Worker base URL configuration
- `frontend/js/api.js` - Worker-aware API helper layer
- `frontend/js/main.js` - basic session lookup bootstrap logic
- `worker/src/` - universal Worker source scaffold
- `database/` - D1 schema and migration files (next stage)
- `docs/` - setup/testing notes

## Run quick static preview

You can open any page directly in a browser, e.g.:

- `frontend/pages/login.html`
- `frontend/pages/admin.html`

Or serve the folder via any local static server.
