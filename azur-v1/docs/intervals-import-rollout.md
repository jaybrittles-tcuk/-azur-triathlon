# Intervals.icu import staging — rollout gate

## Current status
The migration `20261030_intervals_import_inbox.sql` is STAGED in GitHub only.
Authenticated staging and acceptance handlers are implemented behind separate server release flags. Do not deploy/apply until the remaining release checks pass.
No automatic activity ingestion is enabled.

## Security contract
1. Only the service role can call `stage_intervals_activity`. Never expose that key in Vite/browser.
2. A future API must authenticate the AZUR user; resolve athlete_id from that user and not request input; re-fetch the activity through the athlete's Intervals token and verify ID.
3. Require fresh explicit consent for a manual stage; automated webhook ingestion requires separately approved opt-in and provenance controls.
4. Never accept arbitrary source_payload from a client. Build it on the server using authorised upstream results.
5. After staging, do not modify `completed_activity`, `planned_session` or the fitness/fatigue/form calculations. Acceptance is a separate explicit action which creates one completed record with load_status=pending_validation; it still does not link or complete a planned session. Stress validation remains a future step.

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
- Local verification: 96 calculation tests, 11 mocked API tests, Vite production build, and fixture/migration/transaction/RLS SQL tests in embedded PostgreSQL (PGlite).
- Independent-connection concurrency checks are implemented in CI but have not been executed locally; PGlite verification does not establish that guarantee.
- Still required: live authenticated staging QA, real PostgreSQL concurrency results, complete browser workflow, and a separate validated training-load approval path with exactly-once credit.
