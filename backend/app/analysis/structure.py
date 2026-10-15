"""Musical structure: beat grid with downbeats, sections, chords.

Better with stems: beats come from the drum stem (no vocals/pads smearing the
onsets), chords from bass+other (no vocal melody notes in the chroma). Without
stems it falls back to the mix (+ HPSS for the chords).

All heuristics, no extra models:
  beats      librosa beat tracker on the onset envelope
  downbeats  4/4 assumed; the bar phase (which of every 4 beats is "1") is the
             one where kick energy and harmonic change line up best
  chords     beat-synchronous chroma vs 24 major/minor triads, Viterbi-smoothed
  sections   bar-level self-similarity → checkerboard novelty → boundaries;
             segments with similar material share a letter, and the letters
             get a best-guess name (intro / strofa / ritornello / bridge…)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from app.analysis.features import _PITCH_CLASSES, estimate_key
from app.audio.loader import load_audio

SR = 22050
HOP = 512
BEATS_PER_BAR = 4
MIN_SECTION_BARS = 4


def _load(path: Path) -> np.ndarray:
    samples, _ = load_audio(path, target_sr=SR, mono=True)
    return samples[0]


def _rms(y: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(y)))) if y.size else 0.0


def _z(x: np.ndarray) -> np.ndarray:
    return (x - x.mean()) / (x.std() + 1e-9)


def _unit_cols(m: np.ndarray) -> np.ndarray:
    return m / (np.linalg.norm(m, axis=0, keepdims=True) + 1e-9)


# ---- beats / bars ----

def _beats(perc: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    import librosa
    env = librosa.onset.onset_strength(y=perc, sr=SR, hop_length=HOP, aggregate=np.median)
    _, frames = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, trim=False)
    frames = np.asarray(frames, dtype=int)
    # util.sync pads with frame 0 and the last frame and drops duplicates:
    # beats exactly there would shift every beat-synchronous column by one.
    frames = frames[(frames > 0) & (frames < len(env) - 1)]
    return frames, librosa.frames_to_time(frames, sr=SR, hop_length=HOP)


def _bar_phase(perc: np.ndarray, beat_frames: np.ndarray, beat_chroma: np.ndarray) -> int:
    """Index (0..3) of the first downbeat among the beats."""
    import librosa
    if len(beat_frames) < 2 * BEATS_PER_BAR:
        return 0
    low = librosa.onset.onset_strength(y=perc, sr=SR, hop_length=HOP, fmax=150.0, n_mels=16)
    # Kick near the beat: max over ±2 frames (beat tracker jitter).
    idx = np.clip(beat_frames[:, None] + np.arange(-2, 3)[None, :], 0, len(low) - 1)
    kick = _z(low[idx].max(axis=1))
    # beat_chroma column i+1 = segment starting at beat i (util.sync pads the front).
    c = _unit_cols(beat_chroma)
    change = _z(1.0 - np.sum(c[:, 1:-1] * c[:, :-2], axis=0))
    n = min(len(kick), len(change))
    scores = [kick[p:n:BEATS_PER_BAR].mean() + change[p:n:BEATS_PER_BAR].mean() for p in range(BEATS_PER_BAR)]
    return int(np.argmax(scores))


# ---- chords ----

def _chord_templates() -> tuple[np.ndarray, list[str]]:
    major = np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], dtype=float)
    minor = np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], dtype=float)
    rows, names = [], []
    for root in range(12):
        rows.append(np.roll(major, root)); names.append(_PITCH_CLASSES[root])
        rows.append(np.roll(minor, root)); names.append(_PITCH_CLASSES[root] + "m")
    t = np.array(rows)
    return t / np.linalg.norm(t, axis=1, keepdims=True), names


def _chords(beat_chroma: np.ndarray, seg_rms: np.ndarray, bounds: np.ndarray) -> list[dict]:
    import librosa
    templates, names = _chord_templates()
    scores = templates @ _unit_cols(beat_chroma)  # (24, segments), cosine
    logits = 25.0 * scores
    prob = np.exp(logits - logits.max(axis=0, keepdims=True))
    prob /= prob.sum(axis=0, keepdims=True)
    # Chords tend to last: strong self-transition, smoothed by Viterbi.
    path = librosa.sequence.viterbi(prob, librosa.sequence.transition_loop(len(names), 0.85))
    silent = seg_rms < 0.05 * (seg_rms.max() + 1e-9)

    n = min(len(path), len(bounds) - 1)
    labels = ["N" if silent[j] else names[path[j]] for j in range(n)]
    out: list[dict] = []
    for j, label in enumerate(labels):
        start, end = float(bounds[j]), float(bounds[j + 1])
        if end <= start:
            continue
        if out and out[-1]["chord"] == label:
            out[-1]["end"] = round(end, 3)
        else:
            out.append({"start": round(start, 3), "end": round(end, 3), "chord": label})
    return out


# ---- sections ----

def _novelty(ssm: np.ndarray, w: int) -> np.ndarray:
    """Checkerboard-kernel novelty: nov[i] high when bars before i and from i on differ."""
    n = len(ssm)
    g = np.exp(-0.5 * (np.linspace(-1, 1, 2 * w) * 2) ** 2)
    kernel = np.kron(np.array([[1, -1], [-1, 1]]), np.ones((w, w))) * np.outer(g, g)
    padded = np.pad(ssm, w, mode="edge")
    return np.array([np.sum(kernel * padded[i:i + 2 * w, i:i + 2 * w]) for i in range(n)])


def _boundaries(feats: np.ndarray) -> list[int]:
    """Bar indices where a new section starts (always includes 0)."""
    n = feats.shape[1]
    if n < 2 * MIN_SECTION_BARS:
        return [0]
    f = _unit_cols(feats)
    nov = _novelty(f.T @ f, MIN_SECTION_BARS)
    nov = (nov - nov.min()) / (np.ptp(nov) + 1e-9)
    # Phrases come in groups of 4 bars: nudge boundaries onto them.
    weight = np.where(np.arange(n) % 4 == 0, 1.15, 1.0)
    cand = [i for i in range(MIN_SECTION_BARS, n - MIN_SECTION_BARS + 1)
            if nov[i] >= nov[max(0, i - 2):i + 3].max() and nov[i] > nov.mean() + 0.3 * nov.std()]
    cand.sort(key=lambda i: -nov[i] * weight[i])

    chosen = [0]
    max_sections = max(1, n // 8 + 1)
    for i in cand:
        if len(chosen) >= max_sections:
            break
        if all(abs(i - c) >= MIN_SECTION_BARS for c in chosen):
            chosen.append(i)
    return sorted(chosen)


def _label_sections(seg_feats: list[np.ndarray]) -> list[str]:
    """Same letter = similar material (cosine of the mean features)."""
    letters: list[str] = []
    reps: list[np.ndarray] = []
    for v in seg_feats:
        v = v / (np.linalg.norm(v) + 1e-9)
        sims = [float(v @ r) for r in reps]
        if sims and max(sims) > 0.6:
            letters.append(chr(ord("A") + int(np.argmax(sims))))
        else:
            reps.append(v)
            letters.append(chr(ord("A") + min(len(reps) - 1, 25)))
    return letters


def _name_sections(letters: list[str], energy: np.ndarray, vocal: np.ndarray | None) -> list[str]:
    n = len(letters)
    if n == 1:
        return ["parte"]
    counts = {l: letters.count(l) for l in set(letters)}
    repeated = [l for l in counts if counts[l] >= 2]
    score = energy + (vocal if vocal is not None else 0.0)
    chorus = max(repeated, key=lambda l: np.mean([score[i] for i in range(n) if letters[i] == l])) if repeated else None

    names = []
    for i, l in enumerate(letters):
        quiet = energy[i] < 0.75 or (vocal is not None and vocal[i] < 0.25)
        if i == 0 and quiet and l != chorus:
            names.append("intro")
        elif i == n - 1 and quiet and l != chorus:
            names.append("outro")
        elif l == chorus:
            names.append("ritornello")
        elif counts[l] >= 2:
            names.append("strofa")
        else:
            names.append("break" if energy[i] < 0.6 else "bridge")
    return names


def _seg_rms(y: np.ndarray, frames: np.ndarray) -> np.ndarray:
    import librosa
    rms = librosa.feature.rms(y=y, hop_length=HOP)
    return librosa.util.sync(rms, frames, aggregate=np.mean)[0]


# ---- entry point ----

def analyze_structure(upload: Path, stems: dict[str, Path] | None) -> dict:
    import librosa

    mix = _load(upload)
    duration = len(mix) / SR
    drums = _load(stems["drums"]) if stems else None
    vocals = _load(stems["vocals"]) if stems else None
    if stems:
        harmonic = _load(stems["bass"]) + _load(stems["other"])
    else:
        harmonic = librosa.effects.harmonic(mix, margin=2.0)

    # A drum stem that is basically empty (ballad, a cappella) tracks nothing.
    perc = drums if drums is not None and _rms(drums) > 0.1 * _rms(mix) else mix

    beat_frames, beat_times = _beats(perc)
    chroma = librosa.feature.chroma_cqt(y=harmonic, sr=SR, hop_length=HOP)
    beat_chroma = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
    key = estimate_key(harmonic, SR)

    bpm = float(60.0 / np.median(np.diff(beat_times))) if len(beat_times) > 1 else 0.0
    phase = _bar_phase(perc, beat_frames, beat_chroma)
    down_frames = beat_frames[phase::BEATS_PER_BAR]
    downbeats = beat_times[phase::BEATS_PER_BAR]

    # Chords per beat segment: [0, b0), [b0, b1) … [b_last, end).
    bounds = np.concatenate([[0.0], beat_times, [duration]])
    chords = _chords(beat_chroma, _seg_rms(harmonic, beat_frames), bounds)

    sections: list[dict] = []
    n_bars = len(downbeats)
    if n_bars:
        # Bar-level features (column k+1 = bar k): harmony + timbre.
        mfcc = librosa.feature.mfcc(y=mix, sr=SR, hop_length=HOP, n_mfcc=13)[1:]
        frames = min(chroma.shape[1], mfcc.shape[1])
        feats = np.vstack([chroma[:, :frames], mfcc[:, :frames]])
        bar_feats = librosa.util.sync(feats, down_frames, aggregate=np.mean)[:, 1:n_bars + 1]
        bar_feats = (bar_feats - bar_feats.mean(axis=1, keepdims=True)) / (bar_feats.std(axis=1, keepdims=True) + 1e-9)
        bar_rms = _seg_rms(mix, down_frames)[1:n_bars + 1]
        bar_voc = _seg_rms(vocals, down_frames)[1:n_bars + 1] if vocals is not None else None

        starts = _boundaries(bar_feats)
        ends = starts[1:] + [n_bars]
        letters = _label_sections([bar_feats[:, s:e].mean(axis=1) for s, e in zip(starts, ends)])
        energy = np.array([bar_rms[s:e].mean() for s, e in zip(starts, ends)])
        energy = energy / (energy.max() + 1e-9)
        vocal = None
        if bar_voc is not None:
            vocal = np.array([bar_voc[s:e].mean() for s, e in zip(starts, ends)])
            vocal = vocal / (vocal.max() + 1e-9)
        names = _name_sections(letters, energy, vocal)

        for k, (s, e) in enumerate(zip(starts, ends)):
            sections.append({
                "start": 0.0 if s == 0 else round(float(downbeats[s]), 3),  # pickup belongs to the first section
                "end": round(float(downbeats[e]) if e < n_bars else duration, 3),
                "bar_start": s + 1,
                "bar_end": e + 1,
                "label": letters[k],
                "name": names[k],
                "energy": round(float(energy[k]), 3),
            })

    return {
        "source": "stems" if stems else "mix",
        "bpm": round(bpm, 1),
        "key": key,
        "beats_per_bar": BEATS_PER_BAR,
        "beats": [round(float(t), 3) for t in beat_times],
        "downbeats": [round(float(t), 3) for t in downbeats],
        "sections": sections,
        "chords": chords,
    }


# ---- cached access (API + flip generator) ----

# Bump when the analysis changes: old cached results are recomputed.
VERSION = 1


def structure_for(track_id: str):
    """StructureResponse for an upload (from the stems when they exist), cached
    per track and source in data/analysis/. None if the upload is gone."""
    import json

    from app.models import StructureResponse
    from app.storage import ANALYSIS_DIR, find_stems, find_upload

    path = find_upload(track_id)
    if path is None:
        return None
    stems = find_stems(track_id)
    cache = ANALYSIS_DIR / f"{track_id}.{'stems' if stems else 'mix'}.v{VERSION}.json"
    if cache.exists():
        try:
            return StructureResponse(**json.loads(cache.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            cache.unlink(missing_ok=True)
    result = StructureResponse(track_id=track_id, **analyze_structure(path, stems))
    cache.write_text(result.model_dump_json(), encoding="utf-8")
    return result
