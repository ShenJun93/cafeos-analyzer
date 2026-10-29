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
  headers = {},
  mapError
} = {}) {
  if (typeof fetchImpl !== 'function') throw new AppHttpError(500, 'FETCH_UNAVAILABLE', 'Server fetch is unavailable');
  const { url, publishableKey } = appConfig(env);
  // Never forward a merchant bearer token to a caller-supplied host.
  // URL() treats //host and some backslash variants as an absolute authority.
  if (typeof path !== 'string' || !path.startsWith('/') ||
      path.startsWith('//') || path.includes('\\')) {
    throw new AppHttpError(500, 'SUPABASE_PATH_INVALID', 'Invalid upstream path');
  }
  const endpoint = new URL(path, url);
  if (endpoint.origin !== url) {
    throw new AppHttpError(500, 'SUPABASE_PATH_INVALID', 'Invalid upstream path');
  }
  // In particular, do not allow an injected header to replace the signed-in
  // user's token with a privileged service key or another tenant's token.
  if (headers === null || typeof headers !== 'object' ||
      Object.keys(headers).some(key => /^(authorization|apikey|host|cookie)$/i.test(key))) {
    throw new AppHttpError(500, 'SUPABASE_HEADER_INVALID', 'Invalid upstream headers');
  }

  let response;
  let raw;
  try {
    const signal = AbortSignal.timeout(8000);
    response = await fetchImpl(endpoint, {
      method,
      signal,
      redirect: 'error',
      headers: {
        ...headers,
        apikey: publishableKey,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    raw = await response.text();
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new AppHttpError(504, 'SUPABASE_TIMEOUT', 'Data service timed out');
    }
    throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  }
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); }
    catch { payload = null; }
  }

  if (!response.ok) {
    const authErrorCode = String(payload?.error_code ?? payload?.code ?? '');
    const authRejected =
      response.status === 401 ||
      (
        response.status === 403 &&
        ['bad_jwt', 'unexpected_audience'].includes(authErrorCode)
      );

    if (authRejected) {
      throw new AppHttpError(401, 'AUTH_INVALID', 'Session is invalid or expired');
    }
    if (typeof mapError === 'function') {
      const mapped = mapError({ status: response.status, payload });
      if (mapped) throw mapped;
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

export function requestedAsOfBusinessDate(req) {
  const url = new URL(req.url ?? '/', 'https://cafeos.local');
  const raw = url.searchParams.get('asOfBusinessDate');
  if (raw === null || raw === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppHttpError(400, 'AS_OF_DATE_INVALID', 'Invalid as-of business date');
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new AppHttpError(400, 'AS_OF_DATE_INVALID', 'Invalid as-of business date');
  }
  return raw;
}

export function requestedTenantId(req) {
  const tenantId = String(req.headers?.['x-cafeos-tenant-id'] ?? '').trim();
  if (!tenantId) throw new AppHttpError(400, 'TENANT_REQUIRED', 'Select a CafeOS tenant');
  if (!UUID_RE.test(tenantId)) throw new AppHttpError(400, 'TENANT_INVALID', 'Invalid CafeOS tenant');
  return tenantId;
}

export const CAFEOS_TENANT_ROLES = Object.freeze([
  'owner', 'admin', 'manager', 'cashier', 'analyst', 'viewer'
]);

export function checkedTenantMembership(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      typeof row.tenant_id !== 'string' || !UUID_RE.test(row.tenant_id) ||
      typeof row.role !== 'string' || !CAFEOS_TENANT_ROLES.includes(row.role)) {
    throw new AppHttpError(502, 'TENANT_MEMBERSHIP_INVALID', 'Tenant membership evidence is invalid');
  }
  // PostgreSQL UUIDs are case-insensitive; canonicalize before comparing and
  // detecting duplicate membership IDs in an upstream response.
  return { tenantId: row.tenant_id.toLowerCase(), role: row.role };
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
  // PostgREST filters and RLS are necessary but not enough to assert what an
  // unexpected upstream payload actually contains before authorizing writes.
  if (!Array.isArray(rows)) {
    throw new AppHttpError(502, 'TENANT_MEMBERSHIP_INVALID', 'Tenant membership evidence is invalid');
  }
  if (rows.length === 0) {
    throw new AppHttpError(403, 'TENANT_FORBIDDEN', 'You do not have access to this tenant');
  }
  if (rows.length !== 1) {
    throw new AppHttpError(502, 'TENANT_MEMBERSHIP_INVALID', 'Tenant membership evidence is invalid');
  }
  const membership = checkedTenantMembership(rows[0]);
  if (membership.tenantId !== tenantId.toLowerCase()) {
    throw new AppHttpError(403, 'TENANT_FORBIDDEN', 'You do not have access to this tenant');
  }
  return { id: tenantId, role: membership.role };
}

export async function appContext(req, deps = {}) {
  const auth = await requireUser(req, deps);
  const tenant = await requireTenant(req, auth, deps);
  return { ...auth, tenant };
}

export function onlyMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('allow', method);
  json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
  return false;
}

export function onlyGet(req, res) {
  return onlyMethod(req, res, 'GET');
}

export function onlyPost(req, res) {
  return onlyMethod(req, res, 'POST');
}

export function onlyPatch(req, res) {
  return onlyMethod(req, res, 'PATCH');
}

export function requestJsonObject(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  throw new AppHttpError(400, 'BODY_INVALID', 'A JSON object body is required');
}

export function requireOperatorRole(ctx) {
  if (!['owner', 'admin', 'analyst'].includes(ctx?.tenant?.role)) {
    throw new AppHttpError(403, 'ROLE_FORBIDDEN', 'This workflow requires an operator role');
  }
  return ctx;
}

export function requireCommerceWriteRole(ctx) {
  if (!['owner', 'admin', 'manager', 'cashier'].includes(ctx?.tenant?.role)) {
    throw new AppHttpError(403, 'COMMERCE_ROLE_FORBIDDEN', 'This commerce workflow requires a commerce write role');
  }
  return ctx;
}

export function requireCommerceManagerRole(ctx) {
  if (!['owner', 'admin', 'manager'].includes(ctx?.tenant?.role)) {
    throw new AppHttpError(403, 'COMMERCE_MANAGER_FORBIDDEN', 'This commerce workflow requires a manager role');
  }
  return ctx;
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
