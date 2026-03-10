import { err } from "../utils/response.js";

export async function requireAuth(request, env) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") || request.headers.get("x-session-token") || "";
  if (!token) return { error: err("Authentication required", 401) };
  const session = await env.DB.prepare(`SELECT s.*, u.id user_id, u.username, u.full_name, r.name role_name
    FROM user_sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id
    WHERE s.session_token=?1 AND s.revoked_at IS NULL AND s.expires_at > datetime('now')`).bind(token).first();
  if (!session) return { error: err("Invalid session", 401) };
  return {
    user: {
      id: session.user_id,
      username: session.username,
      fullName: session.full_name,
      role: session.role_name,
      actingAsUserId: session.acting_as_user_id
    }
  };
}

export function requireRole(user, roles = []) {
  if (!roles.includes(user.role)) return err("Forbidden", 403);
  return null;
}
