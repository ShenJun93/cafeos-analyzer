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

Current read shell combines:

- latest committed import freshness;
- Store list;
- current attention items;
- unresolved actions.

The response explicitly declares:

```json
{
  "capabilities": {
    "persistedAttention": true,
    "actionRead": true,
    "deterministicTopMetrics": false
  }
}
```

This is intentional. Wave 25 must not pretend the persisted Daily Brief metric path exists before it is actually implemented.

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

## Next gate

After repository CI and Supabase DB CI pass:

1. configure the two staging-safe Vercel environment variables;
2. deploy preview/staging shell;
3. verify unauthenticated `/api/app/session` returns 401;
4. create/use synthetic Supabase Auth users for authenticated live smoke;
5. prove Tenant A cannot select Tenant B through the deployed shell;
6. only then add deterministic Daily Brief metric reads.

No real merchant data is authorized by this shell.
