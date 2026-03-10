# Testing Notes

## Manual smoke checklist
- Login with each role and confirm redirects.
- Admin dashboard KPIs and job table load.
- Job detail page supports:
  - status update
  - hold request
  - materials add
  - completion validation
  - event/status timeline rendering
- Engineer view only shows relevant cards and hold-block indicators.
- Financial page only for office/master and can update defaults + export flow.
- Scheduler supports drag/drop and persists via API.

## CLI checks used in this implementation
- `node --check worker/src/index.js`
- `node --check worker/src/routes/index.js`
- `node --check worker/src/middleware/auth.js`
- `node --check frontend/js/pages/admin.js`
- `node --check frontend/js/pages/job-view.js`
