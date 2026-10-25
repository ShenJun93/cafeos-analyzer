# CafeOS — Menu price-snapshot integrity release gate

2026-10-25 · PR #74 `feat/cafeos-core-commerce-v1` · **PLAN/TEST ONLY**

## Verified source finding

Before this patch, `public.commerce_create_order` first scans Menu to calculate the Order header subtotal/total, writes an Order header, then issues new SQL statements querying Menu a second time to populate `pos_order_items.item_name/unit_price`. Under `READ COMMITTED`, those separately executed reads need not observe one identical catalog state if Menu can be edited concurrently by an authorized manager. Even a synchronous synthetic Order insert trigger modifying Menu before line insertion can reproduce the discrepancy without reliance on scheduler timing.

This could produce **header total different from the sum of Order line snapshots**, undermining auditability and cashier receipts. Existing exact-payment logic protects the header amount, but cannot prove inconsistent item lines trustworthy.

## Candidate repair and verification

- `db/contracts/core_commerce_order_price_snapshot_guard.sql` is text-equivalent to `supabase/migrations/20261025140000_core_commerce_order_price_snapshot_guard.sql`.
- The function retains authenticated tenant role checks, idempotency locks, server-owned totals, SECURITY DEFINER search path and explicit grants. First Menu lookup produces `v_snapshot_items` JSONB containing validated ID/name/price/quantity; Order Items inserts use only those cached values.
- Database test `supabase/tests/database/core_commerce_v1.test.sql` installs a synthetic `BEFORE INSERT ON pos_orders` trigger inside a rolled-back pgTAP transaction. It changes one selected Menu item price between the calculation and line-item insert. Three assertions check successful order write, header/line agreement, and frozen original unit price. A fourth case settles it for the original total before Daily Close.
- Earlier pgTAP fixture attempt at commit `ba9e6c4` had 4 failures because the synthetic test Order was left open, blocking Daily Close and changing expected counts. Source fix `1d89cb9` pays the Order at original snapshot amount, updates expected sales from 105000 to 175000 and total Orders from 2 to 3. **Verified 42/42 pgTAP PASS at `f55433e`**, including initial and post-restore test passes on an isolated Supabase CI database. Runs: `40199282063`, `40199285730`. The pgTAP dollar-quote formatting bug was fixed in `f55433e`; the earlier unsuccessful runs do not indicate the repaired SQL migration failed.
- Live staging was not modified, and an actual concurrent update against staging was not attempted. The finding is a static code/race analysis with a deterministic isolated DB test, not a live merchant-incident claim.

## Release preconditions

1. **Verified at code HEAD `f55433e`:** CI, synthetic Chromium QA, and both Supabase DB runs (42/42 pgTAP, pre/post isolated restore) PASS. Recheck all at subsequent source HEADs before release.
2. Owner review of full SQL delta, function grants, role/tenant checks, and 2 concurrent-orchestrated order/change cases. Independent security review still open.
3. Staging ledger reconciliation from **7 old receipts → 8 canonical historical receipts**, explicitly leaving both incremental integrity guards pending. Secure backup and owner-approved execution only.
4. Controlled staging migration deployment in order: future-close guard first, snapshot guard second. Then authenticated synthetic real-transport E2E, read-only financial invariants, rendered-browser QA and clean rollback receipts.
5. **PR #74 remains Draft / NO_GO; production unchanged.**
