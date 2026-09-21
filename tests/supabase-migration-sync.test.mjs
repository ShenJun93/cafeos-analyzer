import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export function normalizeSqlText(value) {
  return value.replace(/\r\n?/g, "\n");
}

test("CLI-generated Analyzer migration stays text-equivalent to canonical baseline", async () => {
  const source = await readFile(new URL("../db/migrations/001_analyzer_core.sql", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../supabase/migrations/20260921005530_analyzer_core.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});

test("CLI-generated Control Tower migration stays text-equivalent to staging-verified contract", async () => {
  const source = await readFile(new URL("../db/contracts/control_tower_core.sql", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../supabase/migrations/20260921005532_control_tower_core.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});

test("Daily Brief correctness migration stays text-equivalent to its reviewed contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/daily_brief_correctness.sql", import.meta.url),
    "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20260921093000_daily_brief_correctness.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});

test("migration sync normalization ignores line-ending style only", () => {
  const lf = "select 1;\nselect 2;\n";
  const crlf = "select 1;\r\nselect 2;\r\n";
  const cr = "select 1;\rselect 2;\r";

  assert.equal(normalizeSqlText(lf), normalizeSqlText(crlf));
  assert.equal(normalizeSqlText(lf), normalizeSqlText(cr));
  assert.notEqual(normalizeSqlText("select 1;\n"), normalizeSqlText("select 2;\n"));
});
