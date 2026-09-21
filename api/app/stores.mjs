import { appContext, appError, appJson, onlyGet, supabaseJson } from '../_app-auth.mjs';

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const params = new URLSearchParams({
      select: 'id,name,timezone,active,created_at,updated_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      order: 'name.asc',
      limit: '100'
    });
    const stores = await supabaseJson(`/rest/v1/stores?${params}`, {
      token: ctx.token,
      ...deps
    });
    return appJson(res, 200, {
      tenant: ctx.tenant,
      stores: Array.isArray(stores) ? stores : []
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
