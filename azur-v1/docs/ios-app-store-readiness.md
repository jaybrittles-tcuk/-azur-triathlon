# AZUR iOS App Store readiness

## Recommended release
1. Add Capacitor to existing React/Vite application; use native iOS project with Xcode.
2. Audit all relative /api endpoint calls: native WKWebView cannot reach Vercel via relative origin by default.
3. Configure native OAuth deep links for Supabase email verification, Garmin and Intervals.icu.
4. Test safe areas, keyboard, maps, workout import, file selection, logout and re-entry on physical iPhone.
5. Publish first to five Mersey Tri testers via TestFlight, then App Store after review.

## Apple checklist
- Apple Developer Program membership: individual or organisation (legal entity and D-U-N-S for organisation).
- App identifier, company ownership, signing certificates, icons, screenshots, support URL.
- Privacy policy and App Store fitness/health data disclosure.
- Account deletion initiated within app, backed by secure deletion and retention process.
- Reviewer demo account with synthetic data and clear description of integrations.
- Review coaching/subscription purchase flows against up-to-date UK Apple rules.
- Native feel, no dead buttons or unfinished features.

## Blockers
- Mac/Xcode iOS build not produced.
- Backend relative API calls and auth deep links not yet native-safe.
- Account deletion and privacy compliance not yet verified.
- Apple Developer membership and app records not yet confirmed.

## References
https://capacitorjs.com/docs/getting-started
https://developer.apple.com/programs/enroll/
https://developer.apple.com/app-store/review/guidelines/
https://developer.apple.com/support/offering-account-deletion-in-your-app/
https://developer.apple.com/testflight/