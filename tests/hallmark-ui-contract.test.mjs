import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Hallmark shared stylesheet defines CafeOS tokens and accessibility guards", async () => {
  const css = await readFile(new URL("../public/cafeos-ui.css", import.meta.url), "utf8");
  for (const token of [
    "--paper",
    "--espresso",
    "--clay",
    "--amber",
    "--smoke",
    "--verified",
    "--danger",
    "--font-display",
    "--font-ui"
  ]) assert.equal(css.includes(token), true, "missing token " + token);

  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media[^{]*max-width:\s*720px/);
});

test("Hallmark stylesheet is part of local preview and deploy artifact", async () => {
  const serverSource = await readFile(
    new URL("../scripts/serve-vercel-preview.mjs", import.meta.url),
    "utf8"
  );
  const deploy = await readFile(new URL("../scripts/verify-deploy.mjs", import.meta.url), "utf8");

  assert.match(serverSource, /['"]\/cafeos-ui\.css['"]/);
  assert.match(serverSource, /['"]\.css['"]\s*:\s*['"]text\/css;\s*charset=utf-8['"]/);
  assert.match(deploy, /public\/cafeos-ui\.css/);
});


test("landing uses Warm Cafe editorial macrostructure without changing evidence claims", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /<link rel="stylesheet" href="\/cafeos-ui\.css">/);
  for (const marker of [
    "landing-shell",
    "landing-masthead",
    "landing-hero",
    "operator-proof",
    "field-note",
    "compatibility-checklist",
    "privacy-boundary"
  ]) assert.equal(html.includes(marker), true, "missing landing marker " + marker);

  assert.match(html, /href="\/analyzer\?utm_source=cafeos-site&utm_medium=product&utm_campaign=free-analyzer"/);
  assert.match(html, /href="\/sample-report"/);
  assert.match(html, /3–15 cửa hàng/);
  assert.match(html, /không lưu file vào database\/object storage/i);
  assert.match(html, /validation build/i);
  assert.doesNotMatch(html, /<div class="grid">/);
  assert.doesNotMatch(html, /testimonial|customer logos|purple|pink gradient/i);
});


test("Analyzer uses editorial operations macrostructure while preserving the existing behavior surface", async () => {
  const html = await readFile(new URL("../public/analyzer.html", import.meta.url), "utf8");

  assert.match(html, /<link rel="stylesheet" href="\/cafeos-ui\.css">/);
  for (const marker of [
    "analyzer-shell",
    "analyzer-commandbar",
    "intake-stage",
    "metric-band",
    "evidence-rail",
    "diagnostic-strip",
    "attention-stage",
    "technical-evidence",
    "research-action"
  ]) assert.equal(html.includes(marker), true, "missing Analyzer marker " + marker);

  for (const id of [
    "file",
    "downloadProfile",
    "sheetPicker",
    "mappingPanel",
    "status",
    "report",
    "metrics",
    "health",
    "insights",
    "workbook",
    "feedbackLink"
  ]) assert.match(html, new RegExp('id="' + id + '"'));

  assert.match(html, /accept="\.csv,\.xlsx"/);
  assert.match(html, /tối đa 4MB/i);
  assert.match(html, /issues\/new\?template=compatibility-report\.yml/);
  assert.match(html, /href="\/sample-report"/);
  assert.match(html, /fetch\(path,\{method:'POST',body:file\}\)/);
  assert.match(html, /\/api\/analyze/);
  assert.match(html, /\/api\/inspect/);
  assert.match(html, /\/api\/profile/);
});
