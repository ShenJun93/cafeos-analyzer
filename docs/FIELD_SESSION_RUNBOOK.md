# Field session runbook

Use one folder per real permissioned merchant export. The goal is reproducible evidence, not ad-hoc analyst notes.

## Create a session

```bash
npm run field:session -- <export.csv|export.xlsx> \
  --source=<pos-or-source> \
  --stores=<merchant-store-count> \
  --out=<session-folder> \
  --id=<stable-session-id> \
  --acquisition-source=<optional-source>
```

Outputs:

- `compatibility-profile.shareable.json` — schema-only evidence; designed to be shareable.
- `analysis.local.json` — local/private report payload; may contain store/product names in evidence.
- `RECONCILIATION.md` — worksheet for comparing CafeOS totals against the source POS report.
- `validation-record.draft.json` — not scoreable; unanswered evidence remains `null`.
- `README.md` — privacy handling reminder.

The original merchant export is never copied into the session folder.

## Reconcile before interviewing

Confirm the same date range, branch filter, transaction status/refund semantics and item granularity. Record source net sales and order totals. Do not mark metrics trusted merely because CafeOS imported successfully.

## Collect operator evidence

Only after showing reconciled results record whether the operator found a useful/new insight, wants repeat use, wants continuous sync, and—after value is demonstrated—whether they have willingness to pay.

Do not add names, phone numbers or email addresses to the validation record.

## Finalize

Create a separate `answers.json` containing the required booleans and optional WTP band, then run:

```bash
npm run field:finalize -- \
  <session-folder>/validation-record.draft.json \
  <answers.json> \
  <session-folder>/validation-record.final.json
```

Finalization enforces evidence ordering. For example, `metricTrusted=true` requires successful import plus reconciliation; WTP cannot be positive unless value was demonstrated and WTP was actually asked.

Only `validation-record.final.json` is eligible for the aggregate field-validation scorecard.
