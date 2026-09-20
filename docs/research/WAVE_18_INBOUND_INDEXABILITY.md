# Wave 18 — inbound indexability and evidence-return friction

Date: 2026-09-20

## Scope

Distribution-only hardening. No product feature expansion.

## Evidence

- Ahrefs keyword volume API was attempted but returned `Insufficient plan`; no search-volume claims are made.
- Current Vietnamese SERPs for generic "file Excel quản lý quán cafe" skew toward templates, bookkeeping and full POS management, which is not the locked 3–15-location ICP.
- Official KiotViet F&B documentation confirms reporting across branches/products/customers and Excel export workflows.
- Official Sapo FnB documentation confirms reports can be exported to Excel. Current Sapo report documentation also states a 20,000-row maximum per export for multiple report types.
- Google Search Central recommends using sitemaps to surface preferred canonical URLs and self-referential `rel=canonical` annotations where duplicate URL variants can exist.

Sources:
- https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-bao-cao/bao-cao/
- https://support.sapo.vn/faqs-sapo-fnb
- https://help.sapo.vn/xem-bao-cao-don-hang-chi-tiet-theo-thong-tin-san-pham-tren-sapo
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls

## Decisions

1. Keep the wedge: existing POS → export Excel/CSV → independent deterministic analysis.
2. Do not compete for broad "quản lý quán cafe bằng Excel" intent with template/ERP content.
3. Add root `robots.txt` and `sitemap.xml`.
4. Add canonical metadata to the live indexable surfaces.
5. Keep `/feedback` out of search results.
6. Add a direct Analyzer → GitHub compatibility-report path so schema-only evidence can return without raw merchant data.
7. Indexability is not the same as indexing or traffic. Do not claim SEO traction until Search Console/SERP evidence exists.

## Next measurement

Observe inbound visits/compatibility reports and field-validation records. Do not create more SEO content until one of the locked surfaces produces evidence or a query gap is verified.
