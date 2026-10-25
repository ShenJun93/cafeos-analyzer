# Control Tower field validation

This is the local/private evidence protocol for CafeOS Control Tower discovery gate #11.

## Status

Control Tower evidence remains:

`COLLECTING_EVIDENCE`

There is no Control Tower PASS/FAIL threshold, minimum sample, connector winner, or overall score yet.

## Evidence provenance

Every canonical record has exactly one provenance:

- `synthetic_technical` — engineering acceptance only; excluded from product aggregates.
- `operator_synthetic_assisted` — a real target operator using the bounded synthetic Control Tower workflow.
- `merchant_data_permissioned` — explicit merchant-data permission; eligible for real-data workflow metrics and `completeLoopObserved`.

An E1 record must never be promoted to E2 under the same evidence-event ID. E2 is a new evidence event.

## Target ICP

Target classification is derived, not caller supplied:

- participant role = `owner_operator` or `hq_decision_maker`;
- store count = 3–15 inclusive.

Other records may remain local for learning but are excluded from target aggregates.

## Permission

A permissioned session requires an opaque `sessionPermissionReceiptId`.

`merchant_data_permissioned` additionally requires a separate opaque `merchantDataPermissionReceiptId`.

Receipt IDs are private references only. They must not encode merchant/contact identity and never appear in public summaries.

## Transaction-source inventory

Allowed normalized source keys:

- `kiotviet_fnb`
- `sapo_fnb`
- `cukcuk`
- `pos365`
- `ipos`
- `haravan`
- `generic_excel_csv`
- `other_pos`
- `unknown`

Each source item carries only:

- `sourceKey`
- `evidenceKind`: `operator_stated | export_observed | merchant_data_permissioned`
- `primary`

Multi-source operators are valid. At most one source is primary. Source prevalence counts reviewed evidence sessions, not unique operators or stores.

## Workflow evidence

Canonical evidence is nullable so "not yet observed" remains distinct from false.

Dependency rules include:

- `metricTrusted => trustedDataReviewed`
- `dailyBriefUseful => dailyBriefReviewed && metricTrusted`
- `storeHealthUseful => storeHealthReviewed && metricTrusted`
- `actionCreated => attentionReviewed`
- `returnReviewObserved => actionCreated`
- `terminalActionReviewed => returnReviewObserved`
- `measurementChecked => measurementAvailable && actionCreated`
- `nonCausalWordingUnderstood => measurementChecked`
- `repeatLoopIntent => repeatLoopAsked`
- `continuousSyncIntent => continuousSyncAsked`
- `workflowConceptUnderstood => workflowConceptReviewed`

A real return must occur after Action creation and in a distinct session. Measurement inspection must occur after Action creation.

## E1 semantics

`operator_synthetic_assisted` may record bounded synthetic behavior and comprehension, including:

- workflow concept reviewed/understood;
- non-causal wording understanding;
- stated repeat-loop intent;
- stated continuous-sync intent;
- transaction-source prevalence from operator-stated/export-observed evidence.

These records never enter merchant-data usefulness/action/return/measurement numerators or `completeLoopObserved`.

## E2 semantics

Only `merchant_data_permissioned` records contribute to merchant-data workflow metrics:

- data trust;
- Daily Brief usefulness;
- Store Health usefulness;
- Attention → Action;
- later return/review;
- terminal Action review;
- Measurement inspection;
- non-causal understanding;
- repeat-loop intent;
- continuous-sync intent;
- complete observed loop.

No causal attribution is claimed from before/after measurement.

## Public summary

The safe summary contains aggregate counts/rates only and remains provenance-separated:

- `operatorSyntheticAssisted`
- `merchantDataPermissioned`
- `transactionSourcePrevalence`

Never publish:

- merchant/contact identity;
- raw files/rows/transaction IDs;
- store/customer names tied to a merchant;
- receipt IDs;
- timestamps/session IDs;
- private notes;
- credentials/tokens;
- registry rows.

## Local commands

Create a nullable draft:

```bash
npm run control-tower:session -- control-tower-sessions/session.json ctevt_00000001 5 operator_synthetic_assisted owner_operator
```

Edit the local draft only with bounded canonical fields, then finalize:

```bash
npm run control-tower:finalize -- control-tower-sessions/session.json control-tower-sessions/session.canonical.json
```

Add to the private registry:

```bash
npm run control-tower:registry:add -- control-tower-validation-registry.json control-tower-sessions/session.canonical.json
```

Emit the aggregate-safe summary:

```bash
npm run control-tower:registry:summary -- control-tower-validation-registry.json
```

The registry and session directory are gitignored. The summary is the only output intended to be copied into public discovery issue #11.

## Distribution constraint

Evidence acquisition remains pull/inbound. Do not depend on cold email, cold DM, cold calls, founder-led negotiated pilots, or recurring manual prospecting.
