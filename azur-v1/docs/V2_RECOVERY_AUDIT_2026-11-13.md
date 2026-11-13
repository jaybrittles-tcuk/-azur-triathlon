# AZUR V2 recovery — verified repository audit (13 Nov 2026)

## Ground truth
- Current staging ancestry: `feature/azur-v2-scheduling-preferences-20261112`, 110 commits ahead of `main`.
- This recovery branch was cut from staging, not production. Do not merge to production before mobile and athlete-flow checks.
- `feature/azur-v10-3-premium-workouts` diverged from staging (15 commits unique to premium branch, 110 unique to staging). **Do not reset staging to that branch.**
- `feature/calendar-v2-premium-consolidated` also diverged (7 unique commits on premium calendar branch).
- `dev/white-athlete-dashboard` is an ancestor of staging, so the white dashboard look is inherited, not a missing deployment.
- The current `HomeView` in `src/app/App.tsx` renders `<AthleteDashboard />` and then a large legacy `<details className="awd-advanced">` containing Training Tools, season roadmap, previews, baseline and other light-themed panels. This explains the mixed premium/legacy Home screenshot.
- Staging already includes `PremiumWorkoutTabs.tsx`, `WorkoutTargetDetails.tsx`, `CalendarIntensityProfile.tsx`; the premium-workout branch has newer variants, including `WorkoutRpePicker.tsx` and `premiumWorkoutV103.css`. Evaluate component-level integration, not branch replacement.

## Recovery order
1. **Preserve** current auth/onboarding fixes and coach review safety; don't break device access for review-pending athletes.
2. **Home:** move legacy Training Tools / baseline / season preview from Home into an appropriate settings area, keeping access to all features; use the existing `AthleteDashboard` as the sole Home surface.
3. **Workout:** compare premium workout branch components with current staging; bring over complete compatible component set and test structured interval / completion rendering.
4. **Calendar:** review the seven unique calendar commits for compatible changes, without replacing current planner safeguards.
5. **VIPA:** map onboarding + 90-day imported activity history + validation states to the existing foundation generator; separate safe automatic prescription from coach-required publication. Never treat available hours as prescribed hours, or pending/rejected imports as completed history.
6. **Verification:** build, test invitation-to-onboarding-to-device-to-calendar, test mobile Safari, and confirm production remains unchanged.

## Explicit release gates
- No blank screen or redirect loop.
- Original approved AZUR logo preserved.
- No empty calendar presented as a completed plan.
- Review-pending athlete can connect devices but cannot publish unapproved sessions.
- One coherent premium navy UI, no inherited white panels on Home.
- No claim of VIPA end-to-end success without data-backed test.
