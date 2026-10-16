"""FlipRecipe → FlipProject, deterministically.

For every recipe section, in order:
  sample   `sample_bars` bars from the start of the chosen section of the
           original (auto = the chorus, else the most energetic), one looped
           clip per kept source, with the section's effects
  parts    generated drums/bass/chords/arp over the section (app/flip/generate),
           with the section's energy; harmony "song" follows the clips just
           placed, so the new chords fit the kept vocal
Same-name tracks collect the clips/patterns of every section, so the result is
an ordinary project: editable clip by clip, regenerable part by part.
"""
from __future__ import annotations

import random

from app.analysis.structure import structure_for
from app.flip.generate import ENERGY_LEVEL, generate
from app.models import (
    ChordMark, FlipClip, FlipProject, FlipRecipe, FlipTrack, GenerateRequest, RecipeSection, Section,
)
from app.storage import find_stems

MAX_BARS = 128
TRACK_NAME = {"vocals": "Voce", "drums": "Batteria", "bass": "Basso", "other": "Altro", "mix": "Campione"}
HARMONY_TRACK = "Voce armonia"


def _uid(rng: random.Random) -> str:
    return "".join(rng.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(8))


def _find_section(sections: list[Section], name: str) -> tuple[Section, bool]:
    """(section, found as asked). auto / missing name → the chorus."""
    if name not in ("auto", "none"):
        hit = next((s for s in sections if s.name == name), None)
        if hit:
            return hit, True
    chorus = next((s for s in sections if s.name == "ritornello"), None)
    return chorus or max(sections, key=lambda s: s.energy), name == "auto"


def _apply_fx(clip: FlipClip, fx: list[str]) -> FlipClip:
    upd: dict = {}
    for f in fx:
        if f == "filtered":
            upd.update(lp_freq=900.0)
        elif f == "telephone":
            upd.update(hp_freq=600.0, lp_freq=3200.0)
        elif f == "reversed":
            upd.update(reverse=True)
        elif f == "stutter":
            upd.update(gate="1/16", gate_duty=0.55)
        elif f == "octave_up":
            upd.update(semitones=12.0)
        elif f == "octave_down":
            upd.update(semitones=-12.0)
        elif f == "tuned":
            upd.update(tune=0.8)
    return clip.model_copy(update=upd)


def build(track_id: str, recipe: FlipRecipe, seed: int) -> tuple[FlipProject, list[str]]:
    structure = structure_for(track_id)
    if structure is None:
        raise FileNotFoundError("Track not found")
    has_stems = find_stems(track_id) is not None
    rng = random.Random(seed)
    notes: list[str] = []
    bpb = structure.beats_per_bar

    sections: list[RecipeSection] = []
    used = 0
    for sec in recipe.sections:
        if used >= MAX_BARS:
            notes.append(f"oltre {MAX_BARS} battute: sezioni finali tolte")
            break
        bars = min(sec.bars, MAX_BARS - used)
        sections.append(sec.model_copy(update={"bars": bars}))
        used += bars

    project = FlipProject(
        bpm=recipe.bpm, bars=max(1, used), beats_per_bar=bpb, source_key=structure.key,
        transpose=float(recipe.transpose), tracks=[], chords=[], markers=[],
    )
    tracks: dict[str, FlipTrack] = {}

    def audio_track(name: str, follow: bool) -> FlipTrack | None:
        if name not in tracks:
            if len(project.tracks) >= 16:
                return None
            t = FlipTrack(id=_uid(rng), name=name, kind="audio", follow_key=follow)
            tracks[name] = t
            project.tracks.append(t)
        return tracks[name]

    no_stems_noted = missing_noted = False
    at = 0.0
    for i, sec in enumerate(sections):
        length = sec.bars * bpb
        project.markers.append(ChordMark(start=at, end=at + length, name=sec.name or f"parte {i + 1}"))

        # ---- samples from the original
        keep = list(dict.fromkeys(sec.keep))
        if keep and not has_stems:
            keep = ["mix"]
            if not no_stems_noted:
                notes.append("stems non separati: uso il mix intero al posto delle singole parti")
                no_stems_noted = True
        if keep and sec.sample != "none" and structure.sections and structure.downbeats:
            src, found = _find_section(structure.sections, sec.sample)
            if not found and not missing_noted:
                notes.append(f"nessuna sezione «{sec.sample}» nell'originale: uso il ritornello")
                missing_noted = True
            n = max(1, min(sec.sample_bars, src.bar_end - src.bar_start, sec.bars))
            db = structure.downbeats
            t0 = db[src.bar_start - 1] if src.bar_start - 1 < len(db) else src.start
            t1 = db[src.bar_start - 1 + n] if src.bar_start - 1 + n < len(db) else src.end
            if t1 > t0:
                for source in keep:
                    t = audio_track(TRACK_NAME[source], source != "drums")
                    if t is None:
                        continue
                    clip = FlipClip(
                        id=_uid(rng), source=source, src_start=round(t0, 3), src_end=round(t1, 3),
                        src_beats=float(n * bpb), at_beat=at, length_beats=float(length), loop=True,
                        fade_in_ms=400.0 if sec.energy == "low" and i == 0 else 5.0,
                    )
                    if source in ("vocals", "other", "mix"):
                        clip = _apply_fx(clip, sec.fx)
                    t.clips.append(clip)
                    if "harmony" in sec.fx and source == "vocals":
                        h = audio_track(HARMONY_TRACK, True)
                        if h is not None:
                            h.gain_db = -5.0
                            h.clips.append(clip.model_copy(update={"id": _uid(rng), "harmony": 2}))

        # ---- generated parts (after the clips: harmony "song" reads them)
        if sec.parts:
            res = generate(
                GenerateRequest(
                    track_id=track_id, project=project, style=recipe.style, harmony=recipe.harmony,
                    mood=recipe.mood, parts=list(dict.fromkeys(sec.parts)),
                    start_bar=int(at // bpb) + 1, bars=sec.bars, seed=(seed * 31 + i) % (2**31 - 1),
                ),
                energy=ENERGY_LEVEL[sec.energy],
            )
            for g in res.tracks:
                key = f"{g.kind}:{g.name}"
                if key in tracks:
                    tracks[key].patterns.extend(g.patterns)
                elif len(project.tracks) < 16:
                    tracks[key] = g
                    project.tracks.append(g)
            project.chords.extend(res.chords)
        at += length

    # Generated tracks after the audio ones.
    project.tracks.sort(key=lambda t: t.kind != "audio")
    return FlipProject.model_validate(project.model_dump()), notes
