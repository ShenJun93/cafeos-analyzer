import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createControlTowerValidationDraft } from "../dist/control-tower-validation.js";

const [outputRaw, id, storeCountRaw, provenance, roleRaw] = process.argv.slice(2);
if (!outputRaw || !id || !storeCountRaw || !provenance) {
  console.error(
    "Usage: node scripts/control-tower-session.mjs <draft.json> <opaque-id> <store-count> <provenance> [owner_operator|hq_decision_maker|other]"
  );
  process.exit(2);
}

const storeCount = Number(storeCountRaw);
const participantRoleClass = roleRaw || null;
const draft = createControlTowerValidationDraft({
  id,
  storeCount,
  participantRoleClass,
  evidenceProvenance: provenance
});

const output = resolve(outputRaw);
await writeFile(output, JSON.stringify(draft, null, 2) + "\n");
console.log(JSON.stringify({ draft: output, id: draft.id, status: "DRAFT_NOT_SCOREABLE" }, null, 2));
