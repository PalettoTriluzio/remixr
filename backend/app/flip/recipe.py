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
The Builder is shared with app/flip/edit.py (AI edits of an existing flip).
"""
from __future__ import annotations

import random

from app.analysis.structure import structure_for
from app.flip.generate import ENERGY_LEVEL, generate
from app.models import (
    FlipClip, FlipProject, FlipRecipe, FlipTrack, GenerateRequest, Marker, Section, Sidechain, AutoPoint,
)
from app.storage import find_stems

MAX_BARS = 128
TRACK_NAME = {"vocals": "Voce", "drums": "Batteria", "bass": "Basso", "other": "Altro", "mix": "Campione"}
HARMONY_TRACK = "Voce armonia"
FX_FIELDS = ("lp_freq", "hp_freq", "reverse", "gate", "gate_duty", "semitones", "tune")


def uid(rng: random.Random) -> str:
    return "".join(rng.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(8))


def find_section(sections: list[Section], name: str) -> tuple[Section, bool]:
    """(section, found as asked). auto / missing name → the chorus."""
    if name not in ("auto", "none"):
        hit = next((s for s in sections if s.name == name), None)
        if hit:
            return hit, True
    chorus = next((s for s in sections if s.name == "ritornello"), None)
    return chorus or max(sections, key=lambda s: s.energy), name == "auto"


def apply_fx(clip: FlipClip, fx: list[str]) -> FlipClip:
    """Effects of a recipe on a clip; previous effects are reset first."""
    base = FlipClip.model_fields
    upd: dict = {f: base[f].default for f in FX_FIELDS}
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


class Builder:
    """Adds sampled clips and generated parts to a project (mutated in place)."""

    def __init__(self, track_id: str, project: FlipProject, seed: int, notes: list[str]):
        structure = structure_for(track_id)
        if structure is None:
            raise FileNotFoundError("Track not found")
        self.track_id = track_id
        self.project = project
        self.structure = structure
        self.has_stems = find_stems(track_id) is not None
        self.rng = random.Random(seed)
        self.notes = notes
        self._noted: set[str] = set()

    def note(self, text: str) -> None:
        if text not in self._noted:
            self._noted.add(text)
            self.notes.append(text)

    def track(self, kind: str, name: str) -> FlipTrack | None:
        return next((t for t in self.project.tracks if t.kind == kind and t.name == name), None)

    def audio_track(self, name: str, follow: bool) -> FlipTrack | None:
        t = self.track("audio", name)
        if t is None:
            if len(self.project.tracks) >= 16:
                self.note("massimo 16 tracce: alcune parti non sono state aggiunte")
                return None
            t = FlipTrack(id=uid(self.rng), name=name, kind="audio", follow_key=follow)
            self.project.tracks.append(t)
        return t

    def samples(self, at: float, bars: int, sample: str, sample_bars: int, keep: list[str], fx: list[str],
                fade_in: bool = False) -> None:
        """One looped clip per kept source over [at, at + bars)."""
        st = self.structure
        keep = list(dict.fromkeys(keep))
        if keep and not self.has_stems:
            keep = ["mix"]
            self.note("stems non separati: uso il mix intero al posto delle singole parti")
        if not keep or sample == "none" or not st.sections or not st.downbeats:
            return
        bpb = self.project.beats_per_bar
        src, found = find_section(st.sections, sample)
        if not found:
            self.note(f"nessuna sezione «{sample}» nell'originale: uso il ritornello")
        n = max(1, min(sample_bars, src.bar_end - src.bar_start, bars))
        db = st.downbeats
        t0 = db[src.bar_start - 1] if src.bar_start - 1 < len(db) else src.start
        t1 = db[src.bar_start - 1 + n] if src.bar_start - 1 + n < len(db) else src.end
        if t1 <= t0:
            return
        for source in keep:
            t = self.audio_track(TRACK_NAME[source], source != "drums")
            if t is None:
                continue
            clip = FlipClip(
                id=uid(self.rng), source=source, src_start=round(t0, 3), src_end=round(t1, 3),
                src_beats=float(n * bpb), at_beat=at, length_beats=float(bars * bpb), loop=True,
                fade_in_ms=400.0 if fade_in else 5.0,
            )
            if source in ("vocals", "other", "mix"):
                clip = apply_fx(clip, fx)
            t.clips.append(clip)
            if "harmony" in fx and source == "vocals":
                h = self.audio_track(HARMONY_TRACK, True)
                if h is not None:
                    h.gain_db = -5.0
                    h.clips.append(clip.model_copy(update={"id": uid(self.rng), "harmony": 2}))

    def parts(self, at: float, bars: int, parts: list[str], style: str, mood: str, harmony: str,
              seed: int, energy: float | None) -> None:
        """Generated parts over [at, at + bars); patterns join same-name tracks."""
        if not parts:
            return
        bpb = self.project.beats_per_bar
        res = generate(
            GenerateRequest(
                track_id=self.track_id, project=self.project, style=style, harmony=harmony, mood=mood,
                parts=list(dict.fromkeys(parts)), start_bar=int(at // bpb) + 1, bars=bars,
                seed=seed % (2**31 - 1),
            ),
            energy=energy,
        )
        for g in res.tracks:
            t = self.track(g.kind, g.name)
            if t is not None:
                t.patterns.extend(g.patterns)
            elif len(self.project.tracks) < 16:
                self.project.tracks.append(g)
            else:
                self.note("massimo 16 tracce: alcune parti non sono state aggiunte")
        self.project.chords = sorted(
            [c for c in self.project.chords if c.end <= at or c.start >= at + bars * bpb] + res.chords,
            key=lambda c: c.start,
        )

    def finish(self) -> FlipProject:
        """Generated tracks after the audio ones; revalidated."""
        self.project.tracks.sort(key=lambda t: t.kind != "audio")
        return FlipProject.model_validate(self.project.model_dump())


def build(track_id: str, recipe: FlipRecipe, seed: int) -> tuple[FlipProject, list[str]]:
    structure = structure_for(track_id)
    if structure is None:
        raise FileNotFoundError("Track not found")
    notes: list[str] = []
    bpb = structure.beats_per_bar

    sections = []
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
    b = Builder(track_id, project, seed, notes)
    at = 0.0
    for i, sec in enumerate(sections):
        length = sec.bars * bpb
        project.markers.append(Marker(start=at, end=at + length, name=sec.name or f"parte {i + 1}",
                                      energy=ENERGY_LEVEL[sec.energy]))
        b.samples(at, sec.bars, sec.sample, sec.sample_bars, sec.keep, sec.fx, fade_in=sec.energy == "low" and i == 0)
        b.parts(at, sec.bars, sec.parts, recipe.style, recipe.mood, recipe.harmony, seed * 31 + i, ENERGY_LEVEL[sec.energy])
        at += length

    _producer_touches(project, recipe, sections, bpb)
    return b.finish(), notes


def _producer_touches(project: FlipProject, recipe: FlipRecipe, sections: list, bpb: int) -> None:
    """Automation/sidechain a producer would add: the filter opens over a quiet
    intro, chords/bass pump on the kick in four-on-the-floor styles."""
    gen = [t for t in project.tracks if t.kind != "audio"]
    if sections and sections[0].energy == "low" and sections[0].parts and len(sections) > 1:
        end = sections[0].bars * bpb
        for t in gen:
            if t.kind != "drums":
                t.automation["lowpass"] = [AutoPoint(beat=0.0, value=0.35), AutoPoint(beat=float(end), value=1.0)]
    beat = next((t for t in gen if t.kind == "drums"), None)
    if beat is not None and recipe.style in ("house", "afro", "pop"):
        for t in gen:
            if t.kind == "keys" or (t.kind == "bass" and recipe.style == "house"):
                t.sidechain = Sidechain(enabled=True, source=beat.id, amount_db=7.0, release_ms=160.0)
