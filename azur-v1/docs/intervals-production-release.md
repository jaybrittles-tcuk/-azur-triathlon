# AZUR Intervals production release — review package

Prepared 30 October 2026. Status: ready for owner review; production rollout has not been performed.

## Verified evidence

Tested application commit: `a8f6ae804731b4bcc78a56e9f7be210ac52116e8`.
Staging: https://azur-staging.vercel.app, deployment `dpl_BJTtsaRdPs7R5a3oLE5DtF3wVujq`.
CI: https://github.com/jaybrittles-tcuk/-azur-triathlon/actions/runs/41116984691.
All 161 calculation/API tests, browser workflow, onboarding, real PostgreSQL concurrency/RLS tests and builds pass.

Jay completed real Intervals consent and imported the 29 October Zwift VO2 Into Tempo ride in staging. Database inspection confirmed one source `i203475013` record, validated stress 62, FTP snapshot 315 W, and no planned-session link. Jay confirmed 62 in Weekly Review. The actual provider duration was 4029 seconds; the earlier synthetic fixture used 4026 seconds. The fixture is not evidence for real ride metrics.

Ride preview now reconciles recorded/approved state without a manual refresh. Browser assertions verify the staging button disappears after recording, approval status updates, and new athletes complete automatic full-screen onboarding before reaching the dashboard.

## Read-only production audit

Project: `tdjxqinhlmlfowqjuvzo`; Vercel project: `prj_rfZmIonShvKy6yGiYzrNUKVeDX3I`.
Preflight found zero column mismatches, activity RLS enabled, service-role write privileges and `UNIQUE(source, source_activity_id)`. OAuth state has required columns, RLS and no authenticated browser reads. All four import migrations/functions/policies are absent, as expected before release.

Production has 19 activities: 14 Garmin, 3 manual, 1 manual FIT and 1 manual test. No repeated non-null source/source-ID pairs exist. All five existing bike records were checked offline through the actual preview detector: each was recognised as a cross-provider duplicate using its existing time/duration/distance, and as already imported when replayed with an identical Intervals identity. The target 29 October ride is absent and classified unmatched. These are read-only compatibility checks; they do not prove that heuristic matching catches every future recording discrepancy. SQL transaction tests separately cover duplicate rejection at staging/acceptance/load approval, including late overlaps.

Environment metadata confirms production entries for Intervals client ID/secret, Supabase service role and frontend connection variables. Values were not decrypted; presence does not independently prove validity. The three import flags and staging bridge variables are absent. Missing import flags default to disabled. The production Intervals client value, provider callback registration and actual deployed environment must be verified through owner sign-in/consent during rollout.

## Exact rollout sequence after owner approval

1. Record the current deployment again immediately before release. Audit baseline: `dpl_6EwpMP1hspvQ33ksTu6kqCVzwBbC`, alias `azur-triathlon.vercel.app`. Preserve its environment configuration. Recheck branch/main and preflight for drift.
2. Keep `INTERVALS_STAGING_ENABLED`, `INTERVALS_ACCEPTANCE_ENABLED` and `INTERVALS_LOAD_VALIDATION_ENABLED` false. Keep `AZUR_STAGING_BACKEND_URL` and `AZUR_STAGING_OAUTH` absent. Never use the staging baseline, staging OAuth supplement or staging onboarding SQL against production.
3. Apply the four migration files in order, preferably as one transaction via `supabase/release/intervals_production_bundle.sql`. For a direct SQL release, first `set azur.release_project_ref='tdjxqinhlmlfowqjuvzo'` in the same session. The setting is an operator guard, not an independent identity attestation: verify the selected project before executing. The whole bundle must succeed before continuing. Its source files are 20261030152435, 20261030152441, 20261030152448 and 20261030152454. Do not mix raw bundle execution and unattended CLI migration pushes: record/reconcile migration history explicitly for the chosen deployment method.
4. Rerun `supabase/release/intervals_preflight.sql`: compatibility and all installation booleans must be true. Review security advisors. Confirm required server-only grants, restrictive imported write policies and preservation of manual activity writes. Existing no-policy INFO findings on server-only token/state stores are intentional default deny.
5. Review/merge PR #4 and deploy the resulting main commit with all import flags false. Confirm public production origin and production Supabase project. Check the build, sign-in, existing activity display, manual logging and full-screen onboarding. Do not use Vercel Preview without its required production-scope environment, and do not copy secrets into a preview.
6. Enable `INTERVALS_STAGING_ENABLED=true`, deploy, and have Jay preview the exact target ride through the real production account. Then enable acceptance and load-validation flags, deploy, and complete stage → record → approve through the UI. Each flag change requires a fresh deployment. This is a controlled manual release; it does not enable webhooks or background imports.
7. Verify exactly one row for the reviewed source ID, saved FTP/stress, no unintended planned-session change, Weekly Review refresh, and replay without extra credit. If an existing duplicate is reported, stop and inspect rather than override it. Use current production FTP; do not assume staging’s 315 W or 62-point result applies to production.

## Rollback

If migration application fails inside the bundle, roll back the transaction and do not enable flags. If a later step fails, disable all three import flags and deploy immediately, or restore the previously recorded known-good deployment to recover frontend/API behavior. Restoring an older deployment does not change project environment settings for future builds: keep flags explicitly false as well.

Retain the additive schema, write-protection policies, inbox audit trail and any legitimately approved activities. Do not drop tables, remove safeguards, delete athlete data or mass-reset load status as a rollback. A genuinely incorrect approved activity requires a separately reviewed correction; hiding controls does not remove its saved training-load credit. Verify existing activity display and manual logging after rollback.

## Remaining boundaries

Owner approval is the next step before production schema application, PR merge, deployment and flag enablement. Production credential values were deliberately not inspected, so the first real production consent/preview remains a rollout check. Cross-provider similarity is conservative and heuristic. The separate staging environment omits unrelated coach/race tables; its coach invitation panel error does not establish whole-app beta readiness. Dashboard/calendar polish and the five-athlete Mersey Tri beta are separate product milestones.
