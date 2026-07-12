#!/usr/bin/env python3
"""
build-kdenlive-project.py

Programmatically generates a Kdenlive project file (.kdenlive) from the
recorded Playwright clips in artifacts/demo-videos/ (Milestone 5 cut:
5 narrative slides + 6 live app scenes + 3 PiP overlays, ~7.5 minutes).

Emits Kdenlive document format 1.04 (the pre-sequence format), which
Kdenlive 23+ upgrades automatically on open. The grammar Kdenlive
requires (learned from its own tests/dataset reference projects):
  - bin and timeline use SEPARATE producer instances, linked by an
    integer kdenlive:id (bin producer + one copy per timeline use)
  - each timeline track is a sub-tractor wrapping two playlists
  - track compositing/audio-mix transitions in the main tractor are
    marked internal_added=237
  - PiP is a Transform (qtblend) FILTER on each overlay clip, not an
    always-active track transition

The generated timeline (1080p 60fps):
  - Track V1 (Main A-Roll): scene_1..scene_5 sequentially, fade from
    black on scene 1, fade to black at the end of scene 5.
  - Track V2 (B-Roll Overlays): each overlay positioned over its related
    scene (starts OVERLAY_DELAY_S into the scene), scaled/placed as
    picture-in-picture by a Transform effect using PIP_RECT.
  - Track A1 (Voiceover) / A2 (Music): empty audio tracks ready for media.

Tweak PIP_RECT / FADE_S / OVERLAY_DELAY_S below, re-run, then reload the
project in Kdenlive (File -> Open Recent) to see the changes.

Usage:
  python3 scripts/build-kdenlive-project.py
"""

import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from xml.dom import minidom

# Project directories
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
VIDEO_DIR = os.path.join(ROOT_DIR, 'artifacts', 'demo-videos')
OUTPUT_FILE = os.path.join(VIDEO_DIR, 'apex_demo_master.kdenlive')

FPS = 60

# ---- Tweakable knobs (edit + re-run instead of clicking through Kdenlive) ----
# PiP geometry for overlay clips: "x y width height opacity" in 1920x1080.
# Default: 1/3-size, top-right corner with a 64px margin.
PIP_RECT = '1216 64 640 360 1'
FADE_S = 0.8           # fade from/to black duration on the A-roll
# Per-overlay PiP rect overrides (e.g. the rules card renders at 45% width
# so its text stays readable)
OVERLAY_RECTS = {
    'overlay_4_validation_rules.webm': '992 64 864 486 1',
}

# Voiceover: WAVs in VO_DIR named after their scene (e.g. slide_1_intro.wav)
# are placed on A1 at the scene's start. Each video segment is trimmed to its
# narration length + VO_TAIL_S, and each WAV gets a volume filter normalizing
# its peak to VO_PEAK_DB.
VO_DIR = os.path.join(VIDEO_DIR, 'voiceover')
# 1.25s: with ~17 short beats, a 2s tail per clip added ~35s of dead air
VO_TAIL_S = 1.25
VO_PEAK_DB = -3.0

# A-roll in chronological order (final-demo beat-based cut: each beat is one
# visible action + a short narration segment, so VO-driven trimming keeps
# picture and voice aligned automatically)
SCENES = [
    'slide_1_intro.webm',
    'splash_1a_login_auth.webm',
    'scene_1a_login_dashboard.webm',
    'splash_1b_registration.webm',
    'scene_1b_register_email.webm',
    'splash_2_editor_tour.webm',
    'scene_2a_editor_tour.webm',
    'scene_2b_live_preview.webm',
    'scene_2c_validation_rules.webm',
    'splash_3_routing_chain.webm',
    'scene_3a_routing_split.webm',
    'scene_3b_recycle.webm',
    'splash_4_summary_groups.webm',
    'scene_4a_summary_groups.webm',
    'splash_5_signing_audit.webm',
    'scene_5a_signing.webm',
    'scene_5b_audit_lock.webm',
    'splash_6_export.webm',
    'scene_6a_export_download.webm',
    'slide_2_tech.webm',
    'slide_3_incomplete.webm',
    'slide_4_reflection_skills.webm',
    'slide_5_reflection_challenges.webm',
    'slide_6_close.webm',
]

# overlay filename -> (target scene filename in SCENES, seconds into scene).
# Keep entries in timeline order - the V2 playlist is built sequentially.
OVERLAYS = {
    'overlay_1_block41_split.webm': ('scene_2b_live_preview.webm', 2.0),        # Block 41 PDF zoom -> live preview beat
    'overlay_4_validation_rules.webm': ('scene_2c_validation_rules.webm', 6.0),     # rules card -> during Verify Rules beat
    'overlay_2_forced_dist_warning.webm': ('scene_4a_summary_groups.webm', 2.0),  # quota bar -> summary groups beat
    'overlay_3_audit_trail_sync.webm': ('scene_5b_audit_lock.webm', 1.5),    # audit trail -> audit/lock beat
}


def probe_frames(filepath):
    """Clip length in timeline frames, from ffprobe duration."""
    out = subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', filepath,
    ], text=True)
    return int(float(out.strip()) * FPS)


def probe_peak_db(filepath):
    """Peak level in dBFS via ffmpeg volumedetect."""
    out = subprocess.run(
        ['ffmpeg', '-i', filepath, '-af', 'volumedetect', '-f', 'null', '-'],
        capture_output=True, text=True).stderr
    m = re.search(r'max_volume: (-?[\d.]+) dB', out)
    return float(m.group(1)) if m else 0.0


def check_files():
    print("Checking video assets in:", VIDEO_DIR)
    missing = []
    for filename in SCENES + list(OVERLAYS):
        filepath = os.path.join(VIDEO_DIR, filename)
        if not os.path.exists(filepath):
            missing.append(filename)
        else:
            size_kb = os.path.getsize(filepath) / 1024
            print(f"  [OK] {filename} ({size_kb:.1f} KB)")

    if missing:
        print("\n[WARNING] Missing video files:", missing)
        print("Run 'npm run demo:record' first to generate all video clips.")
        return False
    return True


def add_property(parent, name, value):
    prop = ET.SubElement(parent, 'property', name=name)
    prop.text = str(value)
    return prop


class IdGen:
    """Sequential ids for filters/transitions/producers, Kdenlive-style."""

    def __init__(self):
        self.counts = {}

    def next(self, kind):
        n = self.counts.get(kind, 0)
        self.counts[kind] = n + 1
        return f'{kind}{n}'


def clip_producer(mlt, ids, filename, frames, kdenlive_id, clipname=None, timeline=False):
    """A producer instance for a clip; bin and timeline get separate copies."""
    prod = ET.SubElement(mlt, 'producer', id=ids.next('producer'),
                         **{'in': '0', 'out': str(frames - 1)})
    add_property(prod, 'resource', os.path.join(VIDEO_DIR, filename))
    add_property(prod, 'length', frames)
    add_property(prod, 'eof', 'pause')
    add_property(prod, 'kdenlive:id', kdenlive_id)
    add_property(prod, 'kdenlive:folderid', '-1')
    if clipname:
        add_property(prod, 'kdenlive:clipname', clipname)
    if timeline:
        # timeline video-track instance: video only, no audio stream
        add_property(prod, 'set.test_audio', '1')
        add_property(prod, 'set.test_image', '0')
    return prod


def timeline_entry(playlist, prod, frames, kdenlive_id, out=None):
    entry = ET.SubElement(playlist, 'entry', producer=prod.get('id'),
                          **{'in': '0', 'out': str(out if out is not None else frames - 1)})
    add_property(entry, 'kdenlive:id', kdenlive_id)
    return entry


def add_fade(entry, ids, frames, fade_frames, fade_in):
    """Kdenlive-style fade from/to black on a timeline entry.

    The filter element MUST carry in/out attributes scoping it to the fade
    region - Kdenlive derives the fade from that span, and without it the
    whole clip renders black in its monitor (melt is more forgiving).
    """
    if fade_in:
        fin, fout = 0, fade_frames - 1
        level = f'0=0;{fade_frames - 1}=1'
        kid = 'fade_from_black'
    else:
        fin, fout = frames - fade_frames, frames - 1
        level = f'{frames - fade_frames}=1;{frames - 1}=0'
        kid = 'fade_to_black'
    filt = ET.SubElement(entry, 'filter', id=ids.next('filter'),
                         **{'in': str(fin), 'out': str(fout)})
    add_property(filt, 'mlt_service', 'brightness')
    add_property(filt, 'kdenlive_id', kid)
    add_property(filt, 'alpha', '1')
    add_property(filt, 'level', level)


def add_transform(entry, ids, rect):
    """Kdenlive Transform effect (qtblend filter) — used for PiP placement."""
    filt = ET.SubElement(entry, 'filter', id=ids.next('filter'))
    add_property(filt, 'mlt_service', 'qtblend')
    add_property(filt, 'kdenlive_id', 'qtblend')
    add_property(filt, 'rect', rect)
    add_property(filt, 'rotation', '0')
    add_property(filt, 'compositing', '0')
    add_property(filt, 'distort', '0')


def make_track(mlt, ids, name, audio=False):
    """One timeline track = a tractor wrapping two playlists (Kdenlive grammar)."""
    playlists = []
    for _ in range(2):
        pl = ET.SubElement(mlt, 'playlist', id=ids.next('playlist'))
        if audio:
            add_property(pl, 'kdenlive:audio_track', '1')
        playlists.append(pl)
    tractor = ET.SubElement(mlt, 'tractor', id=ids.next('tractor'), **{'in': '0'})
    if audio:
        add_property(tractor, 'kdenlive:audio_track', '1')
    add_property(tractor, 'kdenlive:track_name', name)
    add_property(tractor, 'kdenlive:trackheight', '67')
    add_property(tractor, 'kdenlive:timeline_active', '1')
    add_property(tractor, 'kdenlive:collapsed', '0')
    hide = 'video' if audio else 'audio'
    for pl in playlists:
        ET.SubElement(tractor, 'track', hide=hide, producer=pl.get('id'))
    return tractor, playlists[0]


def internal_transition(tractor, ids, b_track, audio=False):
    """Track compositing (video) / mixing (audio) — internal_added=237."""
    tr = ET.SubElement(tractor, 'transition', id=ids.next('transition'))
    add_property(tr, 'a_track', '0')
    add_property(tr, 'b_track', b_track)
    add_property(tr, 'mlt_service', 'mix' if audio else 'qtblend')
    add_property(tr, 'kdenlive_id', 'mix' if audio else 'qtblend')
    add_property(tr, 'internal_added', '237')
    add_property(tr, 'always_active', '1')
    if audio:
        add_property(tr, 'accepts_blanks', '1')
        add_property(tr, 'sum', '1')


def build_kdenlive_xml():
    ids = IdGen()
    scene_frames = {f: probe_frames(os.path.join(VIDEO_DIR, f)) for f in SCENES}
    overlay_frames = {f: probe_frames(os.path.join(VIDEO_DIR, f)) for f in OVERLAYS}

    # Voiceover clips: <scene>.wav in VO_DIR, normalized to VO_PEAK_DB
    vo_frames, vo_gain = {}, {}
    for f in SCENES:
        wav = os.path.join(VO_DIR, f.replace('.webm', '.wav'))
        if os.path.exists(wav):
            vo_frames[f] = probe_frames(wav)
            vo_gain[f] = round(min(18.0, max(0.0, VO_PEAK_DB - probe_peak_db(wav))), 1)

    # Each segment plays for its narration length + tail (capped by the clip)
    tail = int(VO_TAIL_S * FPS)
    eff_frames = {}
    print("\nSegment fit (video / voiceover / used):")
    for f in SCENES:
        if f in vo_frames:
            eff_frames[f] = min(scene_frames[f], vo_frames[f] + tail)
            if vo_frames[f] > scene_frames[f]:
                print(f"  [WARNING] {f}: narration ({vo_frames[f]/FPS:.1f}s) is LONGER "
                      f"than the video ({scene_frames[f]/FPS:.1f}s) - re-record this clip")
            print(f"  {f:36s} {scene_frames[f]/FPS:5.1f}s / {vo_frames[f]/FPS:5.1f}s "
                  f"/ {eff_frames[f]/FPS:5.1f}s  (gain +{vo_gain[f]}dB)")
        else:
            eff_frames[f] = scene_frames[f]
            print(f"  {f:36s} {scene_frames[f]/FPS:5.1f}s /  none / {eff_frames[f]/FPS:5.1f}s")

    # Cumulative start frame of each scene on V1
    scene_starts = []
    pos = 0
    for f in SCENES:
        scene_starts.append(pos)
        pos += eff_frames[f]
    total_frames = pos

    mlt = ET.Element('mlt', {
        'LC_NUMERIC': 'C',
        'version': '7.20.0',
        'root': VIDEO_DIR,
        'producer': 'main_bin',
    })

    ET.SubElement(mlt, 'profile', {
        'description': 'HD 1080p 60 fps',
        'width': '1920',
        'height': '1080',
        'progressive': '1',
        'sample_aspect_num': '1',
        'sample_aspect_den': '1',
        'display_aspect_num': '16',
        'display_aspect_den': '9',
        'frame_rate_num': str(FPS),
        'frame_rate_den': '1',
        'colorspace': '709',
    })

    # ---- Project bin: one producer per clip (video + voiceover WAVs) ----
    vo_names = {f: os.path.join('voiceover', f.replace('.webm', '.wav'))
                for f in vo_frames}
    all_clips = SCENES + list(OVERLAYS) + list(vo_names.values())
    frames_of = {**scene_frames, **overlay_frames,
                 **{vo_names[f]: vo_frames[f] for f in vo_frames}}
    bin_ids = {}
    bin_producers = {}
    for i, filename in enumerate(all_clips):
        kid = str(i + 2)
        bin_ids[filename] = kid
        label = os.path.basename(filename).split('.')[0]
        bin_producers[filename] = clip_producer(
            mlt, ids, filename, frames_of[filename], kid, clipname=label)

    main_bin = ET.SubElement(mlt, 'playlist', id='main_bin')
    add_property(main_bin, 'kdenlive:docproperties.activeTrack', '2')
    add_property(main_bin, 'kdenlive:docproperties.audioChannels', '2')
    add_property(main_bin, 'kdenlive:docproperties.documentid', str(int(time.time() * 1000)))
    add_property(main_bin, 'kdenlive:docproperties.kdenliveversion', '22.12.3')
    add_property(main_bin, 'kdenlive:docproperties.profile', 'atsc_1080p_60')
    add_property(main_bin, 'kdenlive:docproperties.version', '1.04')
    add_property(main_bin, 'kdenlive:expandedFolders', '')
    add_property(main_bin, 'kdenlive:documentnotes', '')
    add_property(main_bin, 'xml_retain', '1')
    for filename in all_clips:
        ET.SubElement(main_bin, 'entry', producer=bin_producers[filename].get('id'),
                      **{'in': '0', 'out': str(frames_of[filename] - 1)})

    # ---- Hidden background track ----
    black = ET.SubElement(mlt, 'producer', id='black_track',
                          **{'in': '0', 'out': str(total_frames - 1)})
    add_property(black, 'length', '2147483647')
    add_property(black, 'eof', 'continue')
    add_property(black, 'resource', 'black')
    add_property(black, 'mlt_service', 'color')
    add_property(black, 'mlt_image_format', 'rgba')
    add_property(black, 'set.test_audio', '0')

    # ---- Tracks, bottom to top: A2, A1, V1, V2 ----
    tractor_a2, _ = make_track(mlt, ids, 'A2 - Ambient Music', audio=True)

    # A1: one narration clip at the start of its scene, peak-normalized.
    # Producers MUST be created before the playlist that references them -
    # MLT resolves the XML in document order.
    a1_producers = {f: clip_producer(mlt, ids, vo_names[f], vo_frames[f], bin_ids[vo_names[f]])
                    for f in vo_frames}
    tractor_a1, content_a1 = make_track(mlt, ids, 'A1 - Voiceover Narration', audio=True)
    cursor = 0
    for i, filename in enumerate(SCENES):
        if filename not in vo_frames:
            continue
        start = scene_starts[i]
        if start > cursor:
            ET.SubElement(content_a1, 'blank', length=str(start - cursor))
        entry = timeline_entry(content_a1, a1_producers[filename],
                               vo_frames[filename], bin_ids[vo_names[filename]])
        if vo_gain[filename] > 0:
            filt = ET.SubElement(entry, 'filter', id=ids.next('filter'))
            add_property(filt, 'mlt_service', 'volume')
            add_property(filt, 'kdenlive_id', 'volume')
            add_property(filt, 'level', vo_gain[filename])
        cursor = start + vo_frames[filename]

    # V1: scenes back to back (trimmed to narration), fades at the ends
    fade_frames = int(FADE_S * FPS)
    v1_producers = {f: clip_producer(mlt, ids, f, scene_frames[f], bin_ids[f], timeline=True)
                    for f in SCENES}
    tractor_v1, content_v1 = make_track(mlt, ids, 'V1 - Main A-Roll')
    # entries must live on the tractor's first playlist, which make_track
    # already appended to mlt — populate it now
    for i, filename in enumerate(SCENES):
        entry = timeline_entry(content_v1, v1_producers[filename],
                               eff_frames[filename], bin_ids[filename])
        if i == 0:
            add_fade(entry, ids, eff_frames[filename], fade_frames, fade_in=True)
        if i == len(SCENES) - 1:
            add_fade(entry, ids, eff_frames[filename], fade_frames, fade_in=False)

    # V2: overlays over their scenes, PiP via Transform effect
    v2_producers = {f: clip_producer(mlt, ids, f, overlay_frames[f], bin_ids[f], timeline=True)
                    for f in OVERLAYS}
    tractor_v2, content_v2 = make_track(mlt, ids, 'V2 - PiP Overlays')
    cursor = 0
    for filename, (target_scene, offset_s) in OVERLAYS.items():
        scene_idx = SCENES.index(target_scene)
        start = scene_starts[scene_idx] + int(offset_s * FPS)
        scene_end = scene_starts[scene_idx] + eff_frames[SCENES[scene_idx]]
        # trim the overlay if it would outlast its scene
        out = min(overlay_frames[filename], scene_end - start) - 1
        if start > cursor:
            ET.SubElement(content_v2, 'blank', length=str(start - cursor))
        entry = timeline_entry(content_v2, v2_producers[filename],
                               overlay_frames[filename], bin_ids[filename], out=out)
        add_transform(entry, ids, OVERLAY_RECTS.get(filename, PIP_RECT))
        cursor = start + out + 1

    # ---- Master timeline tractor (must be the last element) ----
    timeline = ET.SubElement(mlt, 'tractor', id=ids.next('tractor'),
                             **{'in': '0', 'out': str(total_frames - 1)})
    ET.SubElement(timeline, 'track', producer='black_track')
    for tr in (tractor_a2, tractor_a1, tractor_v1, tractor_v2):
        ET.SubElement(timeline, 'track', producer=tr.get('id'))
    internal_transition(timeline, ids, '1', audio=True)
    internal_transition(timeline, ids, '2', audio=True)
    internal_transition(timeline, ids, '3')
    internal_transition(timeline, ids, '4')

    return mlt, total_frames


def main():
    print("====================================================")
    print("KDENLIVE PROJECT GENERATOR (document format 1.04)")
    print("====================================================")

    if not check_files():
        sys.exit(1)

    print("\nGenerating Kdenlive project XML...")
    mlt_root, total_frames = build_kdenlive_xml()

    xml_str = ET.tostring(mlt_root, encoding='utf-8')
    pretty_xml = minidom.parseString(xml_str).toprettyxml(indent=" ", encoding='utf-8')

    with open(OUTPUT_FILE, 'wb') as f:
        f.write(pretty_xml)

    print(f"\n[SUCCESS] Generated Kdenlive Project File:")
    print(f"  -> {OUTPUT_FILE}")
    print(f"  Timeline: {total_frames} frames ({total_frames / FPS:.1f}s at {FPS}fps)")
    print("\nHow to use:")
    print("  1. Open Kdenlive and go to File -> Open -> apex_demo_master.kdenlive.")
    print("  2. Accept the document upgrade prompt (1.04 -> current format).")
    print("  3. To tweak PiP size/position or fades: edit the knobs at the top")
    print("     of this script, re-run it, and reload the project in Kdenlive.")
    print("====================================================")


if __name__ == '__main__':
    main()
