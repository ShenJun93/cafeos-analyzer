import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("field kit package is executable, ESM-explicit and least privilege", async () => {
  const temp = await mkdtemp(join(tmpdir(), "cafeos-field-kit-package-"));
  const out = join(temp, "kit");
  let server = null;

  try {
    const build = spawnSync(process.execPath, ["scripts/build-field-kit.mjs", out], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    assert.equal(build.status, 0, String(build.stderr || build.stdout));

    const required = [
      "package.json",
      "README.md",
      "FIELD_KIT_BUILD.txt",
      "scripts/serve.mjs",
      "scripts/field-session.mjs",
      "scripts/finalize-field-session.mjs",
      "scripts/field-registry.mjs",
      "web/index.html",
      "web/free-analyzer.html",
      "web/sample-report.html",
      "web/feedback.html",
      "field-kit/START_CAFEOS.cmd",
      "field-kit/RUN_FIELD_SESSION.cmd",
      "field-kit/FINALIZE_FIELD_SESSION.cmd",
      "field-kit/SCORE_VALIDATION.cmd",
      "field-kit/windows/start-cafeos.ps1",
      "field-kit/windows/run-field-session.ps1",
      "field-kit/windows/finalize-field-session.ps1",
      "docs/WINDOWS_FIELD_KIT.md",
      "docs/FIELD_VALIDATION_PROTOCOL.md",
      "docs/FIELD_SESSION_RUNBOOK.md",
      "docs/VALIDATION.md",
      "fixtures/known-anomaly.csv",
      "dist/file.js",
      "dist/validation-registry.js"
    ];
    for (const relative of required) {
      assert.equal(await exists(join(out, relative)), true, `missing packaged file: ${relative}`);
    }

    const forbidden = [
      "AGENTS.md",
      "node_modules",
      "field-validation-registry.json",
      "field-sessions",
      "scripts/deploy-control-tower-preview.ps1",
      "scripts/run-control-tower-auth-smoke.ps1",
      "scripts/operator-offboard-user.mjs",
      "scripts/operator-offboard-tenant.mjs"
    ];
    for (const relative of forbidden) {
      assert.equal(await exists(join(out, relative)), false, `forbidden packaged file: ${relative}`);
    }

    const packageJson = JSON.parse(await readFile(join(out, "package.json"), "utf8"));
    assert.equal(packageJson.type, "module");
    assert.deepEqual(Object.keys(packageJson).sort(), ["type"]);

    const score = spawnSync(
      process.execPath,
      ["scripts/field-registry.mjs", "score", join(temp, "missing-registry.json")],
      { cwd: out, encoding: "utf8" }
    );
    assert.equal(score.status, 0, String(score.stderr || score.stdout));
    const scorecard = JSON.parse(score.stdout);
    assert.equal(scorecard.overall, "INSUFFICIENT_EVIDENCE");
    assert.equal(scorecard.targetRecords, 0);

    const port = 44000 + (process.pid % 1000);
    server = spawn(process.execPath, ["scripts/serve.mjs"], {
      cwd: out,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let health = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) {
          health = await response.json();
          break;
        }
      } catch {}
      await delay(100);
    }

    assert.ok(health, "packaged local server did not become healthy");
    assert.equal(health.service, "cafeos-analyzer");
    assert.equal(health.persistence, "none");
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([
        new Promise(resolve => server.once("exit", resolve)),
        delay(2000)
      ]);
    }
    await rm(temp, { recursive: true, force: true });
  }
});
