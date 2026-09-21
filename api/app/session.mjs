import { appError, appJson, onlyGet, requireUser, supabaseJson } from '../_app-auth.mjs';

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
    const safeMemberships = Array.isArray(memberships) ? memberships : [];
    const ids = [...new Set(safeMemberships.map(x => x.tenant_id).filter(Boolean))];

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
      tenantNames = new Map((Array.isArray(tenants) ? tenants : []).map(x => [x.id, x.name]));
    }

    return appJson(res, 200, {
      user: { id: auth.user.id },
      memberships: safeMemberships.map(x => ({
        tenantId: x.tenant_id,
        role: x.role,
        name: tenantNames.get(x.tenant_id) ?? null
      }))
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
