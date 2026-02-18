export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (!authorize(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    try {
      if (pathname.startsWith("/api/profile/")) {
        const employeeId = decodeURIComponent(pathname.replace("/api/profile/", "")).trim();
        if (!employeeId) return json({ error: "employeeId required" }, 400);

        if (request.method === "GET") {
          const profile = await env.PROFILES.get(employeeId, "json");
          return json({ profile: profile || null });
        }

        if (request.method === "PUT") {
          const profile = await request.json();
          await env.PROFILES.put(employeeId, JSON.stringify(profile));
          return json({ ok: true });
        }
      }

      if (pathname === "/api/timesheets" && request.method === "GET") {
        const employeeId = (searchParams.get("employeeId") || "").trim();
        if (!employeeId) return json({ error: "employeeId query param required" }, 400);

        const listKey = `employee:${employeeId}:weeks`;
        const keys = (await env.EMPLOYEE_TIMESHEETS.get(listKey, "json")) || [];
        const records = [];
        for (const key of keys) {
          const record = await env.TIMESHEETS.get(key, "json");
          if (record) records.push(record);
        }
        return json({ records });
      }

      if (pathname === "/api/timesheets" && request.method === "POST") {
        const record = await request.json();
        const employeeId = (record.employeeId || "").trim();
        const week = (record.week || "").trim();
        if (!employeeId || !week) return json({ error: "employeeId and week are required" }, 400);

        const normalizedId = employeeId.toLowerCase();
        const timesheetKey = `timesheet:${normalizedId}:${week}`;
        const existing = await env.TIMESHEETS.get(timesheetKey, "json");
        if (existing) return json({ error: "Duplicate timesheet for employee/week" }, 409);

        const employeeWeekKey = `${normalizedId}::${week}`;
        const mergedRecord = {
          ...record,
          employeeId,
          employeeWeekKey,
          createdAt: record.createdAt || new Date().toISOString()
        };

        await env.TIMESHEETS.put(timesheetKey, JSON.stringify(mergedRecord));

        const listKey = `employee:${employeeId}:weeks`;
        const keys = (await env.EMPLOYEE_TIMESHEETS.get(listKey, "json")) || [];
        keys.push(timesheetKey);
        await env.EMPLOYEE_TIMESHEETS.put(listKey, JSON.stringify(keys));

        return json({ ok: true, key: timesheetKey }, 201);
      }

      if (pathname.startsWith("/api/timesheets/") && request.method === "GET") {
        const parts = pathname.split("/").filter(Boolean);
        if (parts.length !== 4) return json({ error: "Use /api/timesheets/{employeeId}/{week}" }, 400);
        const employeeId = decodeURIComponent(parts[2]).trim().toLowerCase();
        const week = decodeURIComponent(parts[3]).trim();
        const key = `timesheet:${employeeId}:${week}`;
        const record = await env.TIMESHEETS.get(key, "json");
        if (!record) return json({ error: "Not found" }, 404);
        return json({ record });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || "Unexpected error" }, 500);
    }
  }
};

function authorize(request, env) {
  if (!env.API_KEY) return true;
  return request.headers.get("x-api-key") === env.API_KEY;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
