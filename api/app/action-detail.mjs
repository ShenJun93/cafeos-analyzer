import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyGet,
  supabaseJson
} from '../_app-auth.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestedActionId(req) {
  const url = new URL(req.url ?? '/', 'https://cafeos.local');
  const actionId = String(url.searchParams.get('actionId') ?? '').trim();
  if (!UUID_RE.test(actionId)) throw new AppHttpError(400, 'ACTION_INVALID', 'Invalid Action');
  return actionId;
}

function requireMeasurementResult(payload, windowId, actionId) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.measurementWindowId !== windowId ||
    payload.actionId !== actionId ||
    !payload.result ||
    payload.result.interpretation !== 'before_after_not_causal'
  ) {
    throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  }
  return payload;
}

export async function handle(req, res, deps = {}) {
  if (!onlyGet(req, res)) return;
  try {
    const ctx = await appContext(req, deps);
    const actionId = requestedActionId(req);

    const actionParams = new URLSearchParams({
      select: 'id,tenant_id,attention_item_id,owner_user_id,action_type,title,expected_metric,expected_direction,status,resolution_note,due_at,resolved_at,created_at,updated_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      id: `eq.${actionId}`,
      limit: '1'
    });
    const actionRows = await supabaseJson(`/rest/v1/actions?${actionParams}`, {
      token: ctx.token,
      ...deps
    });
    const action = Array.isArray(actionRows) ? actionRows[0] ?? null : null;
    if (!action) throw new AppHttpError(404, 'ACTION_NOT_FOUND', 'Action is not available in this tenant');

    const attentionPromise = action.attention_item_id
      ? (() => {
          const params = new URLSearchParams({
            select: 'id,type,severity,metric,scope_type,scope_key,current_value,baseline_value,delta_value,coverage,confidence,evidence,detector_version,status,created_at,updated_at',
            tenant_id: `eq.${ctx.tenant.id}`,
            id: `eq.${action.attention_item_id}`,
            limit: '1'
          });
          return supabaseJson(`/rest/v1/attention_items?${params}`, { token: ctx.token, ...deps });
        })()
      : Promise.resolve([]);

    const historyParams = new URLSearchParams({
      select: 'id,action_id,from_status,to_status,actor_user_id,note,created_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      action_id: `eq.${actionId}`,
      order: 'created_at.asc',
      limit: '50'
    });
    const measurementParams = new URLSearchParams({
      select: 'id,action_id,metric,scope_type,scope_key,baseline_start,baseline_end,measurement_start,measurement_end,status,created_at,updated_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      action_id: `eq.${actionId}`,
      order: 'created_at.asc',
      limit: '10'
    });

    const [attentionRows, historyRows, measurementRows] = await Promise.all([
      attentionPromise,
      supabaseJson(`/rest/v1/action_status_history?${historyParams}`, {
        token: ctx.token,
        ...deps
      }),
      supabaseJson(`/rest/v1/measurement_windows?${measurementParams}`, {
        token: ctx.token,
        ...deps
      })
    ]);

    const windows = Array.isArray(measurementRows) ? measurementRows : [];
    const results = await Promise.all(windows.map(async window => {
      const payload = await supabaseJson('/rest/v1/rpc/measurement_window_result', {
        token: ctx.token,
        method: 'POST',
        body: {
          p_tenant_id: ctx.tenant.id,
          p_measurement_window_id: window.id
        },
        ...deps
      });
      return {
        ...window,
        deterministicResult: requireMeasurementResult(payload, window.id, actionId)
      };
    }));

    return appJson(res, 200, {
      kind: 'control-tower-action-detail',
      tenant: ctx.tenant,
      action,
      attention: Array.isArray(attentionRows) ? attentionRows[0] ?? null : null,
      history: Array.isArray(historyRows) ? historyRows : [],
      measurementWindows: results,
      capabilities: {
        boundedWorkflowWrites: true,
        deterministicMeasurement: true,
        causalAttribution: false
      }
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
