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
const ALLOWED_FIELDS = new Set(['attentionItemId', 'title', 'ownerUserId', 'dueAt']);

function failUnknownFields(body) {
  const unknown = Object.keys(body).filter(key => !ALLOWED_FIELDS.has(key));
  if (unknown.length) {
    throw new AppHttpError(400, 'BODY_FIELD_FORBIDDEN', 'Unsupported workflow field');
  }
}

function requireUuid(value, code, message) {
  const normalized = String(value ?? '').trim();
  if (!UUID_RE.test(normalized)) throw new AppHttpError(400, code, message);
  return normalized;
}

function optionalDueAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf()) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new AppHttpError(400, 'DUE_AT_INVALID', 'dueAt must include an explicit timezone');
  }
  return parsed.toISOString();
}

function actionTitle(value, metric) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return `Investigate ${metric}`;
  }
  const title = String(value).trim();
  if (title.length > 500) throw new AppHttpError(400, 'ACTION_TITLE_INVALID', 'Action title is too long');
  return title;
}

function representation(payload, code = 'SUPABASE_UPSTREAM') {
  const row = Array.isArray(payload) ? payload[0] : null;
  if (!row?.id) throw new AppHttpError(502, code, 'Control Tower data service returned an error');
  return row;
}

export async function handle(req, res, deps = {}) {
  if (!onlyPost(req, res)) return;
  try {
    const ctx = requireOperatorRole(await appContext(req, deps));
    const body = requestJsonObject(req);
    failUnknownFields(body);

    const attentionItemId = requireUuid(
      body.attentionItemId,
      'ATTENTION_INVALID',
      'Invalid Attention item'
    );
    const ownerUserId = body.ownerUserId === undefined || body.ownerUserId === null
      ? ctx.user.id
      : requireUuid(body.ownerUserId, 'OWNER_INVALID', 'Invalid Action owner');
    const dueAt = optionalDueAt(body.dueAt);

    const attentionParams = new URLSearchParams({
      select: 'id,metric,scope_type,scope_key,status',
      tenant_id: `eq.${ctx.tenant.id}`,
      id: `eq.${attentionItemId}`,
      limit: '1'
    });
    const attentionRows = await supabaseJson(
      `/rest/v1/attention_items?${attentionParams}`,
      { token: ctx.token, ...deps }
    );
    const attention = Array.isArray(attentionRows) ? attentionRows[0] ?? null : null;
    if (!attention) {
      throw new AppHttpError(404, 'ATTENTION_NOT_FOUND', 'Attention item is not available in this tenant');
    }
    if (attention.status !== 'open') {
      throw new AppHttpError(409, 'ATTENTION_NOT_OPEN', 'Attention item is not open');
    }
    if (
      attention.scope_type !== 'store' ||
      !UUID_RE.test(String(attention.scope_key ?? '')) ||
      !SUPPORTED_METRICS.has(attention.metric)
    ) {
      throw new AppHttpError(409, 'ATTENTION_UNSUPPORTED', 'Attention item is outside the bounded Action loop');
    }

    if (ownerUserId !== ctx.user.id) {
      const ownerParams = new URLSearchParams({
        select: 'user_id',
        tenant_id: `eq.${ctx.tenant.id}`,
        user_id: `eq.${ownerUserId}`,
        limit: '1'
      });
      const owners = await supabaseJson(
        `/rest/v1/tenant_members?${ownerParams}`,
        { token: ctx.token, ...deps }
      );
      if (!Array.isArray(owners) || !owners[0]) {
        throw new AppHttpError(400, 'OWNER_INVALID', 'Action owner is not a member of this tenant');
      }
    }

    const existingParams = new URLSearchParams({
      select: 'id,status',
      tenant_id: `eq.${ctx.tenant.id}`,
      attention_item_id: `eq.${attentionItemId}`,
      status: 'in.(open,in_progress)',
      limit: '1'
    });
    const existing = await supabaseJson(
      `/rest/v1/actions?${existingParams}`,
      { token: ctx.token, ...deps }
    );
    if (Array.isArray(existing) && existing[0]) {
      throw new AppHttpError(409, 'ACTION_EXISTS', 'This Attention item already has an unresolved Action');
    }

    const insertParams = new URLSearchParams({
      select: 'id,tenant_id,attention_item_id,owner_user_id,action_type,title,expected_metric,expected_direction,status,due_at,created_at,updated_at'
    });
    const inserted = await supabaseJson(
      `/rest/v1/actions?${insertParams}`,
      {
        token: ctx.token,
        method: 'POST',
        body: {
          tenant_id: ctx.tenant.id,
          attention_item_id: attentionItemId,
          owner_user_id: ownerUserId,
          action_type: 'investigate',
          title: actionTitle(body.title, attention.metric),
          expected_metric: attention.metric,
          expected_direction: 'investigate',
          status: 'open',
          due_at: dueAt
        },
        headers: { Prefer: 'return=representation' },
        ...deps
      }
    );

    return appJson(res, 201, {
      tenant: ctx.tenant,
      action: representation(inserted)
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
