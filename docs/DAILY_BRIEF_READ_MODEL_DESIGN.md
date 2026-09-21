# CafeOS Daily Brief read model — design gate

Status: **DESIGN ONLY / NO BUILD until issue #19 authenticated preview E2E passes**

## User job

For an owner/HQ operator of a multi-location café brand:

> Show the latest trustworthy operating day, the core movement that matters, the stores needing attention, and the evidence behind it — without forcing dashboard construction.

The read model must preserve the CafeOS sequence:

`trusted persisted data → deterministic metrics → evidence-backed attention → existing actions`

It must not become a second analytics engine.

## Canonical sources

Reuse:

- `public.transaction_line_items`
- `public.imports`
- `public.stores`
- `public.attention_items`
- `public.actions`
- metric definitions in `docs/METRICS.md`

Do not introduce `metric_snapshots` for the first read path unless measured performance requires materialization.

Initial Daily Brief is generated on request from persisted data.

## Findings that block a naive implementation

### 1. Timestamp semantics are currently ambiguous

Current file normalization treats Vietnamese wall-clock timestamps such as `20/09/2026 08:15` with `Date.UTC(...)`.

Current store/daypart detection then uses `getUTCHours()`.

This means the current Analyzer representation works like a **naive source clock encoded with a Z suffix**, not a guaranteed real UTC instant.

At the same time, ISO inputs that genuinely contain `Z` or an offset are parsed as instants.

Those two semantics cannot safely be mixed once Control Tower starts using persisted `timestamptz` plus `stores.timezone`.

### 2. Daypart must be store-local

`stores.timezone` already exists and must be the authority for business date/daypart.

A persisted timestamp must be converted to the stable Store timezone before deriving:

- business date;
- morning / afternoon / evening;
- same-weekday comparison.

No Control Tower daypart metric may use raw UTC hour.

### 3. Order identity is not yet cross-source safe

`computeCoreMetrics()` currently counts distinct `transactionId` only.

That is sufficient for a single source export but can under-count once two source namespaces use the same transaction identifier.

Control Tower order identity must be source-scoped at minimum:

`(source_namespace, transaction_id)`

This must be fixed before multi-source persistent Daily Brief metrics are authoritative.

### 4. Missing rows are not zero sales

With transaction-only evidence, no rows for a Store/date can mean:

- truly zero sales;
- store closed;
- missing/late import;
- mapping failure.

Daily Brief must report that as coverage uncertainty, never silently convert absence into zero.

## Time contract to lock before implementation

### Canonical event time

Future persistent ingestion must distinguish:

1. timestamp with explicit offset / `Z` → preserve that instant;
2. naive source timestamp → interpret using an explicit source/store IANA timezone before converting to UTC.

The import path therefore needs an auditable timezone assumption.

Minimum proposed metadata:

- `imports.source_timezone` (IANA zone, required for naive source timestamps);
- later, only if evidence requires it: timestamp-semantics version.

For the Vietnam-first path the UI may prefill `Asia/Ho_Chi_Minh`, but the stored assumption must be explicit rather than hidden in parser code.

### Business date

For each stable Store:

`business_date = local calendar date of occurred_at in stores.timezone`

### Daypart

Initial locked boundaries remain compatible with the current product semantics:

- morning: local hour < 11
- afternoon: local hour 11–16
- evening: local hour >= 17

The important correction is that the hour is store-local.

## Daily Brief date selection

Default `asOfBusinessDate`:

- latest business date observed in the selected tenant's persisted transaction data;
- not the server wall-clock date;
- not automatically “today”.

Reason: file/connector data may be delayed. Data-driven selection avoids showing an empty “today” as if it were a completed business day.

The response must also expose:

- latest committed import time;
- latest observed transaction time;
- active Store count;
- Stores represented on `asOfBusinessDate`;
- Store mapping coverage.

## Baseline contract

### Headline comparison

For net sales, orders and AOV:

- current = selected business date;
- baseline = average of the **same weekday over the previous four weeks**;
- exact baseline dates must be returned;
- require all four comparison dates before publishing an authoritative percentage delta;
- otherwise return `baselineStatus = "insufficient_history"` and no authoritative delta.

This is intentionally different from “previous four observed days”.

Restaurant reporting references supporting this comparison shape:

- Toast Advanced Sales Projections: current day-of-week vs same day over the last four weeks:
  https://support.toasttab.com/en/article/Toast-Benchmarking-Advanced-Sales-Projections
- Lightspeed Benchmarks and Trends: typical sales for the same day over the previous four weeks:
  https://k-series-support.lightspeedhq.com/hc/en-us/articles/28846463754523-Understanding-Benchmarks-and-Trends
- Toast daily reporting also exposes previous day / same day previous week / same day previous year:
  https://support.toasttab.com/en/article/Reporting-Best-Practices-Reports-to-Use-After-Your-First-Day-on-Toast

CafeOS v0.1 chooses the four-week same-weekday baseline because it is deterministic, understandable to an operator, and less sensitive to weekday seasonality than four immediately preceding days.

### Attention generation

An attention item must not be created merely because the Daily Brief has a delta.

Existing detector thresholds remain a separate deterministic rule contract.

Before reusing `detectStoreDaypartDeclines`, it must be upgraded to:

- store-local business time;
- explicit source-scoped order identity;
- same-weekday baseline dates;
- evidence dates returned exactly.

No LLM thresholding.

## Read-path architecture

Do not transfer a full tenant's raw transaction history to Vercel and aggregate it in JavaScript.

Reasons:

- PostgREST row limits/pagination;
- network cost;
- 100k-row target;
- duplicate metric logic between DB and Analyzer;
- harder evidence/reconciliation.

Preferred first implementation after issue #19 closes:

1. add a **fixed, reviewed Postgres read function** for Daily Brief aggregates;
2. function executes as the authenticated caller, not service-role;
3. RLS remains effective;
4. function accepts only bounded inputs such as tenant/date;
5. no arbitrary SQL text from client;
6. return deterministic aggregate rows plus explicit coverage/baseline dates;
7. Vercel `/api/app/brief` formats those rows and joins current persisted Attention/Action objects.

The function must be security-invoker/default-invoker unless a separately reviewed reason requires otherwise.

## Proposed response contract

Conceptual shape:

```json
{
  "tenant": {
    "id": "uuid",
    "role": "owner"
  },
  "asOfBusinessDate": "2026-09-21",
  "freshness": {
    "latestCommittedImportAt": "timestamp",
    "latestObservedTransactionAt": "timestamp"
  },
  "coverage": {
    "activeStores": 8,
    "storesRepresented": 7,
    "stableStoreMappingRate": 0.98
  },
  "metrics": {
    "netSales": {
      "current": 123,
      "baseline": 120,
      "deltaPct": 0.025,
      "baselineType": "same_weekday_4w",
      "baselineDates": ["date", "date", "date", "date"],
      "baselineStatus": "ready"
    },
    "orders": {},
    "aov": {}
  },
  "attention": [],
  "unresolvedActions": []
}
```

Every numeric field is deterministic. LLM text, if added later, may only explain supplied values.

## Store Health reuse

Store Health should use the same read model with a stable `store_id` filter.

Do not create a second Store Health metric definition.

Per-store output reuses:

- business date;
- same-weekday four-week baseline;
- net sales;
- orders;
- AOV;
- coverage;
- attention/evidence;
- unresolved actions.

## Minimum correctness tests before implementation can be accepted

### Time semantics

- naive Vietnam timestamp + explicit `Asia/Ho_Chi_Minh` resolves to the expected UTC instant;
- explicit `Z` timestamp preserves its instant;
- same instant maps to correct local business date/hour;
- daypart derives from Store timezone, not UTC;
- invalid IANA timezone is rejected.

### Order identity

- identical transaction IDs from two source namespaces count as two orders;
- repeated lines inside the same source/order still count as one order;
- AOV uses source-scoped order count.

### Baseline

- Monday compares only with prior Mondays;
- exact four baseline dates are exposed;
- missing one required week produces `insufficient_history`;
- no percentage delta is emitted under insufficient history;
- Store without rows is marked unknown/coverage gap, not zero.

### Authorization

- authenticated Tenant A can read only Tenant A aggregates;
- Tenant A cannot choose Tenant B;
- viewer may read;
- no secret/service-role key is needed.

## Deferred

Do not add yet:

- metric snapshots/materialized views;
- background schedules/queues;
- forecasting/ML;
- weather/event adjustment;
- labor metrics;
- causal claims;
- configurable BI queries;
- arbitrary date-expression DSL;
- production merchant ingestion.

## Build gate

Implementation remains blocked until GitHub issue #19 passes live authenticated preview E2E.

Once #19 closes, first implementation PR should address correctness in this order:

1. timestamp/source-timezone semantics;
2. source-scoped order identity;
3. fixed RLS-safe Daily Brief aggregate function;
4. `/api/app/brief` deterministic metrics;
5. Store Health reuse;
6. only then Attention → Action → Measurement writes.
