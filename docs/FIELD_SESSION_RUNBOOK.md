# Field session runbook

Use one folder per real permissioned merchant export. The goal is reproducible evidence, not ad-hoc analyst notes.

## Create a session

The Windows launcher is preferred because it asks role and permission before invoking Node. Direct CLI use must provide the same bounded inputs:

```bash
npm run field:session -- <export.csv|export.xlsx> \
  --source=<kiotviet|cukcuk|sapo_fnb|ipos|pos365|generic_excel_csv|other_pos|unknown> \
  --stores=<merchant-store-count> \
  --role=<owner_operator|other> \
  --permissioned=true \
  --out=<session-folder>
```

The default session ID is a fresh opaque random UUID. Do not derive canonical IDs from the source-file hash. If permission is not affirmative, do not process the export and do not create a validation draft.

Outputs:

- `compatibility-profile.shareable.json` — schema-only evidence; designed to be shareable.
- `analysis.local.json` — local/private report payload; may contain store/product names and the source-file hash for local reproducibility.
- `RECONCILIATION.md` — local worksheet for comparing CafeOS totals against the source POS report.
- `validation-record.draft.json` — PII-free, not scoreable; unanswered evidence remains `null`.
- `README.md` — privacy handling reminder.

The original merchant export is never copied into the session folder. Raw vendor detail, file hashes and merchant identity stay local/private and are not canonical validation fields.

## Reconcile before interviewing

Confirm the same date range, branch filter, transaction status/refund semantics and item granularity. Record source net sales and order totals. Do not mark metrics trusted merely because CafeOS imported successfully.

If reconciliation was not attempted, metric trust is inapplicable/false without another prompt. Useful/new insight is only applicable after trusted metrics and an actually reviewed insight.

## Collect operator evidence

Record repeat-use and continuous-sync answers only when those questions were actually asked. Record concrete value separately from useful/new insight.

Only after concrete value is demonstrated may WTP be asked. Ask willingness to pay unanchored first. A paid price band may be captured only after a positive willingness answer and is optional; it never changes the locked WTP score.

Do not add names, phone numbers, emails, merchant names, URLs or raw attribution strings to the canonical validation record.

## Finalize

Create a separate `answers.json` containing the applicable booleans and optional post-answer WTP band, then run:

```bash
npm run field:finalize -- \
  <session-folder>/validation-record.draft.json \
  <answers.json> \
  <session-folder>/validation-record.final.json
```

Finalization uses the same canonical dependency contract as browser/registry entry. Add the finalized record through `field:registry:add`; identical duplicate IDs are idempotent, while the same ID with materially different evidence is rejected.

Only canonical permissioned target records count toward the aggregate target sample.
