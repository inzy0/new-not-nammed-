# Evidara (working name)

A free platform for healthcare professionals and researchers: **read → verify → cite → create → publish → discuss**.

**Live site:** https://inzy0.github.io/new-not-nammed-/

## What works now (v0.5)

| Part | What it does |
|---|---|
| **Explore** | alphaXiv-style live feed with Instagram-style domain "stories" and reel strips between posts. Feeds: **For you · All fields · Trending · Must-read · Underrated gems · Preprints · India focus · Liked · Community**, each stating how it is built. **Paper of the day** (one high-evidence open-access paper per day). Infinite scroll, a new-papers alert, search across 8+ million open-access papers. |
| **Paper page** | Overview (abstract, **audio track**, **video player**, **your own videos** (upload as many as you like), key figures, related papers) · **Read paper** (full text with contents and figures; a legal free copy via OpenAlex when Europe PMC has none) · Figures · Author statements · Discuss |
| **Audio** | Spotify-style player that keeps playing across pages. Four types: **Short, Briefing, Long, Customised** (choose sections and depth). No scripts on screen; every spoken line is the paper's own sentence. |
| **Video player** | Play/pause, slides scrubber, speed, narration on/off, captions, 16:9 ↔ 9:16, fullscreen, keyboard shortcuts, WebM download |
| **Reels** | Vertical swipe feed animated from each paper's title, figure, finding, limitation and citation |
| **Studio · Notebook** | NotebookLM-style: add PDFs, text, Markdown, a paper or pasted text → **one audio track, one video and images** (quote cards and page images). Runs in your browser; nothing is uploaded. Documents with patient identifiers are refused. |
| **Publish** | Type, title, keywords, structured abstract, full paper sections, images and videos, conclusion and discussion, a clearly labelled personal view and suggestions, references (every DOI checked for existence and retraction), authors with Evidara ID / ORCID (check digit verified) / affiliation / CRediT roles, and declarations (ethics, consent, registration format check, reporting guideline, funding, COI, data, AI use, originality, image rights). A live verification report with a completeness score. |
| **Admin portal** | Passphrase-protected on the admin's device. Import member verification requests and submissions, check IDs, ORCIDs and documents, approve, then export `members.json` / `posts.json` to publish to everyone. |
| **People** | Auto-listed: verified members, plus top researchers in your field (OpenAlex), worldwide or India. Follow anyone. Search and ID lookup stay available. |
| **Verification card** | Retraction, corrections, preprint or journal, study design, licence, funding, COI, data availability, registration |
| **Study visuals** | Every paper gets an **Evidara design cover**, drawn in the browser from its title and study type (trial, synthesis, cohort, case, guideline, review, lab, preprint). It is free, instant and used in the feed, reels and video. The **Visuals** gallery on each paper shows AI illustrations first (labelled "AI illustration, not from the paper"), then the design cover, then the article's **official figures**. AI prompts are built from the title, MeSH terms and keywords plus a style for the study type, and always forbid text, numbers, faces and patients. Any image can be set as the paper's cover. |
| **AI image service** | `worker/`: a Cloudflare Worker running **FLUX.1 schnell** on Workers AI (free daily allowance) with per-person, per-network and site-wide daily limits (D1), an origin allow-list and a safety screen. Deploy it and set `aiWorkerUrl` in `js/config.js` (see `worker/README.md`). Workers AI has no video model, so videos animate the illustrations and figures with narration. |
| **Map** | **Universe**: every domain is a planet (size = new open-access papers in 30 days, live). Click to land on **Earth**: institutions publishing in that domain at their real coordinates (OpenAlex), zoom to street level; each place shows its people, studies and collaboration lines. **Articles**: every author institution of one study, connected. |
| **Publish with us** | A completed-studies-only track: pathway (prepare, submit, screening, verification, review, decision, release), stricter checks, an **Evidara Article ID** (EVD-YYYY-NNNNN) on approval, and the article goes into feeds, Reels and Podcasts with its own audio and video. Authors keep copyright (CC BY or CC BY-NC). DOIs and indexing are not offered yet. |
| **NotebookLM bridge** | From the Studio notebook: send sources to your own Google Drive (when Google sign-in is configured) or download a NotebookLM pack; open NotebookLM; import the Audio/Video Overview back into your Library as "Ready to push". |
| **Library** | Idea → Made → **Ready to push** → Scheduled → **Pushed to Evidara**. Destinations are Evidara's own formats (Reel, Feed post, Video, Podcast, Community article); "Push to Evidara" opens a prefilled Publish draft. |
| **Design** | Frosted glass, 3D tilt with light glare, a sliding segment indicator, spring motion, a moving background, a welcome screen to pick your fields, and an About page |
| **Also** | Citations (Vancouver/AMA/APA/BibTeX), Library with schedule and calendar export, Evidara IDs (`CARD-7K3QX7` style, typo-catching check character), 5 theme templates, a moving background, page transitions and scroll animations (off when the device asks for reduced motion) |

## How publishing works on a free static site

Members send a **verification request** (from Profile) or a **submission package** (from Publish) to the admin
privately. The admin reviews it in the Admin portal and exports `data/members.json` and `data/posts.json`, which are
committed to this repository. Only repository access can publish. Documents and registration numbers are never exported.

## Rules the platform keeps

- **No patient data, ever.** Every text path is screened. The screen is a safety net, not a guarantee.
- **No invented content about papers.** Audio, video and reels use the paper's own sentences and figures.
- **Licence decides reuse.** Adaptations are made only when the article licence allows them.
- **A passed check means the record shows it, not that the findings are right.**

## Run locally

`python -m http.server 5131` in this folder, then open http://127.0.0.1:5131/.

## Credits

Data: [Europe PMC](https://europepmc.org), [OpenAlex](https://openalex.org) and the PMC Open Access archive (AWS Open Data). PDF reading: [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0, in `vendor/`). Maps: [Leaflet](https://leafletjs.com) (BSD-2-Clause, in `vendor/`) with © OpenStreetMap contributors tiles; institution data © OpenAlex (CC0). Fonts: Google Fonts (OFL). Each article's own licence applies to its text and figures.
