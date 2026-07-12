# APEX Video Production: Kdenlive Workflow Guide

**Document Version:** 2.0.0
**Editing Workstation:** Linux (Kdenlive 26.04.2 AppImage)
**Workflow Type:** Script-generated timeline + manual finishing in Kdenlive

---

## 1. How this workflow works

A `.kdenlive` project file is plain MLT XML, so everything that can be scripted is baked in by our generator (`scripts/build-kdenlive-project.py`) — clip import, track layout, overlay positioning, picture-in-picture geometry, and fades. You re-run the script to change those, and use Kdenlive itself only for the human parts: voiceover, subtitles, final polish, and render.

> **What happened to the "live MCP control" plan?** Both existing Kdenlive MCP servers ([D-Ogi/mcp-kdenlive](https://github.com/D-Ogi/mcp-kdenlive) via D-Bus, [IO-AtelierTech/kdenlive-automation](https://github.com/IO-AtelierTech/kdenlive-automation) via WebSocket) require a **custom-patched Kdenlive built from source** — stock Kdenlive (our AppImage) exposes no scripting API, and neither fork ships prebuilt binaries. Building KDE + MLT from source for one demo video isn't worth it. The `pip install kdenlive-api mcp` instruction from v1 of this guide installed the wrong package and would not have worked. Editing the MLT XML through the generator achieves the same automation with zero new infrastructure.

---

## 2. Step 1: Generate & Open the Master Project

### Run the generator:

```bash
npm run demo:project
```

### What it builds (verified two ways: sample frames rendered through `melt`, and a full open in Kdenlive 26.04.2 confirming bin, timeline, Transform and fade effects load cleanly):

- Checks all 14 WebM clips exist in `artifacts/demo-videos/`, reads their real durations with `ffprobe`.
- Emits `apex_demo_master.kdenlive` in Kdenlive document format 1.04 — 1080p 60 fps, ~7.5 min Milestone 5 timeline:
  - **Track V1 (Main A-Roll):** `slide_1_intro` → six live app scenes → four narrative slides (progress / partial / challenges / next steps), with a 0.8 s fade from black at the start and fade to black at the end.
  - **Track V2 (PiP Overlays):** each overlay starts 2 s into its related scene, composited picture-in-picture (⅓ size, top-right):
    - `overlay_1_block41_split` → over the sailor drafting scene
    - `overlay_2_forced_dist_warning` → over the summary groups scene
    - `overlay_3_audit_trail_sync` → over the CO signing scene
  - **Track A1 (Voiceover)** and **Track A2 (Music):** empty, ready for audio.
- Segment timings and the word-for-word narration live in [video_production_script.md](video_production_script.md), which also maps each segment to the Milestone 5 rubric requirements.

### Open in Kdenlive:

1. Launch **Kdenlive**.
2. **File → Open** (or the welcome screen's recent list) → `artifacts/demo-videos/apex_demo_master.kdenlive`.
3. It opens directly — Kdenlive upgrades the 1.04 document silently. The PiP placement shows as a **Transform** effect on each V2 overlay clip, editable in the Effect/Composition Stack.

---

## 3. Step 2: Programmatic tweaks (edit knobs, re-run, reload)

The tweakable values live at the top of `scripts/build-kdenlive-project.py`:

| Knob              | Default             | Meaning                                                                                                         |
| ----------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PIP_RECT`        | `1216 64 640 360 1` | Overlay geometry: `x y width height opacity` in the 1920×1080 frame (default = ⅓ size, top-right, 64 px margin) |
| `FADE_S`          | `0.8`               | Fade from/to black duration on the A-roll (seconds)                                                             |
| `OVERLAY_DELAY_S` | `2.0`               | How far into its scene each overlay appears                                                                     |
| `OVERLAYS`        | see script          | Which overlay plays over which scene                                                                            |

Workflow: edit knob → `npm run demo:project` → in Kdenlive **File → Open Recent** (or close/reopen the project) to pick up the regenerated file. Don't save over the project from Kdenlive between regenerations, or your GUI edits will be overwritten by the next script run — do script tweaks first, GUI polish last.

---

## 4. Step 3: Finishing inside Kdenlive (the human parts)

Do these in the GUI after the scripted timeline looks right:

1. **Voiceover:** Record narration from [video_production_script.md](video_production_script.md) in Audacity (the MOVO mono setup is already configured), export WAV, then drag it onto **Track A1**.
2. **Music (optional):** Drop an ambient track on **A2**, lower its gain (~-20 dB). For ducking under narration, right-click the A2 clip → apply the **Volume (keyframable)** effect and dip it while speech plays — with a single music bed this is faster by hand than any automation.
3. **Subtitles (optional):** Kdenlive has built-in Whisper: **Settings → Configure Kdenlive → Speech to text** to download a model, then **Timeline → Subtitles → Speech recognition** on the voiceover clip.
4. **Trim PiP starts (optional):** each overlay clip begins with a login sequence; drag the clip's left edge on V2 to start at the interesting content.

---

## 5. Step 4: Render

**Project → Render** → preset **MP4-H264/AAC**, 1080p 60 fps, quality ~15–20 → `APEX_Demonstration_Final.mp4`.

Headless alternative (uses the same MLT engine, no GUI):

```bash
cd artifacts/demo-videos
melt apex_demo_master.kdenlive -consumer avformat:APEX_Demonstration_Final.mp4 \
  vcodec=libx264 crf=18 preset=slow acodec=aac ab=192k
```

---

## 6. Summary Checklist

1. [x] **Record raw footage:** `npm run demo:record` (8 WebM clips).
2. [x] **Generate master timeline:** `npm run demo:project` (scenes + PiP overlays + fades, verified via melt frame renders).
3. [ ] **Record voiceover:** read [video_production_script.md](video_production_script.md), drop WAV on Track A1.
4. [ ] **Finish in Kdenlive:** music/ducking, subtitles, PiP trim as desired.
5. [ ] **Render & export** the final capstone video.
