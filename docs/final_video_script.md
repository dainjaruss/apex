# APEX Final Capstone Demonstration — Script v2 (beat-based)

**Target:** 6:00–8:00 · this draft ≈ 6:45 narration + ~20s clip tails ≈ **7:10 final**
**Why beats:** the M5 cut drifted because scenes were 40–60s — narration could only sync at each scene start, and quiet stretches showed a static page. This cut is 17 short clips, each = **one visible action + a few sentences**. The generator already trims every clip to its voiceover, so picture/voice sync is automatic at beat granularity.
**Recording:** `npm run db:seed-stress:reset` → `npm run demo:record` (beats 3a/3b/5a/6a mutate seed data; PDF beat 6a needs `HEADLESS=false` under Xvfb) → voiceover per beat → `npm run demo:project`.
**Effects baked into the clips:** gold **spotlight** (page dims around the element being discussed) and **punch-in** (smooth zoom to the region) — rendered in-browser at capture time so text stays sharp. Used sparingly: login error, email-confirmation notice, Block 43 wrap, violations modal, quota tracker, audit entry, PDF close-up. The split-screen routing beat is two isolated sessions hstacked into one clip.

> ⚠️ = personalize before recording — especially the reflection. Timing absorbs ±15%.

---

## PART 1 — PROJECT DEMO

### 1. `slide_1_intro` (~25s · ~58w)

> "Hello, my name is Dain Franklyn, and this is the final demonstration of my capstone project: APEX — a web application that digitizes the Navy's enlisted performance evaluation starting with the Junior Enlisted Evaluations. I'll walk through the completed application, the technology behind it, what I deliberately left out of scope, and close with a personal reflection."

### 2. `scene_1a_login_dashboard` (~32s · ~75w)

_On screen: wrong password → spotlighted error → correct login → dashboard tour._

> "Authentication is handled by Supabase. Bad passwords get rejected server-side with a sanitized error - no implemenation details leaked. [beat] Once a Sailor signs in successfully, the role-based access engine shapes thier dashboard, meaning this user only sees the evaluations in his custody. On the dashboard, each card shows its live routing status and the next action required. Five roles, twenty permission actions — everything downstream starts from this check."

### 3. `scene_1b_register_email` (~16s · ~37w)

_On screen: registration form filled → submit → spotlighted "verification link sent" screen._

> "New accounts self-register with their Navy identity data, and APEX sends a secure email verification link — no one gains access to the system until their email address is confirmed."

### 4. `scene_2a_editor_tour` (~20s · ~47w)

_On screen: editor opens → scroll admin blocks → Performance Traits step._

> "This is the evaluation editor, organized into the same numbered blocks as the official form. APEX break this into sections: administrative data, traits and perfromance grades, comments on performace and reccomendations. All feilds align perfectly with the published evaluation manual"

### 5. `scene_2b_live_preview` (~16s · ~37w) · _overlay: Block 41 PDF PiP_

_On screen: narrative step → typing into Block 43 → punch-in on the wrap._

> "Watch the comments block as I type: it wraps text exactly as the printed form will — ten- or twelve-pitch Courier, ninety characters a line — so what fits here is precisely what prints."

### 6. `scene_2c_validation_rules` (~32s · ~75w) · _overlay: BUPERSINST rules card_

_On screen: trait dropped to 1.0 → Verify Rules → spotlighted violations → grade restored → clean re-verify._

> "Now the validation engine. I'll deliberately drop a trait to one-point-oh. Verify Rules runs the draft against cross-field checks implemented straight from Navy's eval instruction — and it catches both problems: a one-point-oh must be substantiated in comments, and it conflicts with the Promotable recommendation. Each violation cites the rule it came from. [beat] Restore the grade, verify again — and the report passes clean."

### 7. `scene_3a_routing_split` (~34s · ~79w) — **split screen**

_On screen: left = Sailor clicks Route Forward; right = Rater's dashboard, report appears._

> "Here's the chain of command working live, in two separate sessions side by side. On the left, the Sailor routes the finished draft forward. [beat] On the right — the moment the Rater checks their queue, the report is waiting in their custody. That transition happened server-side, through a service-role route; the database itself only lets the current custodian write to a report, so the browser can never bypass the chain."

### 8. `scene_3b_recycle` (~18s · ~42w)

_On screen: Rater types corrective feedback → Recycle → history timeline updates._

> "Routing works both ways: a reviewer can recycle a report back one step — corrective feedback is mandatory — and the full recycle history stays on the report's timeline for the Sailor to act on."

### 9. `scene_4a_summary_groups` (~28s · ~65w) · _overlay: quota bar PiP_

_On screen: group expands → members + pooled average → punch-in on quota tracker._

> "As a Reporting Senior: summary groups. Sailors competing in the same paygrade are ranked together. Navy policy caps the top recommendations — at most twenty percent Early Promote. This group of four shows the pooled trait average that feeds Block 50a, and the live quota tracker: one Early Promote allowed, currently within limits. One more, and APEX blocks the group from closing."

### 10. `scene_5a_signing` (~28s · ~65w)

_On screen: Sign button → modal: typed name, drawn signature, credentials, consent → Sign & Certify._

> "Certification. Each signature block is gated by role — only the Reporting Senior can sign Block 50. The signer types their name, draws their signature, and — because a Navy evaluation demands non-repudiation — re-enters their credentials, which are verified server-side before anything is stored. Sign and certify… and the signature is applied and the report locks."

### 11. `scene_5b_audit_lock` (~15s · ~35w) · _overlay: audit PiP_

_On screen: audit tab → spotlighted signature entry._

> "And there it is in the audit trail — that signature, recorded with who applied it and when, alongside every routing hop and correction in this report's life."

### 12. `scene_6a_export_download` (~28s · ~65w)

_On screen: export portal → punch-in on rendered PDF → Download → Finalize → dashboard._

> "Finally, the output. The export portal re-validates the report, then renders it onto the official form, NAVPERS 1616/26, with the data drawn at measured coordinates in Courier, just like the Navy prints. One click downloads the PDF; Finalize seals the report's status and returns to the dashboard."

### 13. `slide_2_tech` (~28s · ~65w)

> "The stack: Next.js 14 with React and TypeScript; Supabase providing Postgres, authentication, and row-level security; Zod for schema validation; and pdf-lib with an embedded Courier font for document rendering. Backed by 158 unit and integration tests plus three end-to-end specs, and deployed to production on Vercel. Guiding principle: never trust the browser, every rule is enforced twice."

### 14. `slide_3_incomplete` (~28s · ~65w)

> "⚠️ Three planned items didn't make the final build — deliberately. Continuous-integration wiring for the end-to-end tests, which run locally against a seeded database today. Summary-group breakout by unit code — schema-ready, but not required for my target paygrades. And the implementaion of other report types: Chief evaluations and officer fitness reports — the same architecture, but each carries its own set of validation rules."

---

## PART 2 — PERSONAL REFLECTION

### 15. `slide_4_reflection_skills` (~45s · ~105w)

> "⚠️ What did this project give me? Technically, it was my first time owning a full end-to-end full-stack project on a strict timeline — designing the database schema, security policies, API layer, and UI as one cohesive system — I learned that access control has to live in the database, not just the UI. This cause me to revisit another project where I designed two-factor authentication into the UI only, which I will now refactor to include database-level authentication. Unknow at the time to me that once the passsword was accepted, GO-True authentication server issued a session token so event hough the 2fa screen appeared, th user could still access the application by typing the url into the browser's address bar. I will refactor all projects to include database-level authentication, not just UI-level.

Second, the discipline of building from primary sources: nearly every feature came from reading the actual Navy instructions and translating those business rules into code. That turned out to be a very different skill than working from a wish list, but I wanted the practice because I’m sure corporate development will demand following strict, specific rules.

And third, real project management: weekly milestones forced me to slice a big system into demonstrable increments, using the test suite as the barometer for what was actually ready to ship. I learned that test are much easier to write simultaneously as a feature is being developed, and thisis the way that I am developing all projects from now on"

### 16. `slide_5_reflection_challenges` (~40s · ~93w)

> "⚠️ The biggest challenges. First, my original security policies only let creators see their own reports, which broke the moment a re port needed to travel up the chain — I redesigned row-level security around custody, which touched nearly every layer of the app. I realied that I initally understood what I wanted to happen, but I did not fully understand how to implement it.
> Second, simply getting the official form and understanding learining the difference between XFA and PDF forms. Initially, I wanted to use a filliable PDF, but the correct versionof such a form sis not exist, at least not in tru PDF format. XFA presented limitaion and inconsistencies, which forced me to abandon the filliable form approach and embark on the much more difficult overlay architecture which required embedding data at measured coordinates into the pdf form. In the end, this proved the be the right approach for consisrency and accuracy "

### 17. `slide_6_close` (~30s · ~70w)

> "⚠️ If I started over: I'd design the custody model and security policies first, not retrofit them — that redesign was my most expensive rework. I'd implement testing and stand up continuous integration in week one. And I'd research the PDF and XFA differences first and decise on a path before writing code.
> To close: APEX set out to digitize the Navy evaluation workflow end to end and providing an irefutable artifact worthy of a sailors record. That goal is met, and you've just seen it working. Thank you for watching."

---

## Production checklist

1. `npm run db:seed-stress:reset` — beats 3a, 3b, 5a, 6a mutate seeded evals; reset before every full re-record.
2. `npm run demo:record` (PDF beat + export beat need `HEADLESS=false` under Xvfb; everything else records headless). Selective re-record: `npm run demo:record -- scene_2c overlay_4`.
3. Record narration **per beat** in Audacity (MOVO, mono) → `artifacts/demo-videos/voiceover/<clip_name>.wav`. Short segments = re-record only the beat you flubbed.
4. `npm run demo:project` → open in Kdenlive, sanity-check the split-screen beat and overlay timings.
5. Render MP4 H.264/AAC 1080p60, quality 15–20. Confirm runtime 6:00–8:00.
