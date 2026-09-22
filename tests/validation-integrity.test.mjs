import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildInboundValidationDraft,
  buildInboundValidationRecord,
  finalizeInboundValidationDraft
} from "../dist/acquisition.js";
import {
  normalizeAcquisitionAttribution,
  normalizeAnalyzerSource
} from "../dist/validation-record-contract.js";
import {
  assertCanonicalValidationRecord,
  emptyValidationRegistry,
  upsertValidationRecord
} from "../dist/validation-registry.js";
import { evaluateFieldValidation } from "../dist/validation-gates.js";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function input(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    source: "kiotviet",
    participantRoleClass: "owner_operator",
    permissionedSession: true,
    storeCount: 5,
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
    willingnessToPay: true,
    ...overrides
  };
}

function canonical(overrides = {}) {
  return buildInboundValidationRecord(input(overrides));
}

test("canonical builder enforces every positive evidence dependency", () => {
  assert.throws(() => buildInboundValidationRecord(input({ importAttempted: false, importSucceeded: true })), /importSucceeded requires/);
  assert.throws(() => buildInboundValidationRecord(input({ reconciliationAttempted: false, metricTrusted: true })), /metricTrusted requires/);
  assert.throws(() => buildInboundValidationRecord(input({ insightReviewed: false, usefulNewInsight: true })), /usefulNewInsight requires/);
  assert.throws(() => buildInboundValidationRecord(input({ repeatUseAsked: false, repeatUseIntent: true })), /repeatUseIntent requires/);
  assert.throws(() => buildInboundValidationRecord(input({ continuousSyncAsked: false, continuousSyncIntent: true })), /continuousSyncIntent requires/);
  assert.throws(() => buildInboundValidationRecord(input({ valueDemonstrated: false, wtpAsked: true })), /wtpAsked requires/);
  assert.throws(() => buildInboundValidationRecord(input({ wtpAsked: false, willingnessToPay: true })), /willingnessToPay requires/);
});

test("WTP band is supplementary and cannot contradict the unanchored answer", () => {
  assert.doesNotThrow(() => buildInboundValidationRecord(input({ wtpBand: undefined })));
  assert.throws(
    () => buildInboundValidationRecord(input({ willingnessToPay: false, wtpBand: "2m+" })),
    /negative willingnessToPay/
  );
  assert.throws(
    () => buildInboundValidationRecord(input({ willingnessToPay: true, wtpBand: "0" })),
    /positive willingnessToPay/
  );
  assert.doesNotThrow(() => buildInboundValidationRecord(input({ willingnessToPay: false, wtpBand: "0" })));
});

test("target ICP derives from role plus 3-15 stores while permission controls score eligibility", () => {
  assert.equal(canonical({ participantRoleClass: "owner_operator", storeCount: 3 }).targetIcp, true);
  assert.equal(canonical({ participantRoleClass: "owner_operator", storeCount: 15 }).targetIcp, true);
  assert.equal(canonical({ participantRoleClass: "owner_operator", storeCount: 2 }).targetIcp, false);
  assert.equal(canonical({ participantRoleClass: "owner_operator", storeCount: 16 }).targetIcp, false);
  assert.equal(canonical({ participantRoleClass: "other", storeCount: 5 }).targetIcp, false);

  const tenUnpermissioned = Array.from({ length: 10 }, (_, i) => ({
    ...canonical({ id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`, permissionedSession: false })
  }));
  assert.equal(evaluateFieldValidation(tenUnpermissioned).targetRecords, 0);

  const mixed = Array.from({ length: 10 }, (_, i) => canonical({
    id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    permissionedSession: i < 9
  }));
  assert.equal(evaluateFieldValidation(mixed).targetRecords, 9);
  assert.equal(evaluateFieldValidation(mixed).sampleReady, false);
});

test("canonical source and acquisition normalization cannot retain arbitrary identity-like strings", () => {
  assert.equal(normalizeAnalyzerSource("kiotviet"), "kiotviet");
  assert.equal(normalizeAnalyzerSource("sapo-fnb"), "sapo_fnb");
  assert.equal(normalizeAnalyzerSource("merchant-owner@example.com"), "other_pos");
  assert.deepEqual(
    normalizeAcquisitionAttribution("seo", "organic", "kiotviet-excel-analysis"),
    { acquisitionSource: "seo", acquisitionMedium: "organic", acquisitionCampaign: "kiotviet-excel-analysis" }
  );
  assert.deepEqual(
    normalizeAcquisitionAttribution("owner@example.com", "https://example.com", "merchant-name"),
    { acquisitionSource: "other", acquisitionMedium: "other", acquisitionCampaign: "other" }
  );
});

test("registry rejects hand-edited shape/classification and never overwrites conflicting evidence", () => {
  const record = canonical();
  assert.doesNotThrow(() => assertCanonicalValidationRecord(record));
  assert.throws(() => assertCanonicalValidationRecord({ ...record, arbitrary: "x" }), /unknown canonical fields/);
  assert.throws(() => assertCanonicalValidationRecord({ ...record, source: "merchant-name" }), /normalized source class/);
  assert.throws(() => assertCanonicalValidationRecord({ ...record, targetIcp: false }), /targetIcp/);
  assert.throws(() => assertCanonicalValidationRecord({ ...record, storeBucket: "16+" }), /storeBucket/);

  const one = upsertValidationRecord(emptyValidationRegistry(), record);
  const same = upsertValidationRecord(one, { ...record });
  assert.equal(same.records.length, 1);
  assert.throws(
    () => upsertValidationRecord(one, { ...record, repeatUseIntent: false }),
    /already exists with different canonical evidence/
  );
});

test("draft finalization preserves role, permission and dependency semantics", () => {
  const draft = buildInboundValidationDraft({
    id: "44444444-4444-4444-8444-444444444444",
    source: "custom merchant name",
    participantRoleClass: "owner_operator",
    permissionedSession: true,
    storeCount: 7,
    importSucceeded: true,
    acquisitionSource: "email@example.com",
    acquisitionMedium: "https://example.com",
    acquisitionCampaign: "merchant"
  });
  assert.equal(draft.source, "other_pos");
  assert.equal(draft.acquisitionSource, "other");
  assert.equal(draft.targetIcp, true);
  assert.equal(draft.metricTrusted, null);

  const record = finalizeInboundValidationDraft(draft, {
    reconciliationAttempted: true,
    metricTrusted: false,
    insightReviewed: true,
    usefulNewInsight: false,
    repeatUseAsked: false,
    repeatUseIntent: false,
    continuousSyncAsked: false,
    continuousSyncIntent: false,
    valueDemonstrated: false,
    wtpAsked: false,
    willingnessToPay: false
  });
  assert.equal(record.metricTrusted, false);
  assert.equal(record.usefulNewInsight, false);
  assert.equal(record.wtpBand, undefined);
});

test("standalone scorecard CLIs fail closed on canonical-invalid records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cafeos-scorecard-boundary-"));
  try {
    const invalid = { ...canonical(), targetIcp: false };
    const validationPath = join(dir, "records.json");
    const acquisitionPath = join(dir, "evidence.json");
    await writeFile(validationPath, JSON.stringify([invalid]));
    await writeFile(acquisitionPath, JSON.stringify({ events: [], records: [invalid] }));

    for (const [script, file] of [
      ["scripts/validation-scorecard.mjs", validationPath],
      ["scripts/acquisition-scorecard.mjs", acquisitionPath]
    ]) {
      const result = spawnSync(process.execPath, [script, file], { cwd: repoRoot, encoding: "utf8" });
      assert.notEqual(result.status, 0, `${script} must reject invalid canonical evidence`);
      assert.match(String(result.stderr), /targetIcp/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("local field-session requires permission before reading and generates opaque ids per session", async () => {
  const denied = spawnSync(process.execPath, [
    "scripts/field-session.mjs",
    join(tmpdir(), "definitely-does-not-exist.csv"),
    "--source=kiotviet",
    "--stores=5",
    "--role=owner_operator",
    "--permissioned=false",
    `--out=${join(tmpdir(), "cafeos-denied-session")}`
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.match(String(denied.stderr), /permissioned=true/);
  assert.doesNotMatch(String(denied.stderr), /ENOENT/);

  const dir = await mkdtemp(join(tmpdir(), "cafeos-session-id-"));
  try {
    const fixture = join(repoRoot, "fixtures", "known-anomaly.csv");
    const drafts = [];
    for (const name of ["a", "b"]) {
      const out = join(dir, name);
      const result = spawnSync(process.execPath, [
        "scripts/field-session.mjs",
        fixture,
        "--source=kiotviet",
        "--stores=5",
        "--role=owner_operator",
        "--permissioned=true",
        `--out=${out}`
      ], { cwd: repoRoot, encoding: "utf8" });
      assert.equal(result.status, 0, String(result.stderr || result.stdout));
      drafts.push(JSON.parse(await readFile(join(out, "validation-record.draft.json"), "utf8")));
    }
    assert.notEqual(drafts[0].id, drafts[1].id);
    assert.doesNotMatch(drafts[0].id, /^field-[0-9a-f]{12}$/i);
    assert.equal(Object.hasOwn(drafts[0], "sourceFileSha256"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Windows field workflow asks permission before Node and keeps source/finalizer choices bounded", async () => {
  const launcher = await readFile(join(repoRoot, "field-kit", "windows", "run-field-session.ps1"), "utf8");
  const permissionIndex = launcher.indexOf("explicit permission to process this merchant export");
  const nodeIndex = launcher.indexOf("& node");
  assert.ok(permissionIndex >= 0 && nodeIndex > permissionIndex);
  assert.match(launcher, /Permission declined\. No merchant file was read/);
  assert.match(launcher, /other_pos/);
  assert.match(launcher, /generic_excel_csv/);
  assert.doesNotMatch(launcher, /POS\/source \(e\.g\./);

  const finalizer = await readFile(join(repoRoot, "field-kit", "windows", "finalize-field-session.ps1"), "utf8");
  assert.match(finalizer, /if \(\$DraftRecord\.importSucceeded -and \$Answers\.reconciliationAttempted\)/);
  assert.match(finalizer, /if \(\$Answers\.metricTrusted -and \$Answers\.insightReviewed\)/);
  assert.match(finalizer, /if \(\$Answers\.willingnessToPay\)/);
  assert.doesNotMatch(finalizer, /WTP band: 0/);
});
