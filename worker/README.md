# Evidara backend (API)

One Cloudflare Worker on the **free plan**. It provides:

- **Accounts:** Google sign-in (the ID token is checked with Google and must match your client ID), sessions, and roles (member, verified member, admin).
- **Profiles:** unique Evidara IDs, issued and kept unique by the server.
- **Verification:** requests with private proof documents that only admins can open, and an admin approve/reject flow.
- **Publishing:** submit, admin review, publish. The Evidara track gets `EVD-YYYY-NNNNN` Article IDs. Images move to file storage.
- **Discussion threads:** anyone can read; verified members can post; replies supported; patient-identifier screen on the server.
- **Social:** likes with counts and a "Top liked" list, follows, and library sync across devices.
- **Shared videos per article:** verified uploaders, streamed with range requests, up to 95 MB each.
- **AI illustrations:** FLUX.1 schnell on Workers AI, with per-user, per-network and site-wide daily limits.

| Resource | Cloudflare product | Free allowance (checked 2026-11-27) |
|---|---|---|
| API | Workers | 100,000 requests/day |
| Database | D1 | 5 GB, 5M rows read/day, 100k rows written/day |
| Files (images, videos, documents) | R2 | 10 GB-month, free egress |
| AI images | Workers AI | 10,000 neurons/day |

## Tested

- `api_test.mjs` drives every endpoint on Cloudflare's local runtime (wrangler 4.20.0): 60/60 pass.
- A full browser test runs the real site against the local backend: sign-in, server ID, verification with a document, admin approval, publishing a completed study through the form, Article ID, discussion, likes and Top liked, shared video upload, AI images, library sync, and an anonymous visitor seeing the published study in the feed, reels, podcasts and People.

## Go live (about 20 minutes, free)

You need: a free Cloudflare account, a Google Cloud project (free) and Node.js.

1. **Google sign-in client.** In Google Cloud Console → APIs & Services → Credentials, create an *OAuth client ID* of type *Web application*. Under *Authorised JavaScript origins*, add `https://inzy0.github.io`. Copy the client ID.
2. **Cloudflare.** Run `npm i -g wrangler`, then `wrangler login`. In this `worker/` folder:
   ```
   wrangler d1 create evidara              # paste the printed database_id into wrangler.toml
   wrangler r2 bucket create evidara-files
   wrangler d1 execute evidara --remote --file=schema.sql
   wrangler secret put ADMIN_EMAILS        # your admin email(s), comma-separated
   ```
   In `wrangler.toml`, set `GOOGLE_CLIENT_ID` to the client ID from step 1.
3. **Deploy:** run `wrangler deploy`. It prints the API URL, e.g. `https://evidara-api.<you>.workers.dev`.
4. **Connect the site.** In `js/config.js`, set `apiUrl` to that URL and `googleClientId` to the client ID, then commit. The site switches to live mode, with accounts, verification, shared discussion, likes, videos and AI for everyone.
5. Sign in with your admin email. The **Admin portal** opens with live counts.

## Notes

- `DEV_LOGIN` and `MOCK_AI` are for local testing only. Never set them in production.
- Admin emails are a secret, so they never appear in the public repository.
- Before launch, read Black Forest Labs' terms for FLUX.1 schnell, which Cloudflare links from its model page.
- Moderation: admins can delete any comment or video. Rejected posts go back to the author with your note.
