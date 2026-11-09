# AZUR Invitation-first Beta: acceptance checklist (2026-11-09)

Test branch: `fix/automatic-intervals-history-on-connect-20261109`  
Backend: **AZUR Staging** Supabase (`juvceqrzkeethontnezw`) only. Never test against production athlete data.

## Prerequisites
- Vercel preview build is READY **after** branch-scoped `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_AZUR_STAGING` variables were supplied.
- Supabase Auth Site URL and Redirect URL allowlist include the exact test deployment origin and `/accept-invitation?invitation=...`.
- Staging has a working `send-coach-invitation` function with an athlete-specific invitation identifier, email service configured and CORS set for the allowed staging site.
- Review RLS/permissions for coach creation and verified athlete acceptance.
- Do not use production provider keys or production athlete data.

## Acceptance checks
1. Fresh invited email opens registration (not an empty screen).
2. Register with invited email and show/hide password; confirmation message appears.
3. Confirmation email returns to the intended staging test domain.
4. Signed-in verified invited athlete automatically accepts the matching unexpired invitation exactly once; no extra button.
5. Mismatched, expired, reused by another user, or missing invitations fail safely with clear errors.
6. Athlete completes race/availability/threshold questions and reaches dashboard.
7. Close and reopen; existing athlete can sign in and continue.
8. Mobile and desktop checks, plus password recovery.
9. Intervals OAuth return automatically performs read-only 90-day analysis and saves coach-review baseline, without changing completed activities or training load.
10. Document actual invitation delivery, acceptance record, onboarding state and browser result before marking complete.

Do not invite the five Mersey Tri beta athletes until every relevant check passes.
