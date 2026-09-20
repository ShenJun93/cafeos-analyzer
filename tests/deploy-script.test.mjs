import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Vercel deploy launcher handles first deployment and already-connected Git integration", async () => {
  const ps = await readFile(new URL("../scripts/deploy-vercel.ps1", import.meta.url), "utf8");
  assert.match(ps, /Test-Path .*\.vercel\\project\.json/);
  assert.match(ps, /Vercel may assign the first deployment to production/i);
  assert.match(ps, /already connected/);
  assert.match(ps, /gitConnectExit -ne 0 -and .* -notmatch "already connected"/);
});
