import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyGet,
  requestedAsOfBusinessDate,
  supabaseJson
} from '../_app-auth.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestedStoreId(req) {
  const url = new URL(req.url ?? '/', 'https://cafeos.local');
  const storeId = String(url.searchParams.get('storeId') ?? '').trim();
  if (!storeId) {
    throw new AppHttpError(400, 'STORE_REQUIRED', 'Select a CafeOS Store');
  }
  if (!UUID_RE.test(storeId)) {
    throw new AppHttpError(400, 'STORE_INVALID', 'Invalid CafeOS Store');
  }
  return storeId;
}

function requireAggregate(payload, storeId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  }
  if (!payload.store || payload.store.id !== storeId || !payload.metrics || !payload.coverage || !payload.freshness) {
    throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  }
  return payload;
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const storeId = requestedStoreId(req);
    const asOfBusinessDate = requestedAsOfBusinessDate(req);

    const storeParams = new URLSearchParams({
      select: 'id,name,timezone,active',
      tenant_id: `eq.${ctx.tenant.id}`,
      id: `eq.${storeId}`,
      active: 'eq.true',
      limit: '1'
    });
    const stores = await supabaseJson(`/rest/v1/stores?${storeParams}`, {
      token: ctx.token,
      ...deps
    });
    const store = Array.isArray(stores) ? stores[0] ?? null : null;
    if (!store) {
      throw new AppHttpError(404, 'STORE_NOT_FOUND', 'Store is not available in this tenant');
    }

    const attentionParams = new URLSearchParams({
      select: 'id,type,severity,metric,scope_type,scope_key,current_value,baseline_value,delta_value,coverage,confidence,evidence,detector_version,status,created_at,updated_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      scope_type: 'eq.store',
      scope_key: `eq.${storeId}`,
      status: 'in.(open,acted)',
      order: 'created_at.desc',
      limit: '20'
    });

    const [aggregatePayload, attentionPayload] = await Promise.all([
      supabaseJson('/rest/v1/rpc/store_health_aggregate', {
        token: ctx.token,
        method: 'POST',
        body: {
          p_tenant_id: ctx.tenant.id,
          p_store_id: storeId,
          p_as_of_business_date: asOfBusinessDate
        },
        ...deps
      }),
      supabaseJson(`/rest/v1/attention_items?${attentionParams}`, {
        token: ctx.token,
        ...deps
      })
    ]);

    const aggregate = requireAggregate(aggregatePayload, storeId);
    const attention = Array.isArray(attentionPayload) ? attentionPayload : [];
    const attentionIds = attention
      .map(item => item?.id)
      .filter(id => typeof id === 'string' && UUID_RE.test(id));

    let unresolvedActions = [];
    if (attentionIds.length > 0) {
      const actionParams = new URLSearchParams({
        select: 'id,attention_item_id,owner_user_id,action_type,title,expected_metric,expected_direction,status,due_at,created_at,updated_at',
        tenant_id: `eq.${ctx.tenant.id}`,
        attention_item_id: `in.(${attentionIds.join(',')})`,
        status: 'in.(open,in_progress)',
        order: 'created_at.desc',
        limit: '20'
      });
      const actionsPayload = await supabaseJson(`/rest/v1/actions?${actionParams}`, {
        token: ctx.token,
        ...deps
      });
      unresolvedActions = Array.isArray(actionsPayload) ? actionsPayload : [];
    }

    return appJson(res, 200, {
      kind: 'control-tower-store-health',
      tenant: ctx.tenant,
      store: aggregate.store,
      asOfBusinessDate: aggregate.asOfBusinessDate ?? null,
      freshness: aggregate.freshness,
      coverage: aggregate.coverage,
      metrics: aggregate.metrics,
      attention,
      unresolvedActions,
      capabilities: {
        persistedAttention: true,
        actionRead: true,
        deterministicMetrics: true
      }
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
