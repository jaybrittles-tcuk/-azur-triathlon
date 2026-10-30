# AZUR import staging

Created on 30 October 2026 in the existing Jay Brittles Free organisation.

- Project: **AZUR Staging** (`juvceqrzkeethontnezw`)
- Dashboard: https://supabase.com/dashboard/project/juvceqrzkeethontnezw
- Region: `eu-west-1`
- Supabase creation quote: **$0/month** on the Free plan; no Pro upgrade or paid branch was created.
- This is a standalone project, not a Supabase branch and not a complete app deployment.

## Scope and safeguards

`import_baseline.sql` creates the production-compatible tables used by the import handlers. It includes real Supabase Auth foreign keys and athlete ownership policies. Its explicit staging-reference and empty-table checks reject accidental use on an existing live schema.

This is a scoped schema, not a production clone: race planning, coach assignments, unrelated app tables, update triggers and the season-week race-focus foreign key are outside this setup. UUID defaults use the built-in `gen_random_uuid()`.

No production athlete records, activity history or integration credentials were copied. Integration tokens are server-only: no browser grants or read policies exist on `athlete_integration`. The advisor's informational [RLS enabled with no policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for that table is intentional default-deny access.

## Installed migrations

The connected migration tool records installation-time versions, distinct from the repository filenames. Review this mapping before linking CLI migration history; do not run an unattended `db push` against this standalone project.

| Repository source | Staging history version |
| --- | --- |
| `staging/import_baseline.sql` | `20261030154159` |
| `migrations/20261030152435_intervals_import_inbox.sql` | `20261030154204` |
| `migrations/20261030152441_intervals_accept_reviewed.sql` | `20261030154205` |
| `migrations/20261030152448_intervals_validate_load.sql` | `20261030154207` |
| `migrations/20261030152454_protect_intervals_activity_writes.sql` | `20261030154220` |

## Verification

The metadata-only release preflight reports compatible base columns, RLS, required server grants, inbox/acceptance/load functions and all three restrictive import-write policies installed.

Run `transaction_smoke.sql` only on this project, after setting `azur.staging_project_ref` to its verified reference in the same connection. It uses synthetic Auth/profile records inside a transaction, checks staging, wrong-athlete rejection, acceptance, load quarantine, approval to 98 stress points, replay without duplication and unchanged planned-session linkage, then rolls back all records.

This smoke test **passed against the hosted staging project**. Follow-up counts confirmed zero athlete profiles, activities and inbox rows. A larger test batch containing delete/policy-removal statements was not executed after its additional confirmation expired; the non-destructive smoke test was used instead. The full permission/concurrency suite remains covered by real PostgreSQL CI.

Security advisor result: no error/warning findings; one intentional server-only integration-table INFO notice as explained above.

## Remaining integration work

A separate staging application/API deployment must use this project's URL, publishable key and server-only service credential. Import release flags must be configured only for that staging deployment. No staging app URL, authenticated browser-to-server flow or live Intervals authorisation has been verified yet. No production release flag or production database was changed by this setup.
