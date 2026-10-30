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

The separate staging web/API deployment is now running with the staging URL and publishable key. Managed service credentials remain inside the staging Edge runtime. Live Intervals authorisation remains unverified. No production release flag or production database was changed by this setup.

## Staging web and API deployment

The dedicated Vercel project is `azur-staging` (`prj_gJNvJq96Ijn1ijVxcj1j1ftIItBI`) in the existing Jay Brittles team. It uses Node 24, the staging Supabase URL/publishable key, a visible staging banner and a narrowly validated `AZUR_STAGING_BACKEND_URL`. The live project receives no environment-variable changes.

The `import-review` Supabase Edge Function wraps the same preview, staging, acceptance and load handlers as the app. Its server credentials come from the staging runtime. Gateway JWT verification is disabled because the router performs real Auth `/user` validation for every data route; the selected handlers also verify the user. Only a non-sensitive `/health` response is public. Unknown routes and mismatched project URLs fail closed.

Preview/staging handlers accept a request-scoped fetch dependency. A fixture Intervals response is supplied only for a real authenticated account with the server-controlled `app_metadata.azur_staging_test=true` flag. User metadata and request data cannot enable this mode. The ride is explicitly named **AZUR STAGING — synthetic Zwift ride**. All Auth, profile, inbox, accepted-activity and load writes still use the hosted staging services. This does not verify live Intervals OAuth or retrieve real athlete rides.

One isolated synthetic staging Auth account has been provisioned for the hosted browser test, with a random private password and a placeholder integration record containing no provider credential. No invitation or verification emails were sent. Credentials and sessions are stored outside the repository and must never be committed.

API unit tests live under `tests/api/intervals`, outside Vercel's deployable `/api` directory. The earlier location caused test files to count as serverless functions and exceeded the Hobby plan's 12-function limit. The app now has 10 deployable API files. CI rejects API test files under `/api`.

`tests/staging-live.browser.mjs` exercises the hosted sign-in → web proxy → Edge handlers → database → saved score and replay → Weekly Review flow. Set `AZUR_TEST_URL`, `AZUR_STAGING_AUTH_FILE` and, when needed, an ephemeral Vercel access-link file via `AZUR_STAGING_ACCESS_FILE`. Private credentials are runtime-only; this test must not run against production.

The latest Auth advisor also reports leaked-password protection disabled. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No Auth protection settings were changed for testing.


A hosted-browser run identified review state resetting during background profile/Auth updates. Review state now lives in the persistent App owner scope and is cleared when the signed-in athlete changes. A browser regression sends a token-refresh event while the review is open and checks that the ride remains visible. Responses from a previous session are discarded.

When the test environment uses a managed HTTPS proxy, `AZUR_BROWSER_PROXY` (or `HTTPS_PROXY`) configures Chromium's proxy. `AZUR_BROWSER_IGNORE_HTTPS_ERRORS=true` is an explicit test-browser-only option for a private proxy CA; it defaults to false and does not alter the deployed site's TLS or protections.


## Hosted end-to-end result

- Stable staging URL: https://azur-staging.vercel.app
- Tested deployment: `dpl_9KRgEoj48uVMWsqWCQqTQ2T1yUqD` / https://azur-staging-6ln25m3km-jay-brittles.vercel.app
- Tested app commit: `0efc64638ae2a39a00829697432ad52c76c59338`; deployment READY, Preview target in the separate staging project.
- Staging Edge Function: `import-review`, version 3 (shared handler source from `54366b8374f7dd94ce28ff2c1397a88217324031`).
- Actual hosted browser result: real Auth password sign-in → Vercel proxy → Edge handlers → hosted database → approve 98 stress points → replay returns `already_validated` with `trainingLoadChanged=false` → Weekly Review shows 98.
- Follow-up hosted database check: one synthetic Intervals activity, `load_status=validated`, saved stress 98, FTP snapshot 250. This labelled record and its isolated synthetic account are retained for staging review; the earlier rollback-only smoke test still left no records of its own.
- All CI workflows passed on the tested functional commit: 101 calculation tests, 50 API/routing tests, builds, synthetic Chromium checks (including background Auth refresh), and real PostgreSQL safety/concurrency checks.
- Vercel protection stayed enabled. Temporary deployment-scoped browser access was revoked after testing. The normal staging URL requires the owner's Vercel access plus a separate staging app login.
- The Intervals response in this test is deliberately synthetic. Real Intervals OAuth client configuration, a staging callback and athlete authorisation are still required before claiming real Zwift retrieval/import is verified in staging. The focused staging schema is not a complete race/coach/product test environment.
