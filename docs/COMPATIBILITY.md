# Representative compatibility corpus v0.1

Wave 7 adds a small **synthetic vendor-style** fixture corpus. These files are not claimed to be byte-for-byte exports from live merchant accounts. They deliberately use field vocabulary exposed in official public API/documentation so the mapping layer is exercised against realistic naming variation without inventing private export formats.

## Fixtures

- `fixtures/vendor/kiotviet-style.csv`
  - vocabulary informed by KiotViet F&B invoice/public API fields such as purchase date, invoice code, branch name, product name, quantity and customer contact.
- `fixtures/vendor/cukcuk-style.csv`
  - vocabulary informed by CUKCUK OpenPlatform order fields such as `Date`, `No`, branch, item name, quantity, amount and `CustomerTel`.
- `fixtures/vendor/pos365-style.csv`
  - vocabulary informed by POS365 public order/product API naming conventions.
- `fixtures/vendor/manual-fallback.csv`
  - intentionally unknown headers to verify that CafeOS stops instead of guessing and can resume with explicit user mapping.

## Mapping policy

1. Normalize Vietnamese diacritics/case/punctuation.
2. Prefer exact known aliases with high confidence.
3. Allow conservative contained-alias matches only above the mapping threshold.
4. Never silently map two canonical fields to the same source column.
5. If any required field remains unmapped, stop analysis and request explicit mapping.
6. Manual mapping is authoritative for that run and is validated before normalization.

## Validation status

All three vendor-style fixtures currently auto-map the six required v0.1 fields. The unknown-header fixture correctly blocks automatic analysis and passes only after explicit mapping.

The next evidence upgrade must come from real, permissioned merchant exports. Public documentation cannot prove live Excel column names or merchant-specific customizations.
