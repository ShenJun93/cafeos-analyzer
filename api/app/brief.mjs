import { appContext, appError, appJson, onlyGet, supabaseJson } from '../_app-auth.mjs';

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const importParams = new URLSearchParams({
      select: 'id,source_namespace,status,row_count,invalid_row_count,created_at,committed_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      status: 'eq.committed',
      order: 'committed_at.desc.nullslast,created_at.desc',
      limit: '1'
    });
    const storeParams = new URLSearchParams({
      select: 'id,name,timezone,active',
      tenant_id: `eq.${ctx.tenant.id}`,
      active: 'eq.true',
      order: 'name.asc',
      limit: '100'
    });
    const attentionParams = new URLSearchParams({
      select: 'id,type,severity,metric,scope_type,scope_key,current_value,baseline_value,delta_value,coverage,confidence,evidence,detector_version,status,created_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      status: 'in.(open,acted)',
      order: 'created_at.desc',
      limit: '10'
    });
    const actionParams = new URLSearchParams({
      select: 'id,attention_item_id,owner_user_id,action_type,title,expected_metric,expected_direction,status,due_at,created_at,updated_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      status: 'in.(open,in_progress)',
      order: 'created_at.desc',
      limit: '20'
    });

    const [imports, stores, attention, actions] = await Promise.all([
      supabaseJson(`/rest/v1/imports?${importParams}`, { token: ctx.token, ...deps }),
      supabaseJson(`/rest/v1/stores?${storeParams}`, { token: ctx.token, ...deps }),
      supabaseJson(`/rest/v1/attention_items?${attentionParams}`, { token: ctx.token, ...deps }),
      supabaseJson(`/rest/v1/actions?${actionParams}`, { token: ctx.token, ...deps })
    ]);

    const latestImport = Array.isArray(imports) ? imports[0] ?? null : null;
    const storeRows = Array.isArray(stores) ? stores : [];
    const attentionRows = Array.isArray(attention) ? attention : [];
    const actionRows = Array.isArray(actions) ? actions : [];

    return appJson(res, 200, {
      kind: 'control-tower-read-shell',
      tenant: ctx.tenant,
      dataFreshness: latestImport ? {
        importId: latestImport.id,
        sourceNamespace: latestImport.source_namespace,
        committedAt: latestImport.committed_at ?? latestImport.created_at,
        rowCount: latestImport.row_count,
        invalidRowCount: latestImport.invalid_row_count
      } : null,
      storeCount: storeRows.length,
      stores: storeRows,
      attention: attentionRows,
      unresolvedActions: actionRows,
      capabilities: {
        persistedAttention: true,
        actionRead: true,
        deterministicTopMetrics: false
      }
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
