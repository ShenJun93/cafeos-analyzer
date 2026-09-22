# Windows field kit

The field kit is designed to remove cloud deployment as a blocker for permissioned validation sessions.

## Requirements

- Windows 10/11
- Node.js 20+
- no npm install is required for the packaged validation build

## Operator flow

1. Run `START_CAFEOS.cmd`.
2. The launcher starts the local server on `127.0.0.1:4173`, opens the browser, and waits.
3. Analyze CSV/XLSX locally. The launcher itself performs no upload and starts no cloud persistence.
4. Return to the launcher window and press Enter when finished. The `finally` cleanup stops the task-owned Node server.

## Field researcher flow

Drag a CSV/XLSX export onto `RUN_FIELD_SESSION.cmd`. Before Node reads the export, the launcher asks participant role and explicit processing permission; declining permission exits without analysis or a validation draft. After permission, choose a bounded POS/source class and location count. The kit creates a timestamped folder under `field-sessions/` containing the shareable compatibility profile, local analysis/reconciliation evidence, and non-scoreable validation draft.

Finalize the evidence separately with `field:finalize`, which follows dependency-aware question flow and asks any WTP price band only after a positive unanchored willingness answer. Then add the canonical PII-free record to the registry with `field:registry:add`.

Do not copy original merchant exports into shared evidence folders.
