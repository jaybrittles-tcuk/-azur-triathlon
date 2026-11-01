# Persistent coach review — deployment checklist

The SQL in weekly-plan-persistent-review.sql is intentionally not production deployed.
It requires public.coach_athlete_assignment and existing authenticated coach role metadata.
AZUR staging currently lacks coach_athlete_assignment (as of 1 Nov 2026), so the
authorization dependency must be brought across and verified *before* applying this schema.

1. Sync staging assignment schema and policies safely, not athlete data.
2. Apply the review schema to staging and verify anon, athlete, assigned coach
   and unassigned coach SELECT/INSERT privileges (RLS on both tables).
3. Add authenticated coach UI that drafts a real individual week, computes a canonical
   SHA-256 content fingerprint, and inserts a new immutable revision on edits.
4. Approval must be of the specific latest draft revision; the latest decision wins.
5. The service-side publisher must independently re-read current approvals,
   assigned-coach identity, and recompute the content fingerprint in the same
   transaction as publication. Existing staging publisher does NOT yet do this.
6. Test revocation, stale approval, concurrency, wrong athlete and duplicate
   publication before any production install or Sunday trigger.

No currently installed routine creates sessions for missing weeks. Do not
show a successful Sunday-scheduler message until a real end-to-end run passes.
