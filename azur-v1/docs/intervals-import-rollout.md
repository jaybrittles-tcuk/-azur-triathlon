# Intervals.icu import staging — rollout gate

## Current status
The migration `20261030_intervals_import_inbox.sql` is STAGED in GitHub only.
Do not deploy/apply until transactional tests and an authenticated server handler are in place.
No automatic activity ingestion is enabled.

## Security contract
1. Only the service role can call `stage_intervals_activity`. Never expose that key in Vite/browser.
2. A future API must authenticate the AZUR user; resolve athlete_id from that user and not request input; re-fetch the activity through the athlete's Intervals token and verify ID.
3. Require fresh explicit consent for a manual stage; automated webhook ingestion requires separately approved opt-in and provenance controls.
4. Never accept arbitrary source_payload from a client. Build it on the server using authorised upstream results.
5. After staging, do not modify `completed_activity`, `planned_session` or the fitness/fatigue/form calculations. Separate review, acceptance and stress eligibility are future tasks.

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
