/**
 * Cloudflare Workers Weekly Timesheet App (Portal-Authenticated)
 *
 * Setup Instructions:
 * 1) Create KV namespaces:
 *    - wrangler kv:namespace create USERS
 *    - wrangler kv:namespace create TIMESHEETS
 *
 * 2) Add namespace IDs to wrangler.toml under [[kv_namespaces]].
 *
 * 3) Configure your existing portal/proxy to forward authenticated user identity headers:
 *    - x-portal-user-id (required)
 *    - x-portal-full-name
 *    - x-portal-email
 *    - x-portal-employment-type (employee|subcontractor)
 *    - x-portal-rate
 *    - x-portal-rate-type (hourly|daily)
 *    - x-portal-address
 *    - x-portal-company-name
 *    - x-portal-payment-details
 *
 * 4) Deploy:
 *    - wrangler deploy
 *
 * Notes:
 * - No login/register pages are required.
 * - Identity is trusted from your existing portal and enforced server-side.
 * - Front-end files are served from /public via Wrangler assets binding.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env, url);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleApiRequest(request, env, url) {
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname === '/api/me' && method === 'GET') {
    return withPortalUser(request, env, async (user) => jsonResponse({ user }));
  }

  if (pathname === '/api/profile' && method === 'PUT') {
    return withPortalUser(request, env, async (user) => updateProfile(request, env, user));
  }

  if (pathname === '/api/dashboard' && method === 'GET') {
    return withPortalUser(request, env, async (user) => getDashboard(env, user));
  }

  if (pathname === '/api/timesheet' && method === 'GET') {
    return withPortalUser(request, env, async (user) => getTimesheet(url, env, user));
  }

  if (pathname === '/api/timesheet' && method === 'POST') {
    return withPortalUser(request, env, async (user) => createTimesheet(request, env, user));
  }

  if (pathname === '/api/timesheet' && method === 'PUT') {
    return withPortalUser(request, env, async (user) => updateTimesheet(request, env, user));
  }

  if (pathname === '/api/invoice' && method === 'GET') {
    return withPortalUser(request, env, async (user) => getInvoice(url, env, user));
  }

  if (pathname === '/api/invoice/print' && method === 'GET') {
    return withPortalUser(request, env, async (user) => getInvoicePrintableHtml(url, env, user));
  }

  if (pathname === '/api/admin/timesheets' && method === 'GET') {
    return adminListTimesheets(request, env);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

async function withPortalUser(request, env, fn) {
  const user = await getOrSyncPortalUser(request, env);
  if (user.error) return user.error;
  return fn(user);
}

async function getOrSyncPortalUser(request, env) {
  const hdr = request.headers;
  const userId = (hdr.get('x-portal-user-id') || '').trim();
  if (!userId) {
    return { error: jsonResponse({ error: 'Missing portal identity header x-portal-user-id' }, 401) };
  }

  const key = `user:${userId}`;
  const existing = await env.USERS.get(key, 'json');

  const merged = {
    userId,
    fullName: firstNonEmpty(hdr.get('x-portal-full-name'), existing?.fullName, 'Portal User'),
    employmentType: normalizeEmployment(firstNonEmpty(hdr.get('x-portal-employment-type'), existing?.employmentType, 'employee')),
    rate: normalizeRate(firstNonEmpty(hdr.get('x-portal-rate'), existing?.rate, 0)),
    rateType: normalizeRateType(firstNonEmpty(hdr.get('x-portal-rate-type'), existing?.rateType, 'hourly')),
    address: firstNonEmpty(hdr.get('x-portal-address'), existing?.address, ''),
    email: firstNonEmpty(hdr.get('x-portal-email'), existing?.email, ''),
    companyName: firstNonEmpty(hdr.get('x-portal-company-name'), existing?.companyName, ''),
    paymentDetails: firstNonEmpty(hdr.get('x-portal-payment-details'), existing?.paymentDetails, ''),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (merged.employmentType === 'subcontractor' && !merged.companyName) {
    merged.companyName = 'Subcontractor';
  }

  await env.USERS.put(key, JSON.stringify(merged));
  return sanitizeUser(merged);
}

async function updateProfile(request, env, currentUser) {
  const body = await safeJson(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON payload' }, 400);

  const updated = {
    ...currentUser,
    fullName: body.fullName !== undefined ? String(body.fullName).trim() : currentUser.fullName,
    address: body.address !== undefined ? String(body.address).trim() : currentUser.address,
    paymentDetails: body.paymentDetails !== undefined ? String(body.paymentDetails).trim() : currentUser.paymentDetails,
    companyName: body.companyName !== undefined ? String(body.companyName).trim() : currentUser.companyName,
    updatedAt: new Date().toISOString()
  };

  if (body.rate !== undefined) updated.rate = normalizeRate(body.rate);
  if (body.rateType !== undefined) updated.rateType = normalizeRateType(body.rateType);

  if (updated.employmentType === 'subcontractor' && !updated.companyName) {
    return jsonResponse({ error: 'companyName is required for subcontractors' }, 400);
  }

  await env.USERS.put(`user:${currentUser.userId}`, JSON.stringify(updated));
  return jsonResponse({ user: sanitizeUser(updated) });
}

async function getDashboard(env, user) {
  const currentWeek = getISOWeekInfo(new Date());
  const currentKey = timesheetKey(user.userId, currentWeek.year, currentWeek.weekNumber);
  const currentTimesheet = await env.TIMESHEETS.get(currentKey, 'json');

  const timesheets = (await listAllByPrefix(env.TIMESHEETS, `timesheet:${user.userId}:`))
    .map((item) => item.value)
    .sort((a, b) => (a.year === b.year ? b.weekNumber - a.weekNumber : b.year - a.year));

  return jsonResponse({
    user,
    currentWeek,
    hasCurrentTimesheet: Boolean(currentTimesheet),
    timesheets
  });
}

async function getTimesheet(url, env, user) {
  const wk = resolveYearWeekFromUrl(url) || getISOWeekInfo(new Date());
  const key = timesheetKey(user.userId, wk.year, wk.weekNumber);
  const sheet = await env.TIMESHEETS.get(key, 'json');

  if (!sheet) {
    return jsonResponse({
      exists: false,
      year: wk.year,
      weekNumber: wk.weekNumber,
      weekStartDate: isoWeekStartDate(wk.year, wk.weekNumber),
      entries: buildEmptyEntries()
    });
  }

  return jsonResponse({ exists: true, ...sheet });
}

async function createTimesheet(request, env, user) {
  const body = await safeJson(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON payload' }, 400);

  const current = getISOWeekInfo(new Date());
  const year = Number(body.year ?? current.year);
  const weekNumber = Number(body.weekNumber ?? current.weekNumber);
  if (!Number.isInteger(year) || !Number.isInteger(weekNumber)) {
    return jsonResponse({ error: 'year and weekNumber must be integers' }, 400);
  }

  const key = timesheetKey(user.userId, year, weekNumber);
  const existing = await env.TIMESHEETS.get(key);
  if (existing) return jsonResponse({ error: 'Timesheet already exists for this week' }, 409);

  const checked = validateTimesheetEntries(body.entries);
  if (!checked.ok) return jsonResponse({ error: checked.error }, 400);

  const timesheet = {
    userId: user.userId,
    year,
    weekNumber,
    weekStartDate: body.weekStartDate || isoWeekStartDate(year, weekNumber),
    entries: checked.entries,
    totalHours: sumHours(checked.entries),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await env.TIMESHEETS.put(key, JSON.stringify(timesheet));
  return jsonResponse({ message: 'Timesheet created', timesheet }, 201);
}

async function updateTimesheet(request, env, user) {
  const body = await safeJson(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON payload' }, 400);

  const year = Number(body.year);
  const weekNumber = Number(body.weekNumber);
  if (!Number.isInteger(year) || !Number.isInteger(weekNumber)) {
    return jsonResponse({ error: 'year and weekNumber are required integers' }, 400);
  }

  const key = timesheetKey(user.userId, year, weekNumber);
  const existing = await env.TIMESHEETS.get(key, 'json');
  if (!existing) return jsonResponse({ error: 'Timesheet not found for given week' }, 404);

  const checked = validateTimesheetEntries(body.entries);
  if (!checked.ok) return jsonResponse({ error: checked.error }, 400);

  const updated = {
    ...existing,
    entries: checked.entries,
    totalHours: sumHours(checked.entries),
    updatedAt: new Date().toISOString()
  };

  await env.TIMESHEETS.put(key, JSON.stringify(updated));
  return jsonResponse({ message: 'Timesheet updated', timesheet: updated });
}

async function getInvoice(url, env, user) {
  if (user.employmentType !== 'subcontractor') {
    return jsonResponse({ error: 'Invoices are available only for subcontractors' }, 403);
  }

  const wk = resolveYearWeekFromUrl(url);
  if (!wk) return jsonResponse({ error: 'year and weekNumber query params are required' }, 400);

  const sheet = await env.TIMESHEETS.get(timesheetKey(user.userId, wk.year, wk.weekNumber), 'json');
  if (!sheet) return jsonResponse({ error: 'Timesheet not found' }, 404);

  return jsonResponse({ invoice: buildInvoice(user, sheet) });
}

async function getInvoicePrintableHtml(url, env, user) {
  if (user.employmentType !== 'subcontractor') {
    return new Response('<h1>Forbidden</h1><p>Employees cannot generate invoices.</p>', {
      status: 403,
      headers: { 'content-type': 'text/html; charset=UTF-8' }
    });
  }

  const wk = resolveYearWeekFromUrl(url);
  if (!wk) return new Response('Missing year/weekNumber', { status: 400 });

  const sheet = await env.TIMESHEETS.get(timesheetKey(user.userId, wk.year, wk.weekNumber), 'json');
  if (!sheet) return new Response('Timesheet not found', { status: 404 });

  return new Response(renderInvoiceHtml(buildInvoice(user, sheet)), {
    headers: { 'content-type': 'text/html; charset=UTF-8' }
  });
}

async function adminListTimesheets(request, env) {
  const token = request.headers.get('x-admin-token');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return jsonResponse({ error: 'Unauthorized admin access' }, 401);
  }

  const listed = await listAllByPrefix(env.TIMESHEETS, 'timesheet:');
  return jsonResponse({ count: listed.length, timesheets: listed.map((i) => i.value) });
}

function buildInvoice(user, timesheet) {
  const totalHours = sumHours(timesheet.entries);
  const totalAmount = user.rateType === 'daily'
    ? timesheet.entries.filter((e) => Number(e.hours || 0) > 0).length * user.rate
    : totalHours * user.rate;

  return {
    invoiceNumber: `INV-${user.userId}-${timesheet.year}-${timesheet.weekNumber}`,
    issuedDate: new Date().toISOString(),
    user,
    timesheet: {
      year: timesheet.year,
      weekNumber: timesheet.weekNumber,
      weekStartDate: timesheet.weekStartDate,
      entries: timesheet.entries,
      totalHours
    },
    totalAmount: Number(totalAmount.toFixed(2))
  };
}

function renderInvoiceHtml(invoice) {
  const rows = invoice.timesheet.entries.map((e) =>
    `<tr><td>${escapeHtml(e.day)}</td><td>${e.hours}</td><td>${escapeHtml(e.description || '')}</td></tr>`
  ).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title>
  <style>body{font-family:Arial;margin:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}.total{font-weight:bold;margin-top:16px}@media print{button{display:none}}</style>
  </head><body>
  <button onclick="window.print()">Print</button>
  <h1>Invoice ${escapeHtml(invoice.invoiceNumber)}</h1>
  <p><strong>Contractor:</strong> ${escapeHtml(invoice.user.companyName || invoice.user.fullName)}</p>
  <p><strong>Email:</strong> ${escapeHtml(invoice.user.email || '')}</p>
  <p><strong>Week:</strong> ${invoice.timesheet.weekNumber}, ${invoice.timesheet.year}</p>
  <table><thead><tr><th>Day</th><th>Hours</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="total">Total: ${invoice.totalAmount.toFixed(2)}</p>
  <p><strong>Payment Details:</strong> ${escapeHtml(invoice.user.paymentDetails || '')}</p>
  </body></html>`;
}

function validateTimesheetEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== 7) {
    return { ok: false, error: 'entries must be an array with 7 items (Mon-Sun)' };
  }

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  try {
    return {
      ok: true,
      entries: days.map((day, i) => {
        const hours = Number(entries[i]?.hours ?? 0);
        if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
          throw new Error(`Invalid hours for ${day}`);
        }
        return {
          day,
          hours,
          description: String(entries[i]?.description ?? '').slice(0, 1000)
        };
      })
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function buildEmptyEntries() {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({ day, hours: 0, description: '' }));
}

function sumHours(entries) {
  return Number(entries.reduce((a, b) => a + Number(b.hours || 0), 0).toFixed(2));
}

function timesheetKey(userId, year, weekNumber) {
  return `timesheet:${userId}:${year}:${weekNumber}`;
}

function resolveYearWeekFromUrl(url) {
  const year = Number(url.searchParams.get('year'));
  const weekNumber = Number(url.searchParams.get('weekNumber'));
  if (!Number.isInteger(year) || !Number.isInteger(weekNumber)) return null;
  return { year, weekNumber };
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function sanitizeUser(user) {
  return {
    userId: user.userId,
    fullName: user.fullName,
    employmentType: user.employmentType,
    rate: user.rate,
    rateType: user.rateType,
    address: user.address,
    email: user.email,
    companyName: user.companyName,
    paymentDetails: user.paymentDetails,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function getISOWeekInfo(dateInput) {
  const date = new Date(Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const year = date.getUTCFullYear();
  return { year, weekNumber, weekStartDate: isoWeekStartDate(year, weekNumber) };
}

function isoWeekStartDate(year, weekNumber) {
  const simple = new Date(Date.UTC(year, 0, 1 + (weekNumber - 1) * 7));
  const day = simple.getUTCDay();
  if (day <= 4) simple.setUTCDate(simple.getUTCDate() - (day === 0 ? 6 : day - 1));
  else simple.setUTCDate(simple.getUTCDate() + (8 - day));
  return simple.toISOString().slice(0, 10);
}

async function listAllByPrefix(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    cursor = page.cursor;
    for (const keyInfo of page.keys) {
      const value = await kv.get(keyInfo.name, 'json');
      if (value) out.push({ key: keyInfo.name, value });
    }
  } while (cursor);
  return out;
}

function normalizeEmployment(v) {
  return String(v).toLowerCase() === 'subcontractor' ? 'subcontractor' : 'employee';
}
function normalizeRateType(v) {
  return String(v).toLowerCase() === 'daily' ? 'daily' : 'hourly';
}
function normalizeRate(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' }
  });
}
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
