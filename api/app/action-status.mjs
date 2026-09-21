import {
  AppHttpError,
  appContext,
  appError,
  appJson,
  onlyPatch,
  requestJsonObject,
  requireOperatorRole,
  supabaseJson
} from '../_app-auth.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(['actionId', 'status', 'resolutionNote']);
const ALLOWED_STATUS = new Set(['in_progress', 'resolved', 'dismissed']);
const TRANSITIONS = {
  open: new Set(['in_progress', 'resolved', 'dismissed']),
  in_progress: new Set(['resolved', 'dismissed']),
  resolved: new Set(),
  dismissed: new Set()
};

function representation(payload) {
  const row = Array.isArray(payload) ? payload[0] : null;
  if (!row?.id) throw new AppHttpError(502, 'SUPABASE_UPSTREAM', 'Control Tower data service returned an error');
  return row;
}

export async function handle(req, res, deps = {}) {
  if (!onlyPatch(req, res)) return;
  try {
    const ctx = requireOperatorRole(await appContext(req, deps));
    const body = requestJsonObject(req);
    if (Object.keys(body).some(key => !ALLOWED_FIELDS.has(key))) {
      throw new AppHttpError(400, 'BODY_FIELD_FORBIDDEN', 'Unsupported workflow field');
    }

    const actionId = String(body.actionId ?? '').trim();
    if (!UUID_RE.test(actionId)) {
      throw new AppHttpError(400, 'ACTION_INVALID', 'Invalid Action');
    }
    const status = String(body.status ?? '').trim();
    if (!ALLOWED_STATUS.has(status)) {
      throw new AppHttpError(400, 'ACTION_STATUS_INVALID', 'Unsupported Action status');
    }

    const actionParams = new URLSearchParams({
      select: 'id,status,resolution_note,resolved_at',
      tenant_id: `eq.${ctx.tenant.id}`,
      id: `eq.${actionId}`,
      limit: '1'
    });
    const rows = await supabaseJson(`/rest/v1/actions?${actionParams}`, {
      token: ctx.token,
      ...deps
    });
    const action = Array.isArray(rows) ? rows[0] ?? null : null;
    if (!action) throw new AppHttpError(404, 'ACTION_NOT_FOUND', 'Action is not available in this tenant');

    if (action.status !== status && !TRANSITIONS[action.status]?.has(status)) {
      throw new AppHttpError(409, 'ACTION_TRANSITION_INVALID', 'Action status transition is not allowed');
    }

    const terminal = status === 'resolved' || status === 'dismissed';
    const note = String(body.resolutionNote ?? '').trim();
    if (terminal && !note) {
      throw new AppHttpError(400, 'RESOLUTION_NOTE_REQUIRED', 'Resolution note is required');
    }
    if (note.length > 4000) {
      throw new AppHttpError(400, 'RESOLUTION_NOTE_INVALID', 'Resolution note is too long');
    }

    const patchParams = new URLSearchParams({
      tenant_id: `eq.${ctx.tenant.id}`,
      id: `eq.${actionId}`,
      select: 'id,tenant_id,attention_item_id,owner_user_id,action_type,title,expected_metric,expected_direction,status,resolution_note,due_at,resolved_at,created_at,updated_at'
    });
    const now = new Date().toISOString();
    const updated = await supabaseJson(`/rest/v1/actions?${patchParams}`, {
      token: ctx.token,
      method: 'PATCH',
      body: {
        status,
        resolution_note: terminal ? note : null,
        resolved_at: terminal ? now : null,
        updated_at: now
      },
      headers: { Prefer: 'return=representation' },
      ...deps
    });

    return appJson(res, 200, {
      tenant: ctx.tenant,
      action: representation(updated)
    });
  } catch (error) {
    return appError(res, error);
  }
}

export default async function handler(req, res) {
  return handle(req, res);
}
