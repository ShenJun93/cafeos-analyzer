import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = "https://cafeos-analyzer.vercel.app";

test("robots.txt exposes sitemap and keeps API out of crawl", async () => {
  const robots = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");
  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${base.replace(/[.*+?^$()|[\\]{}]/g, "\\$&")}\\/sitemap\\.xml$`, "m"));
});

test("sitemap contains only locked indexable canonical surfaces", async () => {
  const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  for (const path of [
    "/",
    "/analyzer",
    "/sample-report",
    "/phan-tich-doanh-thu-quan-cafe-excel",
    "/phan-tich-file-kiotviet-cafe",
    "/phan-tich-file-sapo-fnb"
  ]) {
    assert.match(sitemap, new RegExp(`<loc>${base.replace(/[.*+?^$()|[\\]{}]/g, "\\$&")}${path === "/" ? "\\/" : path.replaceAll("/", "\\/")}<\\/loc>`));
  }
  assert.doesNotMatch(sitemap, /\/feedback/);
});

test("indexable pages declare self-referential canonical URLs", async () => {
  const pages = {
    "index.html": `${base}/`,
    "analyzer.html": `${base}/analyzer`,
    "sample-report.html": `${base}/sample-report`,
    "phan-tich-doanh-thu-quan-cafe-excel.html": `${base}/phan-tich-doanh-thu-quan-cafe-excel`,
    "phan-tich-file-kiotviet-cafe.html": `${base}/phan-tich-file-kiotviet-cafe`,
    "phan-tich-file-sapo-fnb.html": `${base}/phan-tich-file-sapo-fnb`
  };
  for (const [file, canonical] of Object.entries(pages)) {
    const html = await readFile(new URL(`../public/${file}`, import.meta.url), "utf8");
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^$()|[\\]{}]/g, "\\$&")}">`));
  }
});

test("feedback stays out of search while Analyzer exposes privacy-safe evidence return", async () => {
  const feedback = await readFile(new URL("../public/feedback.html", import.meta.url), "utf8");
  const analyzer = await readFile(new URL("../public/analyzer.html", import.meta.url), "utf8");
  assert.match(feedback, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(analyzer, /issues\/new\?template=compatibility-report\.yml/);
  assert.match(analyzer, /Gửi compatibility profile/);
});
