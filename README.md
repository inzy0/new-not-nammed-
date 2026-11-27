# Evidara (working name)

A free platform for healthcare professionals and researchers: **read → verify → cite → create → share**.

**Live site (once GitHub Pages is on):** https://inzy0.github.io/new-not-nammed-/

## What works now (v0.1)

| Part | What it does | Data / tech |
|---|---|---|
| Daily Evidence (home) | Daily Bloom template: today's open-access papers in your domain, in a numbered carousel | Europe PMC |
| Verified feed | 40 healthcare domains, time window, sort by newest or most cited. Every card shows a verification summary. | Europe PMC REST (free, no key) |
| Verification card | Retraction / expression of concern / corrections, preprint vs journal, study design, licence and what it permits, funding, COI and data-availability statements, trial registration ID, citation count. Each check names its source. | Europe PMC record + JATS full text |
| Citation maker | Vancouver, AMA, APA, BibTeX; copy or download `.bib` | From the record |
| Audio overview | **Deep Dive, The Brief, The Critique, The Debate**; Shorter / Default / Longer; 4 voice styles; two hosts. Every content line is read **word for word** from the paper and shows its source section. | Browser speech (free, offline, unlimited) |
| Video abstract | 9:16 video rendered in the browser: title, verbatim finding, verbatim limitation, source. Uses the current theme. Download as WebM. | Canvas + MediaRecorder |
| Studio | 16 image-prompt styles, 12 video formats, 12 hooks and audio concepts, personalised by domain, audience, platform, tone and theme palette. Overclaiming words ("cure", "miracle", "100%"…) are flagged. | Hand-written templates |
| Library | Idea → Made → Scheduled → Posted board; platform and time per item; export the schedule to a calendar (`.ics`); JSON backup and import | Browser storage |
| Evidara ID | `DOMAIN-XXXXXC`, e.g. `CARD-7K3QX4`: domain code, 5 random characters and a check character that catches typos | Crockford base32 |
| People | Researcher search and profiles (papers: most cited / recent, citations per year, h-index, topics, ORCID), marked "unclaimed" | OpenAlex (free, no key) |
| Themes | Bloom, Ink, Pulse, Saffron, Clinic, each with its own font pair | Google Fonts (OFL) |

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
