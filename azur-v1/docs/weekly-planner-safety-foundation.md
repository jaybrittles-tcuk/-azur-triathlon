# Automatic Weekly Planner — safety foundation (not an active scheduler)

## Confirmed production gap — 1 Nov 2026
A read-only production query found **zero** active planned sessions dated 2–8 November 2026. Calendar loading selects active rows from `planned_session`; refreshing the app cannot create them.

## Required production behaviour
1. Every Thursday generate a proposed next Monday–Sunday week per eligible athlete from the real coach-approved workout library, race phase, availability, recent completed training and athlete feedback.
2. Before publishing, check profile completeness, real race and phase information, session prescription completeness (including repetitions/rest/targets), high-risk changes and coach-review state.
3. Publish approved plans by Sunday 18:00 Europe/London, using a server-side scheduled job independent of an open browser.
4. A publication must create or reuse `season_week` and insert the required `planned_session` rows in a transaction with per-athlete/week uniqueness or advisory locking. Never silently replace existing, locked or previously completed sessions.
5. Retry transient failures, persist status and reason, alert the coach, and clearly mark unready weeks. Do **not** label an empty calendar a recovery week.
6. Verify in database and as an authenticated athlete that Monday–Sunday sessions load; validate a real athlete with no planned sessions, partial plan, missing profile, coach-approval pending, duplicate schedule trigger and timezone/DST boundary.

## What is implemented in this PR
Pure week-readiness and publication-eligibility checks in `weeklyPlanSafety.ts`. These **do not generate sessions**, install an automated job, notify a coach, or modify production data. The rules intentionally block generation when a plan is unapproved or active sessions already exist.

## Still needed before switching on Sunday automation
An actual generator using approved session templates and structured workouts; persisted draft/review states; secure service-side transactional publisher; robust auth and RLS; scheduling and retries; monitoring and end-to-end tests. Do not deploy an empty or generic session filler.
