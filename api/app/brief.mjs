import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyGet,
  requestedAsOfBusinessDate,
  supabaseJson
} from '../_app-auth.mjs';

function requireAggregate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  }
  if (!payload.metrics || !payload.coverage || !payload.freshness) {
    throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  }
  return payload;
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const asOfBusinessDate = requestedAsOfBusinessDate(req);

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

    const [aggregatePayload, attention, actions] = await Promise.all([
      supabaseJson('/rest/v1/rpc/daily_brief_aggregate', {
        token: ctx.token,
        method: 'POST',
        body: {
          p_tenant_id: ctx.tenant.id,
          p_as_of_business_date: asOfBusinessDate
        },
        ...deps
      }),
      supabaseJson(`/rest/v1/attention_items?${attentionParams}`, { token: ctx.token, ...deps }),
      supabaseJson(`/rest/v1/actions?${actionParams}`, { token: ctx.token, ...deps })
    ]);

    const aggregate = requireAggregate(aggregatePayload);
    const attentionRows = Array.isArray(attention) ? attention : [];
    const actionRows = Array.isArray(actions) ? actions : [];

    return appJson(res, 200, {
      kind: 'control-tower-daily-brief',
      tenant: ctx.tenant,
      asOfBusinessDate: aggregate.asOfBusinessDate ?? null,
      freshness: aggregate.freshness,
      coverage: aggregate.coverage,
      metrics: aggregate.metrics,
      attention: attentionRows,
      unresolvedActions: actionRows,
      capabilities: {
        persistedAttention: true,
        actionRead: true,
        deterministicTopMetrics: true
      }
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
