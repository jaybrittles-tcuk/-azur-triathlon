# Intervals.icu import staging — rollout gate

## Current status
The migration `20261030_intervals_import_inbox.sql` is STAGED in GitHub only.
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
- The acceptance migration is still unapplied. Its development signature now includes `p_confirm boolean default false`; recheck migration history before deployment.
- Local verification: 101 calculation tests, 23 mocked API tests, full Vite production build with placeholder configuration, and fixture/migration/transaction/RLS SQL tests in embedded PostgreSQL (PGlite).
- Independent-connection concurrency checks are implemented in CI but have not been executed locally; PGlite verification does not establish that guarantee.
- Still required: live authenticated staging QA, real PostgreSQL concurrency results, complete browser workflow, and verification of the separately gated training-load approval path.


## Training-load approval (development only)
- `INTERVALS_LOAD_VALIDATION_ENABLED=true` exposes recorded rides and the explicit training-load approval action; it defaults to disabled.
- Apply `20261030141058_intervals_validate_load.sql` after BOTH existing staging and acceptance migrations. Do not rely on lexical ordering of the older nonstandard development filenames. These migrations remain unapplied to production.
- The server resolves ownership from the verified athlete session. The transaction requires a reviewed inbox record matching the accepted activity, positive finite normalised power and current athlete FTP, and no overlapping recorded bike ride.
- Approval updates the existing activity with canonical normalised power, FTP snapshot, calculated stress, intensity factor, version and approval timestamp. Repeated approval returns the saved score without rewriting it or creating another activity.
- The dashboard consumes that saved Intervals score; a later FTP change does not recalculate it. Recorded rides load even when there are no planned sessions, and leaving Data Sources after an import/approval refreshes dashboard activities.
- Five additional score-consumption tests and 12 approval-handler tests cover missing validation, malformed scores, athlete ownership, disabled flags, consent and replay. Database tests cover missing FTP/NP, late duplicates, test exclusion, immutable replay and role permissions.
- The full build is now checked with harmless Supabase configuration placeholders: a build without these can optimise away app code after the missing-configuration throw.
- Remaining release work: live authenticated/browser QA, independent-connection PostgreSQL concurrency results, deployed-schema/permission review, and reconciling this draft branch with main. Saved-score idempotence does not prove concurrency across every external ingestion provider.
