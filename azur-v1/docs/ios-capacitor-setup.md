# AZUR iPhone beta foundation

Capacitor v8 configuration now exists on this branch only. No production changes.

## Prepare an iOS project on a Mac
1. Install Node supported by current Capacitor v8 and current Xcode.
2. In `azur-v1`, run `npm install` and `npm run build`.
3. Run `npx cap add ios` once to generate the native iOS project.
4. Run `npm run ios:sync` after subsequent web changes and `npm run ios:open` to use Xcode.
5. Use a personal development team in Xcode for local device tests; Apple Developer Program is needed for TestFlight distribution.

## Release blockers — do not submit to Apple yet
- **API origins:** The existing React app uses browser-relative `/api/...` endpoints against Vercel. In Capacitor these refer to a local webview, *not* the deployed Vercel server. Implement an explicit HTTPS API base URL for native only; verify auth headers, CORS and every request path.
- **Auth redirects:** Supabase sign-in, email verification and Intervals/Garmin OAuth redirect routes are designed for a browser URL. Register a supported iOS universal-link or callback scheme and audit return-to-app flow.
- **Bundle identifier:** `com.azurtriathlon.training` is a development placeholder. Confirm legal ownership and bundle ID availability before registering in App Store Connect.
- **Runtime experience:** Test first-run, onboarding, charts, safe areas, file uploads, keyboard, errors and navigation on a physical iPhone.
- **Compliance:** Privacy policy, fitness/health data declarations, account deletion inside app, reviewer demo account, app icon, screenshots, subscriptions/purchase review.
- **Security:** Never include Supabase service-role keys or Intervals client secrets inside iOS bundle. Reuse the server API.

## Important
The presence of `capacitor.config.ts` and dependencies is the first preparatory milestone. There is not yet a generated Xcode project, a signed app, an IPA, or a TestFlight build.

References: https://capacitorjs.com/docs/getting-started and https://capacitorjs.com/docs/ios

## Native API routing (foundation added)
- App calls to Garmin/Intervals now use `azurApiUrl()`. Browser calls remain same-origin.
- Native builds require build-time `VITE_AZUR_API_ORIGIN=https://azur-triathlon.vercel.app` (public API origin only, never secrets).
- CORS / native WKWebView security, endpoint reachability, and OAuth return callbacks still require physical-device verification. Do not switch production to native mode yet.
