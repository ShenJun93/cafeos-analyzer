# Control Tower E1 local validation UI

This runbook is for permissioned **E1** sessions only.

## Data boundary

Keep the two contexts visibly separate:

1. **Merchant export → local Analyzer**
   - merchant data stays in the approved local/transient Analyzer path;
   - use it only for reconciliation/data-trust evidence.

2. **Control Tower → synthetic staging**
   - the browser UI must display:
     `DEMO / SYNTHETIC CONTROL TOWER DATA — NOT YOUR STORE DATA`;
   - never copy merchant Analyzer values into synthetic staging;
   - evidence provenance is `operator_synthetic_assisted`.

E1 does not prove a real merchant-data Control Tower loop and cannot contribute to `completeLoopObserved`.

## Start

Set only browser-safe staging configuration in the local shell environment:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Do not use a service-role or secret key.

Then run:

```bash
npm run serve:control-tower-e1
```

Open:

```text
http://127.0.0.1:4174/control-tower-e1
```

Use the synthetic validation user credentials. The browser keeps its JWT in memory only; it is not written to localStorage/sessionStorage.

## Operator flow

Use only the bounded sequence:

1. sign in;
2. select a visible tenant membership;
3. review Daily Brief coverage/readiness and deterministic metrics;
4. select one Store and review Store Health;
5. review one Attention item;
6. create the bounded `investigate` Action if the operator chooses to;
7. review Action detail/history;
8. update Action status only through supported states;
9. if a Measurement is available, review the deterministic result;
10. preserve the visible wording:
   **before/after measured change — not causal attribution**.

Do not add or simulate merchant values in synthetic staging to make the demo feel real.

## Evidence

Record E1 evidence through the separate Control Tower validation registry from #58.

Allowed E1 public aggregates include bounded comprehension/intent metrics and source prevalence where permitted. Do not treat synthetic Brief usefulness, Action conversion, return behavior, or Measurement behavior as merchant-data evidence.

## Safety

- no raw transaction list is fetched by this UI;
- no secret/service-role key is exposed to the browser;
- tenant choices come only from the authenticated session memberships;
- RLS and server-side membership checks remain authoritative;
- the local UI reuses the existing `/api/app/*` handlers;
- no Vercel deployment is required for E1.
