import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared caller checks for edge functions.
 *
 * Most functions run with verify_jwt = false (see supabase/config.toml) and use
 * the service-role key internally, so they MUST check the caller themselves.
 *
 * Usage (after the CORS preflight branch, before reading the body or touching the DB):
 *
 *   const auth = await requireAdmin(req, corsHeaders);
 *   if (auth instanceof Response) return auth;
 *
 * Accepted callers:
 *  - requireAdmin: a signed-in user with role 'admin' in public.user_roles, or an internal
 *    call that presents the service-role key as its bearer token (self-chaining functions,
 *    other edge functions), when allowServiceRole is true (the default).
 *  - requireUser: any signed-in user (the anon / publishable key is NOT a user).
 *  - requireCronOrAdmin: like requireAdmin, plus a scheduler presenting the CRON_SECRET env
 *    value in the `x-cron-secret` header.
 */

export interface AuthContext {
  /** auth.users id of the caller, or null for service-role / cron callers. */
  userId: string | null;
  /** true when the caller presented the service-role key or the cron secret. */
  internal: boolean;
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Constant-time string comparison (avoids leaking the secret through timing). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** True when the request carries the service-role key as its bearer token. */
export function isServiceRoleRequest(req: Request): boolean {
  const token = getBearerToken(req);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!token && !!serviceKey && safeEqual(token, serviceKey);
}

/** True when the request carries the CRON_SECRET env value in `x-cron-secret`. */
export function isCronRequest(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  const presented = req.headers.get("x-cron-secret");
  return !!secret && !!presented && safeEqual(presented, secret);
}

/** Validates the bearer JWT with the auth server and returns the user id, or null. */
async function getUserId(req: Request): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // getUser(token) asks GoTrue to validate the token (signature, expiry, session),
  // so a forged or anon-key bearer is rejected.
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch (e) {
    console.error("auth.getUser failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function hasRole(userId: string, role: string): Promise<boolean> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    const { data, error } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", role)
      .limit(1);
    if (error) {
      console.error("user_roles lookup failed:", error.message);
      return false;
    }
    return !!data && data.length > 0;
  } catch (e) {
    console.error("user_roles lookup failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Any signed-in user. Returns a 401 Response otherwise. */
export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthContext | Response> {
  const userId = await getUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);
  return { userId, internal: false };
}

/** Admin user (or service-role internal call). Returns a 401/403 Response otherwise. */
export async function requireAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
  opts: { allowServiceRole?: boolean } = {},
): Promise<AuthContext | Response> {
  if ((opts.allowServiceRole ?? true) && isServiceRoleRequest(req)) {
    return { userId: null, internal: true };
  }
  const userId = await getUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);
  if (!(await hasRole(userId, "admin"))) {
    return json({ error: "Admin access required" }, 403, corsHeaders);
  }
  return { userId, internal: false };
}

/** Scheduler (x-cron-secret), service-role call, or admin user. */
export async function requireCronOrAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthContext | Response> {
  if (isCronRequest(req)) return { userId: null, internal: true };
  return requireAdmin(req, corsHeaders);
}
