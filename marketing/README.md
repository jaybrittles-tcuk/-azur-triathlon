# AZUR marketing website

Standalone React/Vite marketing site isolated from the existing athlete app in `azur-v1/`.

## Local setup

```sh
cd marketing
npm install
npm run dev
npm run build
```

## Deployment

Create a **new** Vercel project linked to this repository. Set Root Directory to `marketing`, Framework to Vite, Build Command to `npm run build`, Output Directory to `dist`. Do not alter the existing `azur-triathlon` or `azur-staging` projects.

## Launch checks

- Replace illustrative dashboard with approved real app screenshots.
- Confirm real contact email and beta enrolment process before publishing.
- Review marketing claims and integration availability.
- Confirm official AZUR logo asset and brand guidelines.
- Test mobile, keyboard navigation, SEO and analytics.
- Approve domain cutover separately; preserve app authentication callbacks.

This branch is intentionally not production-ready. No Supabase credentials or app secrets are required.
