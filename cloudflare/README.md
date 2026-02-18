# Cloudflare Worker + KV Setup

This folder contains a Worker that stores employee profiles and weekly timesheets in KV.

## 1) Create KV namespaces

```bash
wrangler kv:namespace create PROFILES
wrangler kv:namespace create TIMESHEETS
wrangler kv:namespace create EMPLOYEE_TIMESHEETS
```

Update `wrangler.toml` with the returned `id` values.

## 2) Set API key (recommended)

Replace `API_KEY` in `wrangler.toml` with a strong key, or set it with secrets.

## 3) Deploy

```bash
cd cloudflare
wrangler deploy
```

## 4) Connect from the HTML page

In `Timesheet_Page.html`:
- Set **Worker Base URL** to your worker URL.
- Set **Worker API Key** to the same value as `API_KEY`.
- Use **Push Profile + Timesheets to Cloud** / **Pull Timesheets from Cloud**.

## API endpoints

- `PUT /api/profile/{employeeId}`
- `GET /api/profile/{employeeId}`
- `POST /api/timesheets` (duplicate week check by employee+week)
- `GET /api/timesheets?employeeId=...`
- `GET /api/timesheets/{employeeId}/{week}`
