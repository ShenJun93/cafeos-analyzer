import { AppHttpError, appError, appJson, checkedTenantMembership, onlyGet, requireUser, supabaseJson } from '../_app-auth.mjs';

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const auth = await requireUser(req, deps);
    const membershipParams = new URLSearchParams({
      select: 'tenant_id,role',
      user_id: `eq.${auth.user.id}`
    });
    const memberships = await supabaseJson(`/rest/v1/tenant_members?${membershipParams}`, {
      token: auth.token,
      ...deps
    });
    if (!Array.isArray(memberships)) {
      throw new AppHttpError(502, 'TENANT_MEMBERSHIP_INVALID', 'Tenant membership evidence is invalid');
    }
    const safeMemberships = memberships.map(checkedTenantMembership);
    const ids = safeMemberships.map(x => x.tenantId);
    if (new Set(ids).size !== ids.length) {
      throw new AppHttpError(502, 'TENANT_MEMBERSHIP_INVALID', 'Tenant membership evidence is invalid');
    }

    let tenantNames = new Map();
    if (ids.length) {
      const tenantParams = new URLSearchParams({
        select: 'id,name',
        id: `in.(${ids.join(',')})`
      });
      const tenants = await supabaseJson(`/rest/v1/tenants?${tenantParams}`, {
        token: auth.token,
        ...deps
      });
      if (!Array.isArray(tenants) || tenants.some(x =>
        !x || typeof x !== 'object' || Array.isArray(x) ||
        !ids.includes(x.id) || typeof x.name !== 'string' || !x.name.trim()) ||
        new Set(tenants.map(x => x.id)).size !== tenants.length) {
        throw new AppHttpError(502, 'TENANT_DIRECTORY_INVALID', 'Tenant directory evidence is invalid');
      }
      tenantNames = new Map(tenants.map(x => [x.id, x.name]));
    }

    return appJson(res, 200, {
      user: { id: auth.user.id },
      memberships: safeMemberships.map(x => ({
        tenantId: x.tenantId,
        role: x.role,
        name: tenantNames.get(x.tenantId) ?? null
      }))
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
