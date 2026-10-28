import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("CafeOS canonical mission is a full cafe operating ecosystem", async () => {
  const mission = await read("../MISSION.md");
  const architecture = await read("../docs/PRODUCT_ARCHITECTURE.md");
  const roadmap = await read("../docs/ROADMAP.md");
  const readme = await read("../README.md");
  const agents = await read("../AGENTS.md");
  const combined = [mission, architecture, roadmap, readme, agents].join("\n");

  assert.match(mission, /full caf[eé] operating ecosystem/i);
  assert.match(combined, /Core Commerce|CafeOS POS/i);
  assert.match(combined, /first-party commerce/i);
  assert.match(combined, /external POS|existing POS/i);
  assert.match(combined, /Analyzer[^.\n]*(module|wedge)/i);
  assert.match(combined, /pull\/inbound/i);

  assert.doesNotMatch(
    mission,
    /CafeOS is designed to sit \*\*above existing POS and operational systems\*\*, not to require a café to replace them/i
  );
  assert.doesNotMatch(
    architecture,
    /commodity transaction execution stays with established POS\/order\/payment systems where possible/i
  );

  assert.match(combined, /payment acquiring|payment processor/i);
  assert.match(combined, /payroll/i);
  assert.match(combined, /accounting/i);
  assert.match(combined, /not.*v1|deferred|later/i);
});
