import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyPost,
  requestJsonObject,
  requireOperatorRole,
  supabaseJson
} from '../_app-auth.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_METRICS = new Set(['net_sales', 'orders', 'aov']);
const ALLOWED_FIELDS = new Set([
  'actionId',
  'baselineStart',
  'baselineEnd',
  'measurementStart',
  'measurementEnd'
]);

function instant(value, code) {
  const raw = String(value ?? '').trim();
  const parsed = new Date(raw);
  if (
    Number.isNaN(parsed.valueOf()) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(raw) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)
  ) {
    throw new AppHttpError(400, code, 'Measurement timestamps require explicit timezone offsets');
  }
  return parsed;
}

function representation(payload) {
  const row = Array.isArray(payload) ? payload[0] : null;
  if (!row?.id) throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  return row;
}

export async function handle(req, res, deps = {}) {
  if (!onlyPost(req, res)) return;
  try {
    const ctx = requireOperatorRole(await appContext(req, deps));
    const body = requestJsonObject(req);
    if (Object.keys(body).some(key => !ALLOWED_FIELDS.has(key))) {
      throw new AppHttpError(400, 'BODY_FIELD_FORBIDDEN', 'Trusted Measurement fields cannot be supplied by the client');
    }

    const actionId = String(body.actionId ?? '').trim();
    if (!UUID_RE.test(actionId)) throw new AppHttpError(400, 'ACTION_INVALID', 'Invalid Action');

    const baselineStart = instant(body.baselineStart, 'BASELINE_START_INVALID');
    const baselineEnd = instant(body.baselineEnd, 'BASELINE_END_INVALID');
    const measurementStart = instant(body.measurementStart, 'MEASUREMENT_START_INVALID');
    const measurementEnd = instant(body.measurementEnd, 'MEASUREMENT_END_INVALID');
    if (!(baselineStart < baselineEnd && baselineEnd <= measurementStart && measurementStart < measurementEnd)) {
      throw new AppHttpError(400, 'MEASUREMENT_RANGE_INVALID', 'Measurement ranges are not ordered');
    }

    const actionParams = new URLSearchParams({
      select: 'id,attention_item_id,expected_metric,status',
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
    if (!action.attention_item_id) {
      throw new AppHttpError(409, 'ACTION_UNSUPPORTED', 'Measurement requires an Attention-linked Action');
    }

    const attentionParams = new URLSearchParams({
      select: 'id,metric,scope_type,scope_key',
      tenant_id: `eq.${ctx.tenant.id}`,
      id: `eq.${action.attention_item_id}`,
      limit: '1'
    });
    const attentionRows = await supabaseJson(`/rest/v1/attention_items?${attentionParams}`, {
      token: ctx.token,
      ...deps
    });
    const attention = Array.isArray(attentionRows) ? attentionRows[0] ?? null : null;
    if (
      !attention ||
      attention.scope_type !== 'store' ||
      !UUID_RE.test(String(attention.scope_key ?? '')) ||
      !SUPPORTED_METRICS.has(attention.metric) ||
      action.expected_metric !== attention.metric
    ) {
      throw new AppHttpError(409, 'ACTION_UNSUPPORTED', 'Action is outside the bounded Measurement loop');
    }

    const insertParams = new URLSearchParams({
      select: 'id,tenant_id,action_id,metric,scope_type,scope_key,baseline_start,baseline_end,measurement_start,measurement_end,status,created_at,updated_at'
    });
    const inserted = await supabaseJson(
      `/rest/v1/measurement_windows?${insertParams}`,
      {
        token: ctx.token,
        method: 'POST',
        body: {
          tenant_id: ctx.tenant.id,
          action_id: action.id,
          metric: attention.metric,
          scope_type: attention.scope_type,
          scope_key: attention.scope_key,
          baseline_start: baselineStart.toISOString(),
          baseline_end: baselineEnd.toISOString(),
          measurement_start: measurementStart.toISOString(),
          measurement_end: measurementEnd.toISOString()
        },
        headers: { Prefer: 'return=representation' },
        ...deps
      }
    );

    return appJson(res, 201, {
      tenant: ctx.tenant,
      measurementWindow: representation(inserted),
      interpretation: 'before_after_not_causal'
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
