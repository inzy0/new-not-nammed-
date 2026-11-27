# Evidara (working name)

A free platform for healthcare professionals and researchers: **read → verify → cite → create → share**.

**Live site (once GitHub Pages is on):** https://inzy0.github.io/new-not-nammed-/

## What works now (v0.2)

Layout: alphaXiv-style wide layout. Sidebar, live feed and a right-hand rail on desktop and laptop; bottom tabs on phones.

| Part | What it does | Data / tech |
|---|---|---|
| Explore (live feed) | Search across millions of open-access papers. **For you** (your domain feeds), **Trending** (most cited, last 90 days), **Latest** (all). Filters for study design, time window and preprints. Infinite scroll, a "new papers" alert every 3 minutes, and each paper's own figure on its card. Daily Bloom hero carousel. | Europe PMC REST, PMC Open Access archive |
| Paper page | **Overview** (abstract, podcast, video abstract, key figures, related papers) · **Read paper** (full text with contents and inline figures, PDF) · **Figures** (every figure with the authors' caption) · **Author statements** (limitations, contributions, funding, COI, data availability, ethics, affiliations, and a slot for author video/image/audio) · **Discuss** (chat-style thread to the authors: question / issue / unresolved gap / comment, with replies and a patient-identifier block) | Europe PMC JATS full text, OpenAlex |
| Verification card | Retraction / expression of concern / corrections, preprint vs journal, study design, licence and what it permits, funding, COI and data-availability statements, registration ID, citations | Europe PMC |
| Podcasts | Spotify-style player that keeps playing while you browse: cover, play/pause, ±15 s, next/previous, seek, speed, queue, phone lock-screen controls. Transcript hidden unless you open it. Formats: **Deep Dive, The Brief, The Critique, The Debate** in three lengths. Every spoken content line is the paper's own sentence. | Browser speech (free, offline) |
| Reels | Vertical swipe feed. Each reel is animated from the paper: title, figure with the authors' caption, a verbatim finding, a verbatim limitation, the citation. Like, listen, save, share, discuss. | Same sources |
| Citations | Vancouver, AMA, APA, BibTeX | From the record |
| Video abstract | 9:16 WebM rendered in the browser, downloadable | Canvas + MediaRecorder |
| Studio | 16 image styles, 12 video formats, 12 hooks and audio concepts, personalised by domain, audience, platform, tone and theme. Overclaiming words are flagged. | Hand-written templates |
| Library | Idea → Made → Scheduled → Posted, with calendar (.ics) and JSON backup | Browser storage |
| Evidara ID | `DOMAIN-XXXXXC`, e.g. `CARD-7K3QX4`, with a typo-catching check character | Crockford base32 + Luhn mod 32 |
| Researchers | Search and profiles (most cited / recent, citations per year, topics, ORCID), marked "unclaimed"; follow authors from your feed | OpenAlex |
| Themes | Bloom, Ink, Pulse, Saffron, Clinic | Google Fonts (OFL) |

**Not live yet (needs the free cloud backend, see roadmap):** shared discussion between users (messages stay on your
device until sign-in), authors posting their own media, built-in image generation, MP3 download, reserved IDs.

## Rules the platform keeps

- **No patient data, ever.**
- **No invented content about papers.** Audio and video use the paper's own sentences. Fixed signpost lines carry no claims.
- **Licence decides reuse.** Audio and video are made only when the article licence permits adaptations (CC BY, CC0, or BY-NC on this non-commercial site). ND and unlicensed articles are read-and-cite only.
- **A passed check means the record shows it, not that the findings are right.**
- AI-generated images are labelled as illustrations, and the prompts forbid real patients and written claims.

## Run locally

Any static file server works, for example:

```
python -m http.server 5131
```

Then open http://127.0.0.1:5131/.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## Credits

Data: [Europe PMC](https://europepmc.org) and [OpenAlex](https://openalex.org). Each article's own licence applies to its text and figures.
