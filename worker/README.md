# Evidara AI Worker

Free AI illustrations for studies: Cloudflare Workers AI running **FLUX.1 schnell**.

- **Model licence:** the Hugging Face model card for FLUX.1 schnell says Apache-2.0, including commercial use. Cloudflare's model page links Black Forest Labs' terms of service; read those before launch.
- **Free allowance:** Workers AI includes 10,000 neurons per day, resetting at 00:00 UTC (05:30 IST). The Worker caps images per browser, per network and site-wide (see `wrangler.toml`).
- **No video model:** Workers AI has no video model as of 2026-11-27. Evidara builds its videos from these illustrations plus the paper's own figures.

## Deploy (about 10 minutes, free)

1. Create a free Cloudflare account. Install Node.js, then run `npm i -g wrangler` and `wrangler login`.
2. In this folder, run `wrangler d1 create evidara-ai`, then paste the printed `database_id` into `wrangler.toml`.
3. Run `wrangler d1 execute evidara-ai --remote --file=schema.sql`.
4. Run `wrangler deploy`, then copy the URL it prints (`https://evidara-ai.<you>.workers.dev`).
5. In the site's `js/config.js`, set `aiWorkerUrl` to that URL, then commit. The "Generate AI illustration" buttons switch on.

## Safety

- Only the origins listed in `ALLOWED_ORIGINS` can call the Worker.
- Prompts are built by the site from the paper's topic and study type. They always forbid text, numbers, faces and patients.
- The Worker also blocks unsafe words.
- Images are labelled "AI illustration, not from the paper" everywhere they appear.
