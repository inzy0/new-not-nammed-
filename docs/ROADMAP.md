# Roadmap

Each step ends with a check whose result is reported as measured.

## Done: v0.1 (static, free, no accounts)
Feed, verification card, citations, verbatim audio overviews, browser video abstracts, prompt studio, content library
with schedule export, Evidara IDs (local preview), researcher profiles, 5 theme templates.

## Next: v0.2, the free cloud backend
Target: Cloudflare (free plan). Checked 2026-11-27 on Cloudflare's pricing pages:
- Workers: 100,000 requests/day; static assets free.
- D1 database: 5 GB, 5M rows read/day, 100k rows written/day.
- R2 storage: 10 GB/month, free egress.
- Workers AI: 10,000 "neurons"/day, resetting at 00:00 UTC. FLUX.1-schnell image ≈ 4.8 neurons per 512×512 tile;
  MeloTTS ≈ 18.6 neurons per audio minute. Per-model licences are still to be checked before switching any model on.

What it adds:
1. **Accounts:** Google sign-in, credential upload, admin verification. Members only beyond the public pages.
2. **Evidara IDs reserved server-side** (unique), with a directory searchable by domain code.
3. **Per-person daily limits** (image / video / audio), refreshing at 05:30 IST.
4. **Built-in image generation** from Studio prompts (labelled "AI illustration").
5. **Downloadable MP3 audio** (cloud voices) and narrated video abstracts.
6. **Library in the database**, with files in R2.
7. **Community:** specialty groups, journal-club rooms tied to a paper, questions that turn into PICO searches with an
   evidence list attached, citation badges on posts, retraction alerts, a preprint review club, and community notes
   shown only after a second verified member agrees.
8. **Claiming researcher profiles** via ORCID sign-in.

## Later
- Paper figures (CC BY) in video abstracts.
- Reference-list checker: paste references, and fabricated or retracted ones are flagged.
- Journal-club handout / evidence table export (DOCX/PDF).
- Indian-language audio (needs a translation step that has passed a quality check).
- Browser extension that shows the verification card on journal sites.
- Posting to social platforms (needs each member's own platform accounts).

## Not planned
- Patient records or patient images.
- AI-written summaries presented as the paper's content.
