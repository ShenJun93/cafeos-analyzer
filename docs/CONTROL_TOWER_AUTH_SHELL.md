# Control Tower authenticated read shell

## Scope

Wave 25 adds the first authenticated CafeOS Control Tower API boundary against **staging/synthetic data only**.

It is deliberately read-only.

Endpoints:

- `GET /api/app/session`
- `GET /api/app/stores`
- `GET /api/app/attention`
- `GET /api/app/brief`

Public Analyzer endpoints remain unchanged.

## Authentication model

The server expects the caller's Supabase Auth access token:

```http
Authorization: Bearer <user-session-jwt>
```

The server uses:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

It does **not** use a secret key or service-role key for user-facing Control Tower reads.

For every upstream Auth/Data API request, the server sends:

- `apikey: <publishable key>`
- `Authorization: Bearer <user session JWT>`

The user's JWT therefore reaches Supabase and Postgres evaluates requests as the authenticated user under RLS.

## Tenant selection

Except for `/api/app/session`, every Control Tower endpoint requires:

```http
x-cafeos-tenant-id: <tenant uuid>
```

The server does not trust that header by itself. It first verifies that the authenticated user has a visible row in `tenant_members` for the requested tenant.

Database RLS remains the final authorization boundary.

## Endpoint behavior

### GET /api/app/session

Returns:

- authenticated user id;
- tenant memberships visible to that user;
- role and tenant display name.

It does not require a selected tenant.

### GET /api/app/stores

Requires selected tenant membership.

Returns the active/inactive Store records visible through the user's RLS context.

### GET /api/app/attention

Requires selected tenant membership.

Returns current persisted deterministic attention items with metric/baseline/current/delta/coverage/evidence fields.

It does not let the client create trusted Attention rows.

### GET /api/app/brief

Requires selected tenant membership.

The endpoint calls the fixed `public.daily_brief_aggregate(uuid,date)` Postgres RPC using the **caller JWT** plus the publishable key. It does not transfer raw tenant transaction history to Vercel.

The response combines:

- selected tenant context;
- aggregate-selected `asOfBusinessDate`;
- committed-import / observed-transaction freshness;
- Store mapping and comparison coverage;
- deterministic net sales / orders / AOV;
- exact four-week same-weekday baseline dates/status;
- current persisted attention items;
- unresolved actions.

Optional bounded input:

```http
GET /api/app/brief?asOfBusinessDate=YYYY-MM-DD
```

Invalid calendar dates fail with `400 AS_OF_DATE_INVALID`. When omitted, the database selects the latest caller-visible mapped active-Store business date.

The response declares:

```json
{
  "capabilities": {
    "persistedAttention": true,
    "actionRead": true,
    "deterministicTopMetrics": true
  }
}
```

When the four required same-weekday samples are unavailable or coverage is incomplete, authoritative baseline/delta fields remain null and the aggregate exposes the corresponding baseline status.

## Failure behavior

- missing bearer token → 401
- invalid/expired session → 401
- missing/invalid tenant header → 400
- authenticated user without selected-tenant membership → 403
- missing server staging config → 503
- Supabase upstream failure → generic 502

Responses do not echo JWTs, API keys or raw upstream error bodies.

## Environment boundary

For staging/preview deployment only:

- `SUPABASE_URL=https://wjatnyvdygvblirggdcm.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<modern publishable key>`

Do not commit the key value into the repository even though publishable keys are designed for public clients. Environment configuration keeps staging/project coupling explicit.

Never configure a Supabase secret/service-role key for browser or user-RLS read paths.

## Current gate

The authenticated read shell, timezone/order correctness gate, and fixed Daily Brief aggregate are already staging-verified.

For the deterministic Daily Brief API slice:

1. deploy the preview with the same preview-only Supabase URL + publishable key;
2. run authenticated synthetic smoke;
3. require Tenant A `/api/app/brief` → 200 with `deterministicTopMetrics=true`, metrics and coverage;
4. preserve Tenant B → 403 and invalid JWT → 401;
5. only after read-path evidence proceed to Store Health reuse or bounded workflow writes.

No real merchant data is authorized by this shell.
