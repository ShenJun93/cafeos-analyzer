import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { buildCompatibilityProfile } from "../dist/validation.js";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/validation-profile.mjs <file.csv|file.xlsx>");
  process.exit(2);
}
const path = resolve(input);
const data = new Uint8Array(await readFile(path));
const profile = buildCompatibilityProfile(basename(path), data);
process.stdout.write(JSON.stringify(profile, null, 2) + "\n");
