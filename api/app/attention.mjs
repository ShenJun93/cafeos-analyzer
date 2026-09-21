import { appContext, appError, appJson, onlyGet, supabaseJson } from '../_app-auth.mjs';

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const params = new URLSearchParams({
      select: 'id,type,severity,metric,scope_type,scope_key,current_value,baseline_value,delta_value,coverage,confidence,evidence,detector_version,status,created_at,updated_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      status: 'in.(open,acted)',
      order: 'created_at.desc',
      limit: '20'
    });
    const items = await supabaseJson(`/rest/v1/attention_items?${params}`, {
      token: ctx.token,
      ...deps
    });
    return appJson(res, 200, {
      tenant: ctx.tenant,
      attention: Array.isArray(items) ? items : []
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
