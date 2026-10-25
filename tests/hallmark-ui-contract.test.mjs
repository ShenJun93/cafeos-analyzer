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


test("feedback uses warm research stages while preserving one-page evidence semantics", async () => {
  for (const file of ["../public/feedback.html", "../web/feedback.html"]) {
    const html = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(html, /<link rel="stylesheet" href="\/cafeos-ui\.css">/);
    for (const marker of [
      "feedback-shell",
      "privacy-intro",
      "evidence-stage",
      "evidence-stage-context",
      "evidence-stage-trust",
      "evidence-stage-insight",
      "evidence-stage-intent",
      "evidence-stage-value",
      "e1-research-invite"
    ]) assert.equal(html.includes(marker), true, "missing feedback marker " + marker + " in " + file);

    assert.equal((html.match(/<form\b/g) || []).length, 1);
    assert.equal(html.includes('id="f"'), true);
    assert.ok(html.indexOf("</form>") < html.indexOf("control-tower-e1-interest.yml"));
    assert.match(html, /không cấp quyền hồi tố/i);
  }
});


test("Control Tower E1 uses bounded Glass Control Room macrostructure", async () => {
  const html = await readFile(new URL("../web/control-tower-e1.html", import.meta.url), "utf8");

  assert.match(html, /<link rel="stylesheet" href="\/cafeos-ui\.css">/);
  for (const marker of [
    "control-shell",
    "synthetic-system-strip",
    "control-commandbar",
    "brief-stage",
    "control-metrics",
    "queue-board",
    "store-diagnostic",
    "action-workspace",
    "measurement-evidence"
  ]) assert.equal(html.includes(marker), true, "missing Control Tower marker " + marker);

  assert.match(html, /DEMO \/ SYNTHETIC CONTROL TOWER DATA — NOT YOUR STORE DATA/);
  assert.match(html, /before\/after measured change — not causal attribution/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);

  const glassCount=(html.match(/glass-surface/g) || []).length;
  assert.ok(glassCount >= 1 && glassCount <= 4, "glass surfaces must stay bounded");
  assert.equal(html.includes("status-resolution-panel"), true);
  assert.equal(html.includes("measurement-create-panel"), true);
});


test("Hallmark final gate keeps responsive, accessible and non-generic frontend contracts", async () => {
  const css = await readFile(new URL("../public/cafeos-ui.css", import.meta.url), "utf8");
  const pages = [
    "../public/index.html",
    "../public/analyzer.html",
    "../public/feedback.html",
    "../web/control-tower-e1.html"
  ];

  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media[^{]*max-width:\s*720px/);
  assert.doesNotMatch(css, /purple|pink|#[a-f0-9]{0,2}(?:ff00ff|c026d3|a855f7)/i);

  for (const file of pages) {
    const html = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(html, /<link rel="stylesheet" href="\/cafeos-ui\.css">/);
    assert.doesNotMatch(html, /google-analytics|googletagmanager|segment\.com|mixpanel|posthog/i);
  }

  const analyzer = await readFile(new URL("../public/analyzer.html", import.meta.url), "utf8");
  const control = await readFile(new URL("../web/control-tower-e1.html", import.meta.url), "utf8");
  assert.equal(analyzer.includes("queue-board"), false);
  assert.equal(control.includes("metric-band"), false);

  const feedback = await readFile(new URL("../public/feedback.html", import.meta.url), "utf8");
  const controlIds=[...feedback.matchAll(/<(?:select|input)\s+id="([^"]+)"/g)].map(match=>match[1]);
  for (const id of controlIds) {
    assert.equal(
      feedback.includes('for="' + id + '"'),
      true,
      "feedback control must have an explicit label association: " + id
    );
  }
});
