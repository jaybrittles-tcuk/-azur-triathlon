# Azur Triathlon Coaching — v1 Implementation Starter

This is the first working implementation slice of the Azur personal triathlon performance app.

## Included now

- Branded Azur desktop shell using the approved Azur logo
- Working Home → Calendar navigation
- Shared in-memory week/session state
- Week-level plan versioning
- Session-level versioning
- Session locking / unlocking
- Week locking control
- Working session editor for title, duration, priority, terrain, target and rationale
- Original session identity retained through `parentSessionId`
- Visible recent-change log
- Home dashboard reads the same live weekly state as the Calendar
- Existing calculation modules for Race Readiness, Recovery and Session Execution
- PostgreSQL-oriented schema for persistent storage

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite address shown in the terminal.

## Important architecture principle

The annual master plan is a reference version. Editing a session creates a new working version rather than overwriting the original. This is the basis for:

`Original plan → user-edited plan → completed session`

and supports later weekly-review recommendations with explicit Accept / Reject history.

## Next implementation slice

1. Replace in-memory week/session state with persistent repository storage.
2. Connect Training Load, Recovery and Race Readiness calculations to stored records.
3. Add FIT/TCX/GPX/CSV ingestion and planned-session matching.
4. Add Weekly Review and approved-plan regeneration against persistent versions.
5. Add Garmin API adapter when credentials/access are available.

## Deploy as an installable web app (PWA)

This starter now includes:
- `public/manifest.webmanifest`
- `public/sw.js` service worker
- Azur 192px / 512px / Apple touch icons
- `vercel.json`
- `netlify.toml`

### Vercel
1. Push this folder to a GitHub repository, or import the folder directly in Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build`.
4. Output directory: `dist`.

### Netlify
1. Import the repository or drag in the built `dist` folder.
2. Build command: `npm run build`.
3. Publish directory: `dist`.

### Install on iPhone
Once deployed over HTTPS, open the site in Safari → Share → **Add to Home Screen**.
The app will use the Azur icon and launch in standalone mode.
