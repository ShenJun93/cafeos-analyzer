import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function scriptOf(html) {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match, "feedback page must contain one inline behavior script");
  return match[1];
}

test("public and local feedback pages share one explicit complete-only behavior contract", async () => {
  const publicHtml = await readFile(new URL("../public/feedback.html", import.meta.url), "utf8");
  const localHtml = await readFile(new URL("../web/feedback.html", import.meta.url), "utf8");
  assert.equal(scriptOf(publicHtml), scriptOf(localHtml));
  assert.match(publicHtml, /noindex,nofollow/);
  assert.doesNotMatch(localHtml, /noindex,nofollow/);
});

test("feedback classification starts unresolved and cannot silently become target ICP", async () => {
  const html = await readFile(new URL("../public/feedback.html", import.meta.url), "utf8");
  assert.match(html, /id="source"[^>]*>[\s\S]*?<option value="" disabled selected>Chọn…<\/option>/);
  assert.match(html, /id="stores"[^>]*value=""/);
  assert.match(html, /id="role"[^>]*>[\s\S]*?<option value="" disabled selected>Chọn…<\/option>/);
  assert.match(html, /id="permission"[^>]*>[\s\S]*?<option value="" disabled selected>Chọn…<\/option>/);
  assert.match(html, /id="download"[^>]*disabled/);
  assert.doesNotMatch(html, /id="stores"[^>]*value="3"/);
});

test("feedback form keeps evidence questions separate and dependency-gated", async () => {
  const html = await readFile(new URL("../public/feedback.html", import.meta.url), "utf8");
  const script = scriptOf(html);
  for (const id of [
    "importAttempted",
    "importSucceeded",
    "reconciliationAttempted",
    "metricTrusted",
    "insightReviewed",
    "usefulNewInsight",
    "repeatUseAsked",
    "repeatUseIntent",
    "continuousSyncAsked",
    "continuousSyncIntent",
    "valueDemonstrated",
    "wtpAsked",
    "willingnessToPay"
  ]) assert.match(html, new RegExp(`id="${id}"`));

  assert.match(html, /id="row-wtpAsked" class="row hidden"/);
  assert.match(html, /id="row-willingnessToPay" class="row hidden"/);
  assert.match(html, /id="row-band" class="row hidden"/);
  assert.match(script, /setVisible\('row-wtpAsked',value===true\)/);
  assert.match(script, /setVisible\('row-band',willing===true\)/);
  assert.doesNotMatch(script, /metricTrusted:reconciled/);
  assert.doesNotMatch(script, /insightReviewed:true/);
  assert.doesNotMatch(script, /valueDemonstrated:useful/);
});

test("feedback attribution is bounded and evidence permission is not retroactive processing consent", async () => {
  const html = await readFile(new URL("../public/feedback.html", import.meta.url), "utf8");
  const script = scriptOf(html);
  assert.match(script, /normalizedAttribution/);
  assert.match(script, /acquisitionSource:'other',acquisitionMedium:'other',acquisitionCampaign:'other'/);
  assert.doesNotMatch(script, /acquisitionSource:q\.get/);
  assert.doesNotMatch(script, /referrer/i);
  assert.match(html, /không cấp quyền hồi tố/i);
});
