import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("CLI-generated Analyzer migration stays byte-equivalent to canonical baseline", async () => {
  const source = await readFile(new URL("../db/migrations/001_analyzer_core.sql", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../supabase/migrations/20260921005530_analyzer_core.sql", import.meta.url),
    "utf8"
  );
  assert.equal(migration, source);
});

test("CLI-generated Control Tower migration stays byte-equivalent to staging-verified contract", async () => {
  const source = await readFile(new URL("../db/contracts/control_tower_core.sql", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../supabase/migrations/20260921005532_control_tower_core.sql", import.meta.url),
    "utf8"
  );
  assert.equal(migration, source);
});
