import { json } from './_shared.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AppHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function appConfig(env = process.env) {
  const rawUrl = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  if (!rawUrl || !publishableKey) {
    throw new AppHttpError(503, 'APP_NOT_CONFIGURED', 'Control Tower staging is not configured');
  }
  let url;
  try { url = new URL(rawUrl); }
  catch { throw new AppHttpError(503, 'APP_NOT_CONFIGURED', 'Control Tower staging is not configured'); }
  if (url.protocol !== 'https:') {
    throw new AppHttpError(503, 'APP_NOT_CONFIGURED', 'Control Tower staging is not configured');
  }
  return { url: url.origin, publishableKey };
}

export function bearerToken(req) {
  const value = String(req.headers?.authorization ?? '');
  const match = /^Bearer\s+(.+)$/i.exec(value);
  if (!match?.[1]) throw new AppHttpError(401, 'AUTH_REQUIRED', 'Sign in is required');
  return match[1];
}

export async function supabaseJson(path, {
  token,
  env = process.env,
  fetchImpl = globalThis.fetch,
  method = 'GET',
  body,
  headers = {}
} = {}) {
  if (typeof fetchImpl !== 'function') throw new AppHttpError(500, 'FETCH_UNAVAILABLE', 'Server fetch is unavailable');
  const { url, publishableKey } = appConfig(env);
  const response = await fetchImpl(new URL(path, url), {
    method,
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); }
    catch { payload = null; }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new AppHttpError(401, 'AUTH_INVALID', 'Session is invalid or expired');
    }
    throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  }
  return payload;
}

export async function requireUser(req, deps = {}) {
  const token = bearerToken(req);
  const user = await supabaseJson('/auth/v1/user', { token, ...deps });
  if (!user?.id || !UUID_RE.test(user.id)) {
    throw new AppHttpError(401, 'AUTH_INVALID', 'Session is invalid or expired');
  }
  return { token, user };
}

export function requestedTenantId(req) {
  const tenantId = String(req.headers?.['x-cafeos-tenant-id'] ?? '').trim();
  if (!tenantId) throw new AppHttpError(400, 'TENANT_REQUIRED', 'Select a CafeOS tenant');
  if (!UUID_RE.test(tenantId)) throw new AppHttpError(400, 'TENANT_INVALID', 'Invalid CafeOS tenant');
  return tenantId;
}

export async function requireTenant(req, auth, deps = {}) {
  const tenantId = requestedTenantId(req);
  const params = new URLSearchParams({
    select: 'tenant_id,role',
    tenant_id: `eq.${tenantId}`,
    user_id: `eq.${auth.user.id}`,
    limit: '1'
  });
  const rows = await supabaseJson(`/rest/v1/tenant_members?${params}`, {
    token: auth.token,
    ...deps
  });
  const membership = Array.isArray(rows) ? rows[0] : null;
  if (!membership) throw new AppHttpError(403, 'TENANT_FORBIDDEN', 'You do not have access to this tenant');
  return { id: tenantId, role: membership.role };
}

export async function appContext(req, deps = {}) {
  const auth = await requireUser(req, deps);
  const tenant = await requireTenant(req, auth, deps);
  return { ...auth, tenant };
}

export function onlyGet(req, res) {
  if (req.method === 'GET') return true;
  res.setHeader('allow', 'GET');
  json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
  return false;
}

export function appError(res, error) {
  if (error instanceof AppHttpError) {
    return json(res, error.status, { error: { code: error.code, message: error.message } });
  }
  return json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}

export function appJson(res, status, payload) {
  return json(res, status, payload);
}
