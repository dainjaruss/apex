# APEX Milestone 5 Demonstration: Production & Voiceover Script

**Document Version:** 2.0.0 (Milestone 5 Rubric-Aligned Edition)
**Final Duration:** 7 minutes 50 seconds (rubric window: 6–8 minutes) — segment lengths are now driven by the recorded narration (`artifacts/demo-videos/voiceover/*.wav`); the generator trims each video clip to its narration + 2 s.
**Reading Speed:** ~140 words per minute (professional / instructional pace)
**Editing Platform:** Kdenlive (Linux workstation)

---

## 1. Rubric Coverage Map

The Milestone 5 rubric requires the demonstration video to include six elements. Each maps to a specific segment:

| Rubric requirement                             | Segment               | Timecode (as built) |
| :--------------------------------------------- | :-------------------- | :------------------ |
| Walkthrough of the current application         | Scenes 1–6 (live app) | 0:39 – 5:08         |
| Demonstration of features currently working    | Scenes 1–6 (live app) | 0:39 – 5:08         |
| Progress made since the previous milestone     | Slide 2               | 5:08 – 5:54         |
| Discussion of partially completed features     | Slide 3               | 5:54 – 6:23         |
| Issues or blockers being experienced           | Slide 4               | 6:23 – 7:18         |
| Next development steps before final submission | Slide 5               | 7:18 – 7:50         |

---

## 2. Voiceover Delivery Guidelines

- **Tone:** clear, direct, first-person progress report — you are a developer demonstrating your own milestone work, not narrating a commercial.
- **Pacing:** ~140 wpm with `[PAUSE 1s]` at marked transitions.
- **Pronunciation:** APEX (_AY-pecks_) · NAVPERS 1616/26 (_NAV-pers sixteen-sixteen twenty-six_) · BUPERSINST (_BYOO-pers-inst_) · EP/MP/P (_Early Promote / Must Promote / Promotable_).
- **Audio:** normalize voiceover to −16 LUFS on A1; optional music bed on A2 at −16 dB, ducked to −25 dB under speech.

---

## 3. Word-for-Word Script

Clip durations below match what `npm run demo:record` produces. Record the voiceover segment-by-segment against the picture; small drift is absorbed by trimming clips in Kdenlive.

### SLIDE 1 — Title & Agenda (0:00 – 0:36) · `slide_1_intro.webm`

> "Hello, my name is Dain Franklyn, and this is my Milestone 5 progress demonstration for APEX — the Advanced Personnel Evaluation eXchange — my capstone project digitizing the Navy's Evaluation System, starting with the junior enlisted evaluation. [PAUSE 1s] In the next seven minutes I'll walk through the current application and the features that are working end-to-end today, then cover the progress I've made since the previous milestone. [PAUSE 1s] I'll also discuss the features that are still partially complete, the challenges and blockers I've encountered, and outline my development plan for finishing the project before final submission."

_(~93 words · ~40 s)_

### SCENE 1 — Login & Role-Based Dashboard (0:36 – 1:18) · `scene_1_login_dashboard.webm`

> "Starting with the walkthrough. APEX is a Next.js and Supabase web application, and everything you're seeing runs live on my development stack. I'm signing in as a Sailor — one of five roles the system recognizes. [PAUSE 1s] The moment the dashboard loads, the role-based access engine shapes everything on screen: this Sailor sees only the evaluations in his custody, each card showing its live routing status and the next action required. This dashboard, the authentication flow, and the role engine behind them are all fully working features."

_(~95 words · ~42 s)_

### SCENE 2 — Drafting & the Validation Engine (1:18 – 2:20) · `scene_2_sailor_draft.webm`

> "This is the evaluation editor — the heart of the application, and it's complete. The form is organized into the same numbered blocks as the official Navy Enlisted Evaluation Form: administrative data, performance traits, and the narrative comment blocks. [PAUSE 1s] The picture-in-picture window shows the live document preview: Block 43 enforces the Navy's character-width limits and wraps text exactly as it will print. [PAUSE 1s] The strongest working feature is the validation engine. Clicking Verify Rules runs the draft against the checks I implemented using ruled from BUPERSINST 1610.10H — such as: occasion-for-report combinations, narrative overflow, trait substantiation rules, and date consistency — and reports every violation with the specific rule it came from. This engine now covers three hundred twenty-nine lines of cross-field logic and is fully tested."

_(~130 words · ~58 s)_

### SCENE 3 — Review & Custody Routing (2:20 – 3:12) · `scene_3_rater_review.webm`

> "Once a Sailor submits a draft, custody moves up a five-stage chain of command. I'm now viewing the same system as a Rater. [PAUSE 1s] The review panel is stage-aware: this Rater can route the evaluation forward, or recycle it back with mandatory corrective feedback — here I'm noting that a bullet needs quantified impact. [PAUSE 1s] Every custody transition is enforced server-side through service-role API routes, so the browser can never bypass the chain of command, and each hop is written to the audit log. This entire routing workflow — forward, recycle, and the feedback timeline — is finished and working."

_(~110 words · ~48 s)_

### SCENE 4 — Summary Groups & Forced Distribution (3:12 – 4:04) · `scene_4_summary_groups.webm`

> "Now signed in as a Reporting Senior, this is the summary group feature I completed for this milestone. When Sailors compete in the same paygrade, EVALMAN Table 1-2 caps how many can receive top promotion recommendations. [PAUSE 1s] Expanding this group shows the four competing First Class Petty Officers, the pooled trait average that feeds Block 50a, and the live quota tracker — one Early Promote allowed out of four, and the group currently shows within limits. [PAUSE 1s] If a second Early Promote were assigned, APEX would flag the violation and block the group from closing. The eligibility rules, the pooled averaging, and the quota math all have dedicated unit tests."

_(~118 words · ~50 s)_

### SCENE 5 — Signatures, Locking & Audit Trail (4:04 – 4:51) · `scene_5_co_signing.webm`

> "For certification, each signature block is gated by role — only the Reporting Senior can sign Block 50. Signing requires the user to re-enter their credentials, which is server side verified before any signature is stored. The final signature locks the report against all further edits. [PAUSE 1s] Switching to the audit tab: every lifecycle event — creation, routing hops, corrections, and signatures — is recorded with the user who performed the action and the timestamp. Signature capture, credential verification, locking, and this audit trail are all completed features from this milestone period."

_(~103 words · ~44 s)_

### SCENE 6 — Official PDF Output (4:51 – 5:33) · `scene_6_pdf_preview.webm`

> "And the feature that ties it together: the document preview renders the evaluation onto the official Evaluation Report. This is not a mock-up or lookalike! The data is drawn in and overlayed onto the report using measured coordinates, carefully placing text using Courier at the correct pitch, so the printed output matches the Navy's form character for character. [PAUSE 1s] Both pages render — identity blocks, trait marks, narratives, and the promotion recommendation — and the same rendering code drives the downloadable PDF export."

_(~90 words · ~40 s)_

### SLIDE 2 — Progress Since the Previous Milestone (5:33 – 6:14) · `slide_2_progress.webm`

> "So what's new since the previous milestone? Four major capability increments.
> -1 The pixel-accurate PDF overlay you just saw.
> -2 The five-stage custody routing workflow with its review panel and recycle flow.
> -3 Credential-verified digital signatures with automatic locking. and
> -4 The role-based access control engine — twenty permission actions across five roles — plus an admin panel for managing them.
> [PAUSE 1s] Additionally, summary groups with forced distribution also moved from plan to complete. Overall the codebase has more than doubled in size, and is now backed by one hundred seventy-three automated tests."

_(~111 words · ~47 s)_

### SLIDE 3 — Partially Completed Features (6:14 – 6:45) · `slide_3_partial.webm`

> "Three things are partially complete.
> -1 The Vercel production deployment — the build succeeds locally, and I'm finishing the environment configuration.
> -2 The Playwright end-to-end suite — three specs are scaffolded and I'm stabilizing them against a seeded database. and
> -3 The final demonstration artifiact capture and assembly."

_(~63 words · ~27 s)_

### SLIDE 4 — Challenges & Blockers (6:45 – 7:16) · `slide_4_challenges.webm`

> "The main challenges this milestone: Sourcing a clean copy of the revised Evaluation Report PDF proved challenging. The Updated form is not publicily accessible in pure PDF format or easily exported from the Navy network. I was able to export this updated form from the official NAVFIT98A windows application but the PDF-overlay option became mandatory since this exported form is not fillable. Additionally, this revised Evaluation form shifted every field which I solved with measured per-page offsets. Row-level security originally blocked legitimate reviewers, so I redesigned the policies around a participants array with service-role routes. And the E-5/E-6 combined quota cap needed its own paygrade normalizer with sixty-nine unit tests. [PAUSE 1s] I'm not currently stuck on anything — the main thing left is wiring the end-to-end tests as a gate to the production deployment pipeline. I don't need assistance with it."

_(~85 words · ~36 s)_

### SLIDE 5 — Next Steps & Close (7:16 – 7:49) · `slide_5_next_steps.webm`

> "Before the final submission next week:

- feature freeze and a full regression pass across all tests.
- Complete the Vercel deployment so the app is publicly accessible.
- Finalize the README and the rules-reference documentation.
- And record the final capstone demonstration.

[PAUSE 1s] The project is on schedule, and every feature planned for this milestone is demonstrated and working. Thank you for watching."

_(~65 words · ~28 s)_

---

## 4. Production Asset Checklist

All clips are produced by `npm run demo:record` into `artifacts/demo-videos/`, then assembled by `npm run demo:project`:

| File                                 | Track | Role                                                               |
| :----------------------------------- | :---- | :----------------------------------------------------------------- |
| `slide_1_intro.webm`                 | V1    | Title & agenda                                                     |
| `scene_1_login_dashboard.webm`       | V1    | Login + RBAC dashboard                                             |
| `scene_2_sailor_draft.webm`          | V1    | Editor + validation engine                                         |
| `scene_3_rater_review.webm`          | V1    | Review + routing                                                   |
| `scene_4_summary_groups.webm`        | V1    | Summary groups + quotas                                            |
| `scene_5_co_signing.webm`            | V1    | Signatures + audit trail                                           |
| `scene_6_pdf_preview.webm`           | V1    | NAVPERS PDF output                                                 |
| `slide_2_progress.webm`              | V1    | Progress since Milestone 4                                         |
| `slide_3_partial.webm`               | V1    | Partially completed features                                       |
| `slide_4_challenges.webm`            | V1    | Challenges & blockers                                              |
| `slide_5_next_steps.webm`            | V1    | Next steps & close                                                 |
| `overlay_1_block41_split.webm`       | V2    | PiP: live preview during Scene 2                                   |
| `overlay_4_validation_rules.webm`    | V2    | PiP: BUPERSINST rules card during Scene 2 (1:50 – 2:02, 45% width) |
| `overlay_2_forced_dist_warning.webm` | V2    | PiP: quota bar during Scene 4                                      |
| `overlay_3_audit_trail_sync.webm`    | V2    | PiP: audit log during Scene 5                                      |

### Kdenlive finishing checklist

1. Record narration segment-by-segment in Audacity (MOVO mono setup), export WAV, drop on **A1**.
2. Trim clip tails to match narration; the fades and PiP Transforms are already baked in by the generator.
3. Optional: music bed on **A2** at −16 dB, ducked to −25 dB under speech.
4. **Project → Render** → MP4 H.264/AAC, 1080p 60 fps, quality 15–20. Confirm final runtime lands between 6:00 and 8:00.
