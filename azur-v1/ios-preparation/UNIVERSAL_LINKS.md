# Apple Universal Links release procedure (not yet active)

The `apple-app-site-association.template.json` is a preparation file, **not** a deployed association. It intentionally contains a placeholder team ID.

1. Enrol in Apple Developer Program and confirm the final Bundle ID and Apple Team ID.
2. Replace `TEAM_ID_PLACEHOLDER` with the verified 10-character Team ID.
3. Serve the validated JSON **without .json extension** at `https://azur-triathlon.vercel.app/.well-known/apple-app-site-association` with application/json content type, over HTTPS, without redirects.
4. Add the `applinks:azur-triathlon.vercel.app` Associated Domains entitlement to the actual native Xcode target.
5. Install/reinstall on a physical iPhone, test Garmin/Intervals completion and onboarding links. Confirm unrelated links, callback code/token URLs and malicious hosts don't open AZUR.
6. Do not enable native production distribution until Supabase session handling and external browser callbacks pass end-to-end device tests.

**Security:** Provider callbacks remain on Vercel. Only a success indicator is eligible to open the app; OAuth codes and provider tokens must never be forwarded in links.

**Note:** Apple may require association JSON adjustments after validating against the actual Apple Team ID and device. No association file is published from this branch.
