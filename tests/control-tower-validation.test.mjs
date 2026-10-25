import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createControlTowerValidationDraft,
  finalizeControlTowerValidationDraft,
  summarizeControlTowerValidation
} from "../dist/control-tower-validation.js";
import {
  assertCanonicalControlTowerValidationRecord,
  emptyControlTowerValidationRegistry,
  upsertControlTowerValidationRecord
} from "../dist/control-tower-validation-registry.js";
import { evaluateFieldValidation } from "../dist/validation-gates.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseRecord({
  id = "ctevt_00000001",
  provenance = "merchant_data_permissioned",
  storeCount = 5,
  role = "owner_operator"
} = {}) {
  const permissioned = provenance !== "synthetic_technical";
  return {
    id,
    storeCount,
    storeBucket: storeCount === 1 ? "1" : storeCount === 2 ? "2" : storeCount <= 5 ? "3-5" : storeCount <= 10 ? "6-10" : storeCount <= 15 ? "11-15" : "16+",
    participantRoleClass: role,
    targetIcp: (role === "owner_operator" || role === "hq_decision_maker") && storeCount >= 3 && storeCount <= 15,
    evidenceProvenance: provenance,
    permissionedSession: permissioned,
    sessionPermissionReceiptId: permissioned ? "receipt_session_0001" : null,
    merchantDataPermissionReceiptId: provenance === "merchant_data_permissioned" ? "receipt_merchant_0001" : null,
    transactionSourcesReviewed: null,
    transactionSources: null,
    trustedDataReviewed: null,
    metricTrusted: null,
    dailyBriefReviewed: null,
    dailyBriefUseful: null,
    storeHealthReviewed: null,
    storeHealthUseful: null,
    attentionReviewed: null,
    actionCreated: null,
    returnReviewObserved: null,
    terminalActionReviewed: null,
    measurementAvailable: null,
    measurementChecked: null,
    nonCausalWordingUnderstood: null,
    repeatLoopAsked: null,
    repeatLoopIntent: null,
    continuousSyncAsked: null,
    continuousSyncIntent: null,
    workflowConceptReviewed: null,
    workflowConceptUnderstood: null,
    actionCreatedAt: null,
    actionSessionId: null,
    returnReviewObservedAt: null,
    returnSessionId: null,
    measurementCheckedAt: null,
    measurementSessionId: null
  };
}

function fullLoopRecord(id = "ctevt_full_0001", provenance = "merchant_data_permissioned") {
  const record = baseRecord({ id, provenance });
  Object.assign(record, {
    transactionSourcesReviewed: true,
    transactionSources: [
      { sourceKey: "kiotviet_fnb", evidenceKind: provenance === "merchant_data_permissioned" ? "merchant_data_permissioned" : "export_observed", primary: true }
    ],
    trustedDataReviewed: true,
    metricTrusted: true,
    dailyBriefReviewed: true,
    dailyBriefUseful: true,
    storeHealthReviewed: true,
    storeHealthUseful: false,
    attentionReviewed: true,
    actionCreated: true,
    returnReviewObserved: true,
    terminalActionReviewed: true,
    measurementAvailable: true,
    measurementChecked: true,
    nonCausalWordingUnderstood: true,
    repeatLoopAsked: true,
    repeatLoopIntent: true,
    continuousSyncAsked: true,
    continuousSyncIntent: false,
    workflowConceptReviewed: true,
    workflowConceptUnderstood: true,
    actionCreatedAt: "2026-09-22T08:00:00.000Z",
    actionSessionId: "session_action_0001",
    returnReviewObservedAt: "2026-09-23T08:00:00.000Z",
    returnSessionId: "session_return_0002",
    measurementCheckedAt: "2026-09-23T08:05:00.000Z",
    measurementSessionId: "session_measure_0002"
  });
  return record;
}

test("ICP/DRAFT: role + 3-15 stores derive target ICP and draft evidence starts null", () => {
  const draft = createControlTowerValidationDraft({
    id: "ctevt_draft_0001",
    storeCount: 3,
    participantRoleClass: "owner_operator",
    evidenceProvenance: "operator_synthetic_assisted"
  });
  assert.equal(draft.metricTrusted, null);
  assert.equal(draft.returnReviewObserved, null);
  draft.permissionedSession = true;
  draft.sessionPermissionReceiptId = "receipt_session_1001";
  const record = finalizeControlTowerValidationDraft(draft);
  assert.equal(record.storeBucket, "3-5");
  assert.equal(record.targetIcp, true);

  const hq = finalizeControlTowerValidationDraft({
    ...draft,
    id: "ctevt_draft_0002",
    storeCount: 15,
    participantRoleClass: "hq_decision_maker"
  });
  assert.equal(hq.targetIcp, true);

  for (const storeCount of [2, 16]) {
    const nonTarget = finalizeControlTowerValidationDraft({
      ...draft,
      id: `ctevt_non_target_${storeCount}`,
      storeCount
    });
    assert.equal(nonTarget.targetIcp, false);
  }

  const other = finalizeControlTowerValidationDraft({
    ...draft,
    id: "ctevt_other_0001",
    participantRoleClass: "other",
    storeCount: 5
  });
  assert.equal(other.targetIcp, false);
});

test("DEP/PERM: impossible positives and missing permission receipts fail closed", () => {
  const cases = [
    [{ trustedDataReviewed: false, metricTrusted: true }, /metricTrusted requires trustedDataReviewed/],
    [{ metricTrusted: true, trustedDataReviewed: true, dailyBriefReviewed: false, dailyBriefUseful: true }, /dailyBriefUseful requires dailyBriefReviewed/],
    [{ metricTrusted: true, trustedDataReviewed: true, storeHealthReviewed: false, storeHealthUseful: true }, /storeHealthUseful requires storeHealthReviewed/],
    [{ attentionReviewed: false, actionCreated: true, actionCreatedAt: "2026-09-22T08:00:00.000Z", actionSessionId: "session_action_0001" }, /actionCreated requires attentionReviewed/],
    [{ workflowConceptReviewed: false, workflowConceptUnderstood: true }, /workflowConceptUnderstood requires workflowConceptReviewed/],
    [{ repeatLoopAsked: false, repeatLoopIntent: true }, /repeatLoopIntent requires repeatLoopAsked/],
    [{ continuousSyncAsked: false, continuousSyncIntent: true }, /continuousSyncIntent requires continuousSyncAsked/]
  ];
  for (const [patch, pattern] of cases) {
    const record = Object.assign(baseRecord(), patch);
    assert.throws(() => assertCanonicalControlTowerValidationRecord(record), pattern);
  }

  const noReceipt = baseRecord();
  noReceipt.sessionPermissionReceiptId = null;
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(noReceipt),
    /permissionedSession requires sessionPermissionReceiptId/
  );

  const noMerchantReceipt = baseRecord();
  noMerchantReceipt.merchantDataPermissionReceiptId = null;
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(noMerchantReceipt),
    /merchant_data_permissioned requires merchantDataPermissionReceiptId/
  );
});

test("TIME: return must be later and in a distinct session; measurement must be later than action", () => {
  const sameSession = fullLoopRecord();
  sameSession.returnSessionId = sameSession.actionSessionId;
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(sameSession),
    /distinct later session/
  );

  const earlyReturn = fullLoopRecord("ctevt_full_0002");
  earlyReturn.returnReviewObservedAt = earlyReturn.actionCreatedAt;
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(earlyReturn),
    /returnReviewObserved must occur after action creation/
  );

  const earlyMeasurement = fullLoopRecord("ctevt_full_0003");
  earlyMeasurement.measurementCheckedAt = "2026-09-22T07:59:59.000Z";
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(earlyMeasurement),
    /measurementChecked must occur after action creation/
  );
});

test("PRIV: strict allowlist rejects unknown top-level and nested fields", () => {
  const unknownTop = { ...baseRecord(), notes: "private interview text" };
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(unknownTop),
    /unknown fields: notes/
  );

  const unknownNested = baseRecord();
  unknownNested.transactionSourcesReviewed = true;
  unknownNested.transactionSources = [{
    sourceKey: "kiotviet_fnb",
    evidenceKind: "operator_stated",
    primary: true,
    merchant_name: "Do not store this"
  }];
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(unknownNested),
    /transaction source item contains unknown fields: merchant_name/
  );

  const badReceipt = baseRecord();
  badReceipt.sessionPermissionReceiptId = "owner@example.com";
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(badReceipt),
    /bounded opaque identifier|must not encode identity/
  );
});

test("SRC: per-source evidence is bounded and strongest evidence cannot be downgraded", () => {
  const record = baseRecord({ provenance: "operator_synthetic_assisted" });
  record.transactionSourcesReviewed = true;
  record.transactionSources = [
    { sourceKey: "kiotviet_fnb", evidenceKind: "export_observed", primary: true },
    { sourceKey: "sapo_fnb", evidenceKind: "operator_stated", primary: false }
  ];
  assert.doesNotThrow(() => assertCanonicalControlTowerValidationRecord(record));

  const duplicate = clone(record);
  duplicate.transactionSources.push({
    sourceKey: "kiotviet_fnb",
    evidenceKind: "operator_stated",
    primary: false
  });
  assert.throws(
    () => assertCanonicalControlTowerValidationRecord(duplicate),
    /duplicate transaction source/
  );

  let registry = upsertControlTowerValidationRecord(emptyControlTowerValidationRegistry(), record);
  const downgraded = clone(record);
  downgraded.transactionSources[0].evidenceKind = "operator_stated";
  assert.throws(
    () => upsertControlTowerValidationRecord(registry, downgraded),
    /evidence cannot be downgraded/
  );
});

test("PROV/REG: same ID cannot change event class but nullable evidence may be finalized", () => {
  const initial = baseRecord({ provenance: "operator_synthetic_assisted" });
  let registry = upsertControlTowerValidationRecord(emptyControlTowerValidationRegistry(), initial);

  const updated = clone(initial);
  updated.workflowConceptReviewed = true;
  updated.workflowConceptUnderstood = true;
  registry = upsertControlTowerValidationRecord(registry, updated);
  assert.equal(registry.records[0].workflowConceptUnderstood, true);

  const promoted = clone(updated);
  promoted.evidenceProvenance = "merchant_data_permissioned";
  promoted.merchantDataPermissionReceiptId = "receipt_merchant_2001";
  assert.throws(
    () => upsertControlTowerValidationRecord(registry, promoted),
    /cannot change provenance/
  );

  const movedStore = clone(updated);
  movedStore.storeCount = 6;
  movedStore.storeBucket = "6-10";
  assert.throws(
    () => upsertControlTowerValidationRecord(registry, movedStore),
    /cannot change provenance, permission, role, store or derived ICP/
  );
});

test("DEN/SUM: summaries are provenance-separated with evidence-specific denominators", () => {
  const e2a = fullLoopRecord("ctevt_e2_000001");
  const e2b = baseRecord({ id: "ctevt_e2_000002" });
  Object.assign(e2b, {
    trustedDataReviewed: true,
    metricTrusted: false,
    dailyBriefReviewed: true,
    dailyBriefUseful: false,
    attentionReviewed: true,
    actionCreated: false,
    measurementAvailable: false,
    repeatLoopAsked: true,
    repeatLoopIntent: false,
    transactionSourcesReviewed: true,
    transactionSources: [
      { sourceKey: "kiotviet_fnb", evidenceKind: "merchant_data_permissioned", primary: true },
      { sourceKey: "sapo_fnb", evidenceKind: "export_observed", primary: false }
    ]
  });

  const e1 = fullLoopRecord("ctevt_e1_000001", "operator_synthetic_assisted");
  e1.merchantDataPermissionReceiptId = null;
  e1.transactionSources = [
    { sourceKey: "kiotviet_fnb", evidenceKind: "export_observed", primary: true }
  ];

  for (const record of [e2a, e2b, e1]) {
    assert.doesNotThrow(() => assertCanonicalControlTowerValidationRecord(record));
  }

  const summary = summarizeControlTowerValidation([e2a, e2b, e1]);
  assert.equal(summary.status, "COLLECTING_EVIDENCE");
  assert.equal(summary.operatorSyntheticAssisted.targetPermissionedRecords, 1);
  assert.deepEqual(summary.operatorSyntheticAssisted.workflowConceptUnderstanding, {
    numerator: 1,
    denominator: 1,
    rate: 1
  });

  assert.equal(summary.merchantDataPermissioned.targetPermissionedRecords, 2);
  assert.deepEqual(summary.merchantDataPermissioned.dataTrust, {
    numerator: 1,
    denominator: 2,
    rate: 0.5
  });
  assert.deepEqual(summary.merchantDataPermissioned.dailyBriefUseful, {
    numerator: 1,
    denominator: 1,
    rate: 1
  });
  assert.deepEqual(summary.merchantDataPermissioned.actionConversion, {
    numerator: 1,
    denominator: 2,
    rate: 0.5
  });
  assert.equal(summary.merchantDataPermissioned.completeLoopObserved, 1);

  assert.equal(summary.transactionSourcePrevalence.reviewedSessions, 3);
  assert.equal(summary.transactionSourcePrevalence.sources.kiotviet_fnb.sessions, 3);
  assert.equal(summary.transactionSourcePrevalence.sources.sapo_fnb.sessions, 1);
});

test("SUM: synthetic technical and non-permissioned evidence do not enter product aggregates", () => {
  const synthetic = baseRecord({
    id: "ctevt_syn_000001",
    provenance: "synthetic_technical"
  });
  synthetic.workflowConceptReviewed = true;
  synthetic.workflowConceptUnderstood = true;

  const unpermissioned = baseRecord({
    id: "ctevt_unperm_0001",
    provenance: "operator_synthetic_assisted"
  });
  unpermissioned.permissionedSession = false;
  unpermissioned.sessionPermissionReceiptId = null;
  unpermissioned.workflowConceptReviewed = true;
  unpermissioned.workflowConceptUnderstood = true;

  const summary = summarizeControlTowerValidation([synthetic, unpermissioned]);
  assert.equal(summary.operatorSyntheticAssisted.targetPermissionedRecords, 0);
  assert.equal(summary.merchantDataPermissioned.targetPermissionedRecords, 0);
  assert.equal(summary.transactionSourcePrevalence.reviewedSessions, 0);
});

test("SUM: source contains no Control Tower PASS/FAIL threshold contract", async () => {
  const source = await readFile(
    new URL("../src/control-tower-validation.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /minimumTarget|overall\s*:|threshold\s*:/i);

  const summary = summarizeControlTowerValidation([]);
  assert.equal("overall" in summary, false);
  assert.equal("pass" in summary, false);
  assert.equal("fail" in summary, false);
});

test("REGRESSION: Analyzer #8 scorecard thresholds and behavior remain unchanged", () => {
  const base = {
    id: "analyzer-1",
    source: "kiotviet",
    targetIcp: true,
    permissionedSession: true,
    importAttempted: true,
    importSucceeded: true,
    reconciliationAttempted: true,
    metricTrusted: true,
    insightReviewed: true,
    usefulNewInsight: true,
    repeatUseAsked: true,
    repeatUseIntent: true,
    continuousSyncAsked: true,
    continuousSyncIntent: true,
    valueDemonstrated: true,
    wtpAsked: true,
    willingnessToPay: true
  };
  const score = evaluateFieldValidation(
    Array.from({ length: 10 }, (_, index) => ({ ...base, id: `analyzer-${index}` }))
  );
  assert.equal(score.importSuccess.threshold, 0.80);
  assert.equal(score.metricTrust.threshold, 0.90);
  assert.equal(score.usefulNewInsight.threshold, 0.60);
  assert.equal(score.repeatUseIntent.threshold, 0.40);
  assert.equal(score.continuousSyncIntent.threshold, 0.25);
  assert.equal(score.willingnessToPay.threshold, 0.20);
  assert.equal(score.overall, "PASS");
});
