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

test("Daily Brief correctness migration stays text-equivalent to canonical contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/daily_brief_correctness.sql", import.meta.url),
    "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20260921164500_daily_brief_correctness.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});

test("Daily Brief aggregate migration stays text-equivalent to canonical contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/daily_brief_aggregate.sql", import.meta.url),
    "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20260921100900_daily_brief_aggregate.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});

test("user-offboarding FK migration stays text-equivalent to canonical contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/action_owner_offboarding.sql", import.meta.url),
    "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20260921170000_action_owner_offboarding.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});

test("Store Health read-model migration stays text-equivalent to canonical contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/store_health_read_model.sql", import.meta.url),
    "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20260921201000_store_health_read_model.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});

test("Action Measurement loop migration stays text-equivalent to canonical contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/action_measurement_loop.sql", import.meta.url),
    "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20260921203000_action_measurement_loop.sql", import.meta.url),
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


test("Core Commerce v1 migration stays text-equivalent to canonical contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/core_commerce_v1.sql", import.meta.url),
    "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20261025094352_core_commerce_v1.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});


test("Core Commerce future-date close guard migration matches its incremental canonical contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/core_commerce_future_close_guard.sql", import.meta.url), "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20261025130000_core_commerce_future_close_guard.sql", import.meta.url),
    "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});


test("Core Commerce order price snapshot guard CLI migration stays canonical", async () => {
  const source = await readFile(
    new URL("../db/contracts/core_commerce_order_price_snapshot_guard.sql", import.meta.url), "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20261025140000_core_commerce_order_price_snapshot_guard.sql", import.meta.url), "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});

test("incremental void-order migration stays byte-equivalent to first-party canonical SQL contract", async () => {
  const source = await readFile(
    new URL("../db/contracts/core_commerce_void_order.sql", import.meta.url), "utf8"
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20261028130000_core_commerce_void_order.sql", import.meta.url), "utf8"
  );
  assert.equal(normalizeSqlText(migration), normalizeSqlText(source));
});
