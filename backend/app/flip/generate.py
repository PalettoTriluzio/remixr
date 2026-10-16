"""Procedural instrumental for a flip: drums, bass, chords, arpeggio.

Deterministic for a given seed. Everything is written as patterns/notes
(PatternClip) so the user can edit it afterwards; the sound comes from
app/flip/instruments.py at render time.

Mood (dark, sad, epic, happy, dreamy, or auto = read from the song and from
the sections the clips come from) shapes everything through a Feel: drum
density/rolls/velocity, bass movement, voicing register and extensions,
filter brightness, reverb/delay space, 808 grit.

Harmony:
  song  the chords of the original that sound under the audio clips placed in
        the range (mapped through each clip's stretch/loop/reverse/pitch), so
        the new beat fits the vocal; quantised to half bars
  new   a 4-bar progression in the key of the original, chosen by mood
Notes are written in the key of the original: the project's transpose is
added at render time, like for audio clips.
"""
from __future__ import annotations

import math
import random
from collections import Counter
from dataclasses import dataclass

from app.analysis.features import _PITCH_CLASSES as PCS
from app.analysis.mood import MOOD_LABEL, mood_for, pick_mood
from app.analysis.structure import structure_for
from app.flip.tune import _FLATS
from app.models import (
    DRUM_VOICES, ChordMark, EffectChain, FlipProject, FlipTrack, GenerateRequest, GenerateResponse,
    Instrument, Note, PatternClip,
)

STYLES = {
    #            label        kit        swing  half-time? bass         keys    arp     typical bpm  7ths
    "trap":      ("Trap",      "trap",    0.0,  True,  "808",        "pad",  "bell",  140, False),
    "drill":     ("Drill",     "trap",    0.0,  True,  "808",        "pad",  "bell",  142, False),
    "boombap":   ("Boom bap",  "boombap", 0.12, False, "pluck_bass", "keys", "pluck", 90,  True),
    "lofi":      ("Lo-fi",     "lofi",    0.18, False, "sub",        "keys", "bell",  80,  True),
    "house":     ("House",     "house",   0.04, False, "pluck_bass", "keys", "pluck", 124, True),
    "reggaeton": ("Reggaeton", "trap",    0.0,  False, "808",        "pluck", "pluck", 95, False),
    "afro":      ("Afro",      "afro",    0.08, False, "sub",        "keys", "pluck", 105, True),
    "pop":       ("Pop",       "house",   0.0,  False, "pluck_bass", "pad",  "pluck", 118, False),
}

# 4-bar progressions: (semitones from the tonic, minor?)
PROGRESSIONS = {
    "minor": {
        "dark":   [(0, True), (8, False), (3, False), (10, False)],   # i VI III VII
        "sad":    [(0, True), (5, True), (8, False), (7, False)],     # i iv VI V
        "epic":   [(0, True), (10, False), (8, False), (10, False)],  # i VII VI VII
        "dreamy": [(0, True), (3, False), (10, False), (5, True)],    # i III VII iv
        "happy":  [(8, False), (10, False), (0, True), (0, True)],    # VI VII i i
    },
    "major": {
        "happy":  [(0, False), (7, False), (9, True), (5, False)],    # I V vi IV
        "sad":    [(9, True), (5, False), (0, False), (7, False)],    # vi IV I V
        "epic":   [(5, False), (7, False), (9, True), (0, False)],    # IV V vi I
        "dreamy": [(0, False), (4, True), (5, False), (5, True)],     # I iii IV iv
        "dark":   [(9, True), (4, True), (5, False), (7, False)],     # vi iii IV V
    },
}

# Base feel per mood: density (drums, arp), energy (velocity, rhythm),
# bright (filters, register), space (reverb/delay), grit (808 drive).
MOOD_FEEL = {
    "dark":   dict(density=0.6,  energy=0.65, bright=0.25, space=0.35, grit=0.8),
    "sad":    dict(density=0.35, energy=0.35, bright=0.4,  space=0.6,  grit=0.3),
    "epic":   dict(density=0.75, energy=0.85, bright=0.6,  space=0.55, grit=0.6),
    "happy":  dict(density=0.65, energy=0.7,  bright=0.8,  space=0.3,  grit=0.25),
    "dreamy": dict(density=0.3,  energy=0.3,  bright=0.55, space=0.8,  grit=0.1),
}
ENERGY_LEVEL = {"low": 0.25, "mid": 0.55, "high": 0.85}


@dataclass
class Feel:
    mood: str
    density: float
    energy: float
    bright: float
    space: float
    grit: float
    source: str  # why this mood, for the explanation


@dataclass
class Chord:
    start: float  # beats from the start of the range
    end: float
    root: int     # pitch class
    minor: bool

    @property
    def name(self) -> str:
        return PCS[self.root] + ("m" if self.minor else "")


def _uid(rng: random.Random) -> str:
    return "".join(rng.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(8))


# ---------------------------------------------------------------- drums

def _empty() -> tuple[dict[str, list[float]], dict[str, list[int]]]:
    return {v: [0.0] * 16 for v in DRUM_VOICES}, {v: [0] * 16 for v in DRUM_VOICES}


def _groove(style: str, rng: random.Random, feel: Feel) -> dict:
    """Per-generation choices, so every bar of one beat belongs together."""
    kicks = {
        "trap": [[0, 10], [0, 7, 10], [0, 3, 10], [0, 10, 13], [0, 6, 10, 14]],
        "drill": [[0, 6, 11], [0, 3, 11], [0, 6, 10], [0, 11]],
        "boombap": [[0, 10], [0, 7, 10], [0, 3, 10], [0, 6, 10, 11]],
        "lofi": [[0, 10], [0, 7, 9], [0, 3, 10]],
        "afro": [[0, 7, 10], [0, 10], [0, 6, 10]],
        "pop": [[0, 8], [0, 6, 8], [0, 8, 10]],
    }.get(style, [[0, 4, 8, 12]])
    # Calm moods take the sparser kick patterns, intense ones the busier.
    kicks = sorted(kicks, key=len)
    half = max(1, (len(kicks) + 1) // 2)
    if feel.density < 0.4:
        kicks = kicks[:half]
    elif feel.density > 0.7:
        kicks = kicks[len(kicks) - half:]
    a = rng.choice(kicks)
    b = rng.choice([k for k in kicks if k != a] or [a])
    n_rolls = 1 if feel.density < 0.45 else 2 if feel.density < 0.75 else 3
    return {
        "kick_a": a,
        "kick_b": b,
        "hat_div": 1 if rng.random() < feel.density else 2,
        "roll_spots": rng.sample([3, 6, 11, 14, 15], n_rolls),
        "roll_p": 0.35 + 0.55 * feel.density,
        "ghost": 0.2 + 0.6 * feel.density,
        "open": rng.random() < 0.25 + 0.5 * feel.energy,
        "busy": rng.random() < feel.density,
        "vel": 0.85 + 0.2 * feel.energy,
    }


def _bar(style: str, g: dict, rng: random.Random, idx: int, fill: bool):
    L, R = _empty()

    def put(voice: str, steps, vel: float = 0.9):
        for s in steps:
            if 0 <= s < 16:
                L[voice][s] = max(L[voice][s], vel)

    kick = g["kick_a"] if idx % 2 == 0 else g["kick_b"]

    if style in ("trap", "drill"):
        put("kick", [0] if fill else kick, 1.0)
        put("clap", [8], 1.0)
        put("snare", [8], 0.7)
        if style == "trap":
            for s in range(0, 16, g["hat_div"]):
                put("hat", [s], 0.75 if s % 4 == 0 else 0.55)
            for s in g["roll_spots"]:
                if rng.random() < g["roll_p"]:
                    put("hat", [s], 0.6)
                    R["hat"][s] = rng.choice([2, 3, 4, 6])
            if rng.random() < 0.25:
                L["hat"][14] = 0.0
                put("open_hat", [14], 0.6)
        else:
            put("hat", [0, 3, 6, 8, 11, 14], 0.7)
            if rng.random() < 0.5:
                R["hat"][10] = 3
                put("hat", [10], 0.55)
            if idx % 2 == 1:
                put("snare", [15], 0.7)
            if rng.random() < 0.4:
                put("rim", [7], 0.5)
        if fill:
            for s, v in zip((12, 13, 14, 15), (0.5, 0.6, 0.7, 0.85)):
                put("snare", [s], v)
            put("hat", [12], 0.6)
            R["hat"][12] = 6
    elif style in ("boombap", "lofi"):
        put("kick", [0, 10] if fill else kick, 1.0)
        snare = "rim" if style == "lofi" and g["open"] else "snare"
        put(snare, [4, 12], 1.0 if style == "boombap" else 0.75)
        hi, lo = (0.8, 0.55) if style == "boombap" else (0.5, 0.35)
        for s in range(0, 16, 2):
            put("hat", [s], hi if s % 4 == 0 else lo)
        if rng.random() < g["ghost"]:
            put("snare", [rng.choice([7, 15])], 0.35)  # ghost
        if style == "lofi" and g["busy"]:
            put("perc", [s for s in range(1, 16, 2)], 0.2)
        if rng.random() < 0.2:
            L["hat"][10] = 0.0
            put("open_hat", [10], 0.5)
        if fill:
            put("snare", [14], 0.6)
            put("snare", [15], 0.8)
    elif style == "house":
        put("kick", [0, 4, 8, 12], 1.0)
        put("clap", [4, 12], 0.9)
        put("open_hat" if g["open"] else "hat", [2, 6, 10, 14], 0.7)
        if g["busy"]:
            put("hat", [s for s in range(1, 16, 2)], 0.25)
        if rng.random() < 0.5:
            put("perc", [3, 11], 0.4)
        if fill:
            for s, v in zip((12, 13, 14, 15), (0.5, 0.6, 0.75, 0.9)):
                put("clap", [s], v)
    elif style == "reggaeton":
        put("kick", [0, 4, 8, 12], 1.0)
        put("snare", [3, 6, 11, 14], 0.85)
        put("hat", list(range(0, 16, 2)), 0.5)
        if fill:
            put("snare", [12, 13, 14, 15], 0.7)
    elif style == "afro":
        put("kick", [0, 10] if fill else kick, 1.0)
        put("rim", [0, 3, 6, 10, 12], 0.6)
        put("clap", [4, 12], 0.6)
        for s in range(16):
            put("perc", [s], 0.5 if s % 4 == 2 else 0.22)
        if fill:
            put("rim", [13, 14, 15], 0.7)
    else:  # pop
        put("kick", [0, 8] if fill else kick, 1.0)
        put("snare", [4, 12], 1.0)
        put("hat", list(range(0, 16, 2)), 0.6)
        if rng.random() < 0.3:
            L["hat"][14] = 0.0
            put("open_hat", [14], 0.55)
        if fill:
            put("snare", [14, 15], 0.75)

    # Mood energy scales the velocities; humanise a little.
    for v in L.values():
        for i, x in enumerate(v):
            if x > 0:
                v[i] = round(min(1.0, max(0.1, x * g["vel"] + rng.uniform(-0.06, 0.06))), 2)
    return L, R


def _drum_pattern(style: str, rng: random.Random, bars: int, bpb: int, spb: int, feel: Feel):
    """lanes/rolls for `bars` project bars. A style bar is 16 steps; on the
    32nd grid (half-time styles at slow tempos) two of them fit in a bar."""
    g = _groove(style, rng, feel)
    total = bars * bpb * spb
    style_bars = math.ceil(total / 16)
    lanes = {v: [] for v in DRUM_VOICES}
    rolls = {v: [] for v in DRUM_VOICES}
    for i in range(style_bars):
        L, R = _bar(style, g, rng, i, fill=(i == style_bars - 1 and style_bars >= 4))
        for v in DRUM_VOICES:
            lanes[v] += L[v]
            rolls[v] += R[v]
    lanes = {v: x[:total] for v, x in lanes.items() if any(x[:total])}
    rolls = {v: x[:total] for v, x in rolls.items() if any(r > 1 for r in x[:total])}
    return lanes, rolls


# ---------------------------------------------------------------- harmony

def _parse_key(key: str) -> tuple[int, bool]:
    parts = key.strip().split()
    tonic = _FLATS.get(parts[0], parts[0]) if parts else "C"
    return (PCS.index(tonic) if tonic in PCS else 0), (len(parts) > 1 and parts[1].lower() == "minor")


def _parse_chord(name: str) -> tuple[int, bool] | None:
    if not name or name == "N":
        return None
    minor = name.endswith("m")
    root = name[:-1] if minor else name
    root = _FLATS.get(root, root)
    return (PCS.index(root), minor) if root in PCS else None


def _new_progression(key: str, mood: str, beats: float, bpb: int) -> tuple[list[Chord], float]:
    tonic, minor = _parse_key(key)
    prog = PROGRESSIONS["minor" if minor else "major"][mood]
    cycle = min(len(prog), max(1, int(beats // bpb))) * bpb
    chords = [Chord(i * bpb, (i + 1) * bpb, (tonic + o) % 12, m) for i, (o, m) in enumerate(prog) if i * bpb < cycle]
    return chords, float(cycle)


def _song_chords(req: GenerateRequest, b0: float, b1: float) -> list[Chord] | None:
    """Chords of the original heard under the audio clips in [b0, b1)."""
    structure = structure_for(req.track_id)
    if structure is None or not structure.chords:
        return None
    spans = structure.chords
    p = req.project
    beat_sec = 60.0 / p.bpm
    weight = {"vocals": 1.0, "mix": 1.0, "other": 1.5, "bass": 1.5}

    def chord_at(t: float) -> tuple[int, bool] | None:
        for c in spans:
            if c.start <= t < c.end:
                return _parse_chord(c.chord)
        return None

    per_beat: list[tuple[int, bool] | None] = []
    for k in range(int(math.ceil(b1 - b0))):
        pos = b0 + k + 0.5
        votes: Counter = Counter()
        for track in p.tracks:
            if track.kind != "audio" or not track.follow_key or track.mute:
                continue
            for clip in track.clips:
                if clip.source == "drums" or not (clip.at_beat <= pos < clip.at_beat + clip.length_beats):
                    continue
                cycle = clip.src_beats if clip.loop else clip.length_beats
                rel = (pos - clip.at_beat) % cycle if clip.loop else pos - clip.at_beat
                frac = rel / cycle
                if clip.reverse:
                    frac = 1 - frac
                t = clip.src_start + frac * (clip.src_end - clip.src_start)
                shift = clip.semitones
                if clip.stretch == "repitch":
                    shift += 12 * math.log2(max(1e-6, (clip.src_end - clip.src_start) / (cycle * beat_sec)))
                ch = chord_at(t)
                if ch:
                    votes[((ch[0] + round(shift)) % 12, ch[1])] += weight.get(clip.source, 1.0)
        per_beat.append(votes.most_common(1)[0][0] if votes else None)

    if not any(per_beat):
        return None
    # Half-bar slots, majority vote; holes take the previous chord (or the next).
    slot = 2
    slots: list[tuple[int, bool] | None] = []
    for i in range(0, len(per_beat), slot):
        c = Counter(x for x in per_beat[i:i + slot] if x)
        slots.append(c.most_common(1)[0][0] if c else None)
    last = next(x for x in slots if x)
    for i, x in enumerate(slots):
        if x is None:
            slots[i] = last
        else:
            last = x
    chords: list[Chord] = []
    for i, (root, minor) in enumerate(slots):
        start, end = i * slot, min((i + 1) * slot, b1 - b0)
        if chords and chords[-1].root == root and chords[-1].minor == minor:
            chords[-1].end = end
        else:
            chords.append(Chord(start, end, root, minor))
    return chords


def _chord_at(chords: list[Chord], cycle: float, beat: float) -> Chord:
    b = beat % cycle
    for c in chords:
        if c.start <= b < c.end:
            return c
    return chords[-1]


def _voicing(ch: Chord, prev: list[int] | None, seventh: bool, low: int = 52, high: int = 77, add9: bool = False) -> list[int]:
    ints = [0, 3 if ch.minor else 4, 7] + ([10 if ch.minor else 11] if seventh else []) + ([2] if add9 else [])
    pcs = [(ch.root + i) % 12 for i in ints]
    best, best_score = None, 1e9
    for rot in range(len(pcs)):
        order = pcs[rot:] + pcs[:rot]
        for base in range(low, low + 12):
            notes, cur = [], base - 1
            for pc in order:
                cur += 1
                while cur % 12 != pc:
                    cur += 1
                notes.append(cur)
            if notes[-1] > high:
                continue
            if prev and len(prev) == len(notes):
                score = sum(abs(a - b) for a, b in zip(sorted(notes), sorted(prev)))
            else:
                score = abs(sum(notes) / len(notes) - 64)
            if score < best_score:
                best, best_score = notes, score
    return best or [60 + (ch.root % 12) + i for i in ints]


def _bass_pitch(root: int) -> int:
    m = 24 + root  # C1 = 24
    return m + 12 if m < 28 else m


# ---------------------------------------------------------------- parts

def _bass_notes(style: str, chords: list[Chord], cycle: float, total: float, kicks: list[float], rng: random.Random, feel: Feel) -> list[Note]:
    notes: list[Note] = []
    vel = round(0.72 + 0.25 * feel.energy, 2)
    if style in ("trap", "drill", "reggaeton", "boombap", "lofi"):
        hits = sorted(set(k for k in kicks if k < total)) or [b for b in range(0, int(total), 4)]
        if feel.energy < 0.35:
            # Calm: the bass holds on the downbeats instead of chasing every kick.
            hits = [h for h in hits if h % 4 == 0] or hits
        for i, b in enumerate(hits):
            nxt = hits[i + 1] if i + 1 < len(hits) else total
            gap = nxt - b
            if style in ("trap", "drill"):
                length = min(gap, 2.0)
            elif style == "reggaeton":
                length = min(gap, 0.5)
            else:
                length = min(gap * 0.75, 1.0)
            pitch = _bass_pitch(_chord_at(chords, cycle, b).root)
            if style == "drill" and rng.random() < 0.2:
                pitch += 12  # slide up an octave (glide does the rest)
            notes.append(Note(start=b, length=max(0.125, length), pitch=pitch, vel=vel))
    elif style == "house":
        for b in [x + 0.5 for x in range(int(total))]:
            root = _bass_pitch(_chord_at(chords, cycle, b).root)
            notes.append(Note(start=b, length=0.4, pitch=root + (12 if int(b) % 2 else 0), vel=vel))
    else:  # afro, pop: syncopated 3-3-2
        for bar in range(int(math.ceil(total / 4))):
            for off, ln in ((0, 1.25), (1.5, 1.0), (3.0, 0.75)):
                b = bar * 4 + off
                if b < total:
                    notes.append(Note(start=b, length=ln, pitch=_bass_pitch(_chord_at(chords, cycle, b).root), vel=vel))
    return notes


def _chord_notes(style: str, chords: list[Chord], seventh: bool, feel: Feel) -> list[Note]:
    notes: list[Note] = []
    prev = None
    # Bright moods sit higher; dreamy/sad get colour notes; epic gets the root
    # doubled an octave below (open, big).
    low = 48 + round(10 * feel.bright)
    seventh = seventh or feel.mood in ("dreamy", "sad")
    add9 = feel.mood == "dreamy"
    vel = round(0.55 + 0.25 * feel.energy, 2)
    for ch in chords:
        voicing = _voicing(ch, prev, seventh, low, low + 25, add9)
        prev = voicing
        if feel.mood == "epic":
            r = min(voicing) - ((min(voicing) - ch.root) % 12 or 12)
            if r >= 36:
                voicing = [r] + voicing
        dur = ch.end - ch.start
        if style == "house":
            hits = [(b + 0.5, 0.3) for b in range(int(ch.start), int(math.ceil(ch.end)))]
        elif style == "reggaeton":
            hits = [(ch.start + o, 0.35) for bar in range(int(math.ceil(dur / 4))) for o in (bar * 4 + 0.75, bar * 4 + 1.5, bar * 4 + 2.75, bar * 4 + 3.5)]
        elif style == "afro":
            hits = [(ch.start + o, 0.5) for bar in range(int(math.ceil(dur / 4))) for o in (bar * 4, bar * 4 + 1.5, bar * 4 + 2.5)]
        elif style == "pop" and feel.energy > 0.65:
            hits = [(ch.start + o, 0.9) for o in range(int(math.ceil(dur)))]  # driving quarter notes
        else:
            hits = [(ch.start, dur)]
        for start, ln in hits:
            if start >= ch.end:
                continue
            for p in voicing:
                notes.append(Note(start=start, length=min(ln, ch.end - start), pitch=p, vel=vel))
    return notes


def _arp_notes(style: str, chords: list[Chord], rng: random.Random, feel: Feel) -> list[Note]:
    step = 0.25 if style in ("house", "pop", "afro") or feel.energy > 0.75 else 0.5
    shape = rng.choice(["up", "updown", "random"])
    rest = (0.25 if style in ("trap", "drill", "lofi") else 0.12) + 0.3 * (1 - feel.density)
    vel = round(0.5 + 0.25 * feel.energy, 2)
    notes: list[Note] = []
    prev = None
    for ch in chords:
        tones = _voicing(ch, prev, False, 64, 88)
        prev = tones
        seq = tones + [tones[0] + 12]
        if shape == "updown":
            seq = seq + seq[-2:0:-1]
        i, b = 0, ch.start
        while b < ch.end - 1e-6:
            if rng.random() >= rest:
                p = rng.choice(seq) if shape == "random" else seq[i % len(seq)]
                notes.append(Note(start=round(b, 4), length=step * 0.9, pitch=p, vel=vel))
            i += 1
            b += step
    return notes


# ---------------------------------------------------------------- mood

def _section_energy(req: GenerateRequest, b0: float, b1: float) -> float | None:
    """Energy (0..1, relative to the loudest section) of the parts of the
    original that the audio clips in [b0, b1) come from, weighted by overlap."""
    structure = structure_for(req.track_id)
    if structure is None or not structure.sections:
        return None
    total = acc = 0.0
    for track in req.project.tracks:
        if track.kind != "audio" or track.mute:
            continue
        for clip in track.clips:
            overlap = min(clip.at_beat + clip.length_beats, b1) - max(clip.at_beat, b0)
            if overlap <= 0:
                continue
            t = (clip.src_start + clip.src_end) / 2
            sec = next((x for x in structure.sections if x.start <= t < x.end), structure.sections[-1])
            acc += sec.energy * overlap
            total += overlap
    return acc / total if total > 0 else None


def resolve_feel(req: GenerateRequest, b0: float, b1: float, energy: float | None = None) -> Feel:
    """Mood → Feel. auto = from the song's profile and the sections in use.
    A chosen mood is still coloured by the song (brightness, energy).
    `energy` (0..1) overrides the energy, e.g. a recipe's quiet intro."""
    try:
        profile = mood_for(req.track_id)
    except Exception:  # noqa: BLE001 — the analysis is a nice-to-have
        profile = None
    local = _section_energy(req, b0, b1)
    song_energy = None
    if profile is not None:
        song_energy = profile.energy if local is None else 0.5 * profile.energy + 0.5 * local

    if req.mood != "auto":
        mood, source = req.mood, "scelto"
    elif profile is not None:
        mood = pick_mood(profile.valence, song_energy)
        source = "dalla canzone: " + profile.description
        if local is not None:
            source += f"; la parte che usi ha energia {round(local * 100)}%"
    else:
        mood, source = "dark", "analisi del mood non riuscita, uso scuro"

    f = Feel(mood=mood, source=source, **MOOD_FEEL[mood])
    if profile is not None:
        f.bright = 0.6 * f.bright + 0.4 * profile.brightness
        f.energy = 0.6 * f.energy + 0.4 * song_energy
        f.density = 0.7 * f.density + 0.3 * song_energy
    if energy is not None:
        f.energy = energy
        f.density = 0.4 * f.density + 0.6 * energy
    return f


# ---------------------------------------------------------------- entry point

def _chain(**fx) -> EffectChain:
    c = EffectChain()
    for k, v in fx.items():
        setattr(c, k, getattr(c, k).model_copy(update=v))
    return c


def generate(req: GenerateRequest, energy: float | None = None) -> GenerateResponse:
    """`energy` (0..1): internal override used by the recipe builder."""
    p: FlipProject = req.project
    rng = random.Random(req.seed)
    label, kit, swing, half_time, bass_preset, keys_preset, arp_preset, typical, seventh = STYLES[req.style]
    bpb = p.beats_per_bar
    b0 = (req.start_bar - 1) * bpb
    bars = max(1, min(req.bars, p.bars - req.start_bar + 1))
    total = bars * bpb
    beat_ms = 60000.0 / p.bpm
    feel = resolve_feel(req, b0, b0 + total, energy)

    # Half-time styles (trap, drill) at slow tempos: 32nd-note grid.
    half = 2 if half_time and p.bpm < 100 else 1
    spb = 4 * half
    pattern_bars = min(4, bars)
    lanes, rolls = _drum_pattern(req.style, rng, pattern_bars, bpb, spb, feel)
    cycle_beats = pattern_bars * bpb
    kick_cycle = [s / spb for s, v in enumerate(lanes.get("kick", [])) if v > 0]
    kicks = [c * cycle_beats + k for c in range(int(math.ceil(total / cycle_beats))) for k in kick_cycle]

    harmony_note = ""
    chords = _song_chords(req, b0, b0 + total) if req.harmony == "song" else None
    if chords:
        chord_cycle = float(total)
        harmony_note = "accordi della canzone sotto le clip"
    else:
        chords, chord_cycle = _new_progression(p.source_key, feel.mood, total, bpb)
        harmony_note = (
            ("nessuna clip con accordi nel range: " if req.harmony == "song" else "")
            + f"progressione nuova ({MOOD_LABEL[feel.mood]}) in {p.source_key}"
        )

    tracks: list[FlipTrack] = []

    def track(name: str, kind: str, inst: Instrument, clip: PatternClip, gain: float, chain: EffectChain | None = None, follow=True):
        tracks.append(FlipTrack(
            id=_uid(rng), name=name, kind=kind, instrument=inst, gain_db=gain, follow_key=follow,
            chain=chain or EffectChain(), patterns=[clip],
        ))

    if swing > 0:
        swing = min(0.5, swing + 0.05 * feel.space)
    if feel.bright > 0.65:
        arp_preset = "bell"
    elif feel.bright < 0.35:
        arp_preset = "pluck"

    if "drums" in req.parts:
        track("Beat", "drums", Instrument(kit=kit, decay=1.0),
              PatternClip(id=_uid(rng), at_beat=b0, length_beats=total, pattern_beats=cycle_beats,
                          steps_per_beat=spb, lanes=lanes, rolls=rolls, swing=swing),
              -2.0, follow=False)

    if "bass" in req.parts:
        inst = Instrument(preset=bass_preset,
                          decay=(1.4 + 0.8 * feel.space) if req.style in ("trap", "drill") else 0.6,
                          glide_ms=70.0 if req.style == "drill" else 0.0,
                          drive_db=round(2.0 + 10.0 * feel.grit, 1) if bass_preset == "808" else 0.0,
                          cutoff=round(1000.0 + 1600.0 * feel.bright), release_ms=80.0)
        track("Basso synth", "bass", inst,
              PatternClip(id=_uid(rng), at_beat=b0, length_beats=total, pattern_beats=total,
                          notes=_bass_notes(req.style, chords, chord_cycle, total, kicks, rng, feel), swing=swing),
              -4.0)

    if "chords" in req.parts:
        pad = keys_preset == "pad"
        cutoff = (1200.0 + 4000.0 * feel.bright) if pad else (2500.0 + 6000.0 * feel.bright)
        inst = Instrument(preset=keys_preset, attack_ms=(200.0 + 400.0 * feel.space) if pad else 5.0,
                          release_ms=(500.0 + 900.0 * feel.space) if pad else 250.0,
                          cutoff=round(cutoff), detune=round(0.3 + 0.3 * feel.space, 2))
        track("Accordi", "keys", inst,
              PatternClip(id=_uid(rng), at_beat=b0, length_beats=total, pattern_beats=chord_cycle,
                          notes=_chord_notes(req.style, chords, seventh, feel)),
              -10.0, _chain(hp={"enabled": True, "freq": 180.0},
                            reverb={"enabled": True, "wet": round(0.12 + 0.3 * feel.space, 2),
                                    "room_size": round(0.4 + 0.5 * feel.space, 2)}))

    if "arp" in req.parts:
        inst = Instrument(preset=arp_preset, attack_ms=2.0, release_ms=300.0, cutoff=round(2000.0 + 6000.0 * feel.bright))
        track("Arpeggio", "keys", inst,
              PatternClip(id=_uid(rng), at_beat=b0, length_beats=total, pattern_beats=chord_cycle,
                          notes=_arp_notes(req.style, chords, rng, feel)),
              -13.0, _chain(delay={"enabled": True, "time_ms": min(2000.0, beat_ms * 0.75), "feedback": 0.3,
                                   "mix": round(0.12 + 0.2 * feel.space, 2)},
                            reverb={"enabled": True, "wet": round(0.1 + 0.25 * feel.space, 2)}))

    marks = [ChordMark(start=b0 + c.start + k * chord_cycle, end=b0 + c.end + k * chord_cycle, name=c.name)
             for k in range(int(math.ceil(total / chord_cycle))) for c in chords if c.start + k * chord_cycle < total]
    for m in marks:
        m.end = min(m.end, b0 + total)

    names = " – ".join(dict.fromkeys(c.name for c in chords))
    tempo_note = ""
    if abs(p.bpm - typical) > 25 and not (half == 2 and abs(p.bpm * 2 - typical) <= 25):
        tempo_note = f" Lo stile è tipico intorno ai {typical} BPM."
    explanation = (
        f"{label} a {p.bpm:g} BPM{' (half-time, griglia a 1/32)' if half == 2 else ''} su {bars} battute "
        f"dalla {req.start_bar}: {harmony_note} ({names}). Mood {MOOD_LABEL[feel.mood]} ({feel.source}).{tempo_note}"
    )
    return GenerateResponse(tracks=tracks, chords=marks, explanation=explanation, mood=feel.mood)
