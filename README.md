# Meta Ads Report

A Vercel-ready, public reporting portal for approved Meta campaigns. Meta credentials stay on the server; the browser never receives the access token.

## Run locally

1. Copy `.env.example` to `.env.local` and set every required value.
2. Run `npm install` and then `npm run dev`.
3. Open `http://localhost:3000/?campaign=YOUR_APPROVED_CAMPAIGN_ID&range=14d`.

## Deploy to Vercel

Import this folder into Vercel, then add these Environment Variables for Production (and Preview if required):

| Variable | Purpose |
| --- | --- |
| `META_ACCESS_TOKEN` | Meta system-user access token with insight access. |
| `META_AD_ACCOUNT_ID` | Connected account in `act_123456789` format. Any campaign in this account may be viewed by ID. |
| `ADMIN_API_KEY` | Long random secret for the Admin health check. |
| `META_API_VERSION` | Optional; defaults to `v22.0`. |
| `REPORT_CACHE_TTL_SECONDS` | Optional; defaults to 300 seconds. |

Do not use `NEXT_PUBLIC_` for any of these values. Rotate a Meta token immediately if it is ever committed, pasted into a frontend field, browser console, URL, or screenshot.

## Operational notes

- The report endpoint accepts any valid campaign ID belonging to `META_AD_ACCOUNT_ID`, and rejects IDs from other accounts. Since reports are public by design, campaign IDs should only be shared with intended clients.
- Cache is process-local and HTTP responses can be cached at Vercel’s edge. For shared, reliable cross-instance cache invalidation, replace the in-memory `Map` with Vercel KV/Redis.
- Dashboard configuration is environment-based on purpose. Editing production tokens or access lists should happen in Vercel, not in a client-visible web form.
