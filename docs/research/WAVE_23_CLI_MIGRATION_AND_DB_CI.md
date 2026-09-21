# Wave 23 — CLI migration history and reproducible database CI

Date: 2026-09-21

## Objective

Close the gap between a staging-verified SQL contract and reproducible Supabase migration history without inventing migration timestamps or depending on the user's offline Windows machine.

## CLI authority

Stable Supabase CLI checked during this wave: `v2.117.0` (released 2026-09-07).

A bounded GitHub Actions generator pinned `supabase/setup-cli@v1` to `2.117.0`, inspected the CLI help surface and invoked `supabase migration new`. The one-off generator was removed after producing the artifacts.

## Ordered migration history

Control Tower depends on the Analyzer baseline, so the CLI generated:

1. `20260921005530_analyzer_core.sql`
2. `20260921005532_control_tower_core.sql`

Migration contents are locked to canonical sources by `tests/supabase-migration-sync.test.mjs`.

A transfer initially dropped the Analyzer migration's final newline. Strict byte equality caught it and the byte was restored; the committed migration blob now matches the legacy Analyzer baseline blob.

## Blank-DB verification

Persistent workflow: `.github/workflows/supabase-db.yml`.

It starts a clean local Supabase stack, applies both migrations in order and runs the pgTAP suite in `supabase/tests/database/control_tower_rls.test.sql`.

A successful branch run demonstrated local stack startup, ordered migration application, all 10 RLS/workflow assertions passing, migration-state reporting and stack teardown.

No Supabase cloud secret or merchant data is used.

## Next boundary

This wave does not authorize production persistence. Next product work is the authenticated Control Tower app/API shell against staging/synthetic data only, with RLS remaining the final database authorization boundary.
