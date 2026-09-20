import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFingerprintText } from "../scripts/source-fingerprint.mjs";

test("source fingerprint normalization is invariant across LF, CRLF and CR", () => {
  const lf = "alpha\nbeta\ngamma\n";
  const crlf = "alpha\r\nbeta\r\ngamma\r\n";
  const cr = "alpha\rbeta\rgamma\r";

  assert.equal(normalizeFingerprintText(lf), lf);
  assert.equal(normalizeFingerprintText(crlf), lf);
  assert.equal(normalizeFingerprintText(cr), lf);
});
