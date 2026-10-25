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

  assert.match(html, /class="row hidden" id="row-wtpAsked"/);
  assert.match(html, /class="row hidden" id="row-willingnessToPay"/);
  assert.match(html, /class="row hidden" id="row-band"/);
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


test("E1 inbound opt-in is public-safe, bounded and separate from Analyzer evidence", async () => {
  const template = await readFile(
    new URL("../.github/ISSUE_TEMPLATE/control-tower-e1-interest.yml", import.meta.url),
    "utf8"
  );
  const publicHtml = await readFile(new URL("../public/feedback.html", import.meta.url), "utf8");
  const localHtml = await readFile(new URL("../web/feedback.html", import.meta.url), "utf8");

  const ids = [...template.matchAll(/^\s+id:\s*([a-z0-9_]+)\s*$/gmi)].map(match => match[1]);
  assert.deepEqual(ids, [
    "participant_role",
    "store_count_bucket",
    "transaction_source",
    "public_privacy_ack"
  ]);

  assert.doesNotMatch(template, /^\s*- type:\s*(?:input|textarea)\s*$/gmi);
  assert.match(template, /This issue is public/);
  assert.match(template, /Do not post/);
  assert.match(template, /local\/transient Analyzer path/);
  assert.match(template, /synthetic data/i);
  assert.match(template, /does not authorize CafeOS to process or persist merchant operational data/i);

  const cta = "issues/new?template=control-tower-e1-interest.yml";
  for (const html of [publicHtml, localHtml]) {
    assert.equal(html.includes(cta), true);
    assert.ok(
      html.indexOf("</form>") < html.indexOf(cta),
      "E1 interest CTA must remain outside the Analyzer validation evidence form"
    );
    assert.match(html, /không đăng tên, email, số điện thoại/i);
  }
});
