# AZUR no-history introductory week — staging acceptance

Branch: `fix/automatic-intervals-history-on-connect-20261109`

Test athlete: use the previously onboarded staging account; do not create duplicates.

## Workflow
- Coach Mode → Monitoring → Weekly plan review
- Select athlete under **Introductory week · No recorded history**
- Preview: read-only, no draft/calendar changes; shows RPE-based swim/bike/run session structure
- Save draft: writes weekly_plan_draft, not planned_session
- Add rationale at least 15 characters
- Approve: writes coach decision, not calendar
- Publish complete week: requires explicit action and current coach approval; guarded by assignment, onboarding completeness, no recorded history, current proposal match, weekly capacity, and no existing sessions
- Verify athlete calendar readback and 4h-or-lower session volume

## Negative tests
- Anonymous/non-coach requests blocked
- Unassigned athlete blocked
- Existing recorded history blocked
- Overlapping planned sessions blocked
- Stale/changed draft blocked
- Missing current approval blocked
- Missing coaching rationale blocked
- Publication does not occur on preview/save/approve

No workouts are automatically published by deployment. Production remains unchanged.
