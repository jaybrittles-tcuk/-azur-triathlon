# Current release status — 30 October 2026

Real staging OAuth and Zwift import are verified: one validated ride, 62 points at FTP 315 W, shown in Weekly Review. All checks pass at `a8f6ae804731b4bcc78a56e9f7be210ac52116e8`. Read-only production compatibility and existing-record duplicate checks are complete. Production remains awaiting release approval.

The authoritative current deployment and rollback plan is [intervals-production-release.md](intervals-production-release.md). The sections below retain historical implementation notes; their earlier “remaining” gates and test counts describe those earlier checkpoints, not the present release status.

---

# Intervals.icu import staging — rollout gate

## Current status
The four import migrations are committed in GitHub and installed in the separate AZUR Staging project; they remain unapplied to production.
Authenticated staging, acceptance and load-approval handlers are implemented behind separate server release flags. Do not deploy/apply until the remaining release checks pass.
No automatic activity ingestion is enabled.

## Security contract
1. Only the service role can call `stage_intervals_activity`. Never expose that key in Vite/browser.
2. The staging API must authenticate the AZUR user; resolve athlete_id from that user and not request input; re-fetch the activity through the athlete's Intervals token and verify ID.
3. Require fresh explicit consent for a manual stage; automated webhook ingestion requires separately approved opt-in and provenance controls.
4. Never accept arbitrary source_payload from a client. Build it on the server using authorised upstream results.
5. After staging, do not modify `completed_activity`, `planned_session` or the fitness/fatigue/form calculations. Acceptance is a separate explicit action which creates one completed record with load_status=pending_validation; it still does not link or complete a planned session. Stress validation is a separate gated action described below.

## Database release test checklist (staging environment, never production athlete data)
- Two concurrent calls for same athlete/source ID yield one row, second returns already_staged.
- Same ride from Garmin and Intervals is staged with possible_duplicate.
- Different rides outside tolerance remain pending_review.
- Unrelated athlete cannot SELECT another athlete's staged activity.
- Authenticated and anon roles cannot INSERT/UPDATE/DELETE or EXECUTE stage function.
- A staged ride cannot alter training load or planned-session status.
- Reject malformed IDs, negative power/distance and nonpositive duration.
- Confirm index and lock behavior under parallel calls.
- Confirm no production migration is applied until the tests pass.

## Known limitation
Cross-platform duplicate detection is heuristic. Do not automatically merge, match or credit a training-load record from a pending inbox item.


## Reviewed acceptance (development only)
- `INTERVALS_STAGING_ENABLED=true` exposes staging controls after preview.
- `INTERVALS_ACCEPTANCE_ENABLED=true` exposes the review inbox and acceptance controls. Both flags default to disabled and must remain disabled in production for now.
- `GET /api/intervals/accept-activity` resolves the athlete from the verified session and returns only their inbox metadata.
- `POST /api/intervals/accept-activity` requires `{stageId, confirm:true}`; client athlete IDs, metrics and validation flags are ignored.
- The acceptance transaction records consent and inserts the activity atomically under the athlete lock. Duplicate/rejected inbox rows are blocked; repeated acceptance returns the existing activity.
- The acceptance migration remains unapplied to production. Its development signature now includes `p_confirm boolean default false`; recheck migration history before deployment.
- Local verification: 101 calculation tests, 38 mocked API tests, full Vite production build with placeholder configuration, and fixture/migration/transaction/RLS SQL tests in embedded PostgreSQL (PGlite).
- Independent-connection concurrency checks are implemented in CI but have not been executed locally; PGlite verification does not establish that guarantee.
- Still required: live authenticated staging QA, real PostgreSQL concurrency results, complete browser workflow, and verification of the separately gated training-load approval path.


## Training-load approval (development only)
- `INTERVALS_LOAD_VALIDATION_ENABLED=true` exposes recorded rides and the explicit training-load approval action; it defaults to disabled.
- Apply `20261030152448_intervals_validate_load.sql` after BOTH existing staging and acceptance migrations. All four unapplied migrations now use valid, ordered CLI-generated timestamps. These migrations remain unapplied to production.
- The server resolves ownership from the verified athlete session. The transaction requires a reviewed inbox record matching the accepted activity, positive finite normalised power and current athlete FTP, and no overlapping recorded bike ride.
- Approval updates the existing activity with canonical normalised power, FTP snapshot, calculated stress, intensity factor, version and approval timestamp. Repeated approval returns the saved score without rewriting it or creating another activity.
- The dashboard consumes that saved Intervals score; a later FTP change does not recalculate it. Recorded rides load even when there are no planned sessions, and leaving Data Sources after an import/approval refreshes dashboard activities.
- Five additional score-consumption tests and 12 approval-handler tests cover missing validation, malformed scores, athlete ownership, disabled flags, consent and replay. Database tests cover missing FTP/NP, late duplicates, test exclusion, immutable replay and role permissions.
- The full build is now checked with harmless Supabase configuration placeholders: a build without these can optimise away app code after the missing-configuration throw.
- Remaining release work: live authenticated/browser QA, independent-connection PostgreSQL concurrency results, deployed-schema/permission review, and reconciling this draft branch with main. Saved-score idempotence does not prove concurrency across every external ingestion provider.


## Browser and branch verification
- The safe-import branch includes main's standalone mobile onboarding journey; both onboarding and ride-review CSS are preserved.
- Staging now handles auth network errors, rejects invalid upstream metrics, and requires a valid staging RPC result. Fifteen direct staging API tests cover disabled flags, ownership, provenance, duplicate/session review, consent, replay and malformed results.
- `tests/intervals-review.browser.mjs` exercises the UI against synthetic intercepted API and Supabase responses. It checks preview → staging → acceptance → load approval → refreshed weekly load with no planned sessions, plus mobile onboarding isolation and overflow.
- Run locally with the placeholder Supabase URL/key above, install `playwright@1.62.1` and its Chromium binary, start Vite, then run `node tests/intervals-review.browser.mjs`. An existing Playwright installation can be selected with `AZUR_PLAYWRIGHT_MODULE`; a packaged Chromium alternative can be selected with `AZUR_CHROMIUM_MODULE`.
- This is a browser contract test with synthetic responses, not proof of live backend or real PostgreSQL concurrency. The CI browser job runs separately from the database concurrency job.

- Current local results after reconciliation: 139 calculation/API tests passed; full Vite build passed; Chromium browser contract and standalone mobile onboarding checks passed. The Chromium test uses synthetic intercepted responses and does not replace the live staging release checks.


## Live schema audit and write protection (30 October 2026)
- Read-only checks against the AZUR project confirmed the required activity columns, global source/source-ID uniqueness, RLS and server grants. The import migrations are absent from live migration history; there is no separate development database branch yet.
- Live athlete ownership policies permit direct completed-activity INSERT/UPDATE. A new restrictive policy layer blocks browser INSERT/UPDATE/DELETE of Intervals records, including source relabelling and case/space variants. It preserves ownership-based reads, existing manual activity workflows and service-role transactions.
- Existing manual completion RPC definitions were reviewed: they insert or edit `source=manual`, not imported records.
- The disposable fixture now models the live integer FTP, required display name and permissive ownership policies, so security tests cannot pass just because all athlete writes are denied.
- New adversarial database tests verify forged validation, source relabelling, imported deletion, source spoofing, cross-athlete reads and manual create/edit/delete behaviour.
- All four unapplied migrations have been regenerated with valid, ordered CLI timestamps. No migration already present in production history was renamed.
- `supabase/release/intervals_preflight.sql` is a reusable metadata-only compatibility/installation report. Compatible base columns do not mean the import migrations are installed or the release flags are enabled.
- A standalone Free-plan AZUR Staging project has now been created instead of a paid branch. See `supabase/staging/README.md` for its scope and verification. No production schema or athlete data has been modified by this audit.


## Hosted staging setup
The standalone `AZUR Staging` project is healthy. All four migrations and the guarded import baseline are installed. Required-schema preflight checks pass. A hosted transaction smoke test passed through staging, acceptance and saved-score validation to 98 stress points, then rolled back every synthetic record. The hosted database has zero test profiles, activities and inbox rows after verification. See `supabase/staging/README.md` for installation history, scope and remaining authenticated application/integration checks.

## Dedicated staging application
API tests have moved to `tests/api/intervals` to keep the Hobby deployment below its function limit. The separate staging Vercel project uses a fixed, validated proxy to the staging `import-review` Edge Function, which performs real Auth verification and keeps managed service credentials in that runtime. A server-controlled synthetic account can exercise the hosted flow without copying production credentials or claiming a live Intervals authorisation. See `supabase/staging/README.md` for scope and the hosted browser test.


## Hosted browser verification
The dedicated staging app is available at https://azur-staging.vercel.app. On functional commit `0efc64638ae2a39a00829697432ad52c76c59338`, the hosted browser passed real sign-in, proxy/API/database writes, one saved 98-point score, idempotent replay and Weekly Review refresh. A background Auth/profile update regression was fixed and covered by the synthetic browser suite. All 151 calculation/API tests and all CI workflows passed. The upstream provider activity was explicitly synthetic; live Intervals OAuth remains a separate release gate. See the staging README for exact deployment/source references.

OAuth staging continuation: Connect and callback now support the isolated staging
backend, with fixed redirect identities, server-owned single-use state and PKCE.
The staging state table is server-only. 161 local tests (101 calculations and 60
API/router/OAuth tests) and the production build pass. The live provider exchange
remains unverified until the staging Intervals client ID/secret are configured
and the athlete completes consent; see the staging README for exact setup.
