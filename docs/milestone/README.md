# APEX Milestone Submission — Assembly Guide

This folder contains all deliverables for the **Status Update** milestone (PDF + demo video).

## Files

| #   | File                            | Purpose                                                     |
| --- | ------------------------------- | ----------------------------------------------------------- |
| 1   | `01-pdf-sections-a-and-b.md`    | Copy into Word/Docs → Software Standards + Progress Report  |
| 2   | `02-screenshot-capture-list.md` | Step-by-step screenshot checklist with credentials and URLs |
| 3   | `03-demo-video-script.md`       | Word-for-word 5–7 minute narration script                   |
| 4   | `04-architecture-diagram.md`    | Mermaid diagrams for PDF (export as PNG)                    |

## PDF Assembly (7–10 pages)

1. **Title page** — Team names, course, date, “APEX Milestone Status Update”
2. **Section A** — Paste from `01-pdf-sections-a-and-b.md` (Section A)
3. **Insert Figure A-1** — From `04-architecture-diagram.md` (export PNG)
4. **Section B** — Paste from `01-pdf-sections-a-and-b.md` (Section B)
5. **Section C** — 8–10 screenshots per `02-screenshot-capture-list.md` with captions
6. **Insert Figure A-3** — Navigation map (optional A-2, A-4, A-5)
7. **Export** → single PDF

**Estimated page count:** ~9 pages with 10 screenshots + 2 diagrams.

## Video

1. Start dev server: `npm run dev`
2. Follow `03-demo-video-script.md` narration
3. Target 5:40–6:30 minutes
4. Upload per course instructions

## Before Submitting

- [ ] Replace `[Insert team member names]` in PDF text
- [ ] Fill team-specific sections (collaboration, blockers, next steps)
- [ ] Capture all screenshots at consistent resolution
- [ ] Verify eval IDs in `tests/fixtures/e2e-ids.json` still valid
- [ ] Run `npm run test` (158 passing)
- [ ] Record and review demo video audio/video quality
- [ ] Submit PDF + video link by **Sunday 11:59 PM ET**

## Test Credentials (quick reference)

- Password (all seed users): `E2eTest!2026`
- Sailor: `sailor@franklyn.dev`
- Routing eval: `/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5`
