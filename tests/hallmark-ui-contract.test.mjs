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
