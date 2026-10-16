"""Mood of a song: how it feels, in numbers the generator can use.

Heuristics on top of /structure (no models):
  minor_share  share of the (voiced) chord time that is minor
  brightness   mean spectral centroid of the mix, 1 kHz → 0 … 3.5 kHz → 1
  energy       onset density + loudness + tempo
  valence      mostly harmony (minor/major), then brightness and tempo
The pair (valence, energy) picks one of the generator's moods; tempo/energy
suggest a style. Cached in data/analysis/ next to the structure.
"""
from __future__ import annotations

import json

import numpy as np

from app.analysis.structure import SR, VERSION as STRUCTURE_VERSION, _load, structure_for
from app.models import MoodProfile

# Bump when the analysis changes.
VERSION = 1

MOOD_LABEL = {"dark": "scuro", "sad": "malinconico", "epic": "epico", "happy": "solare", "dreamy": "sognante"}
STYLE_LABEL = {
    "trap": "trap", "drill": "drill", "boombap": "boom bap", "lofi": "lo-fi",
    "house": "house", "reggaeton": "reggaeton", "afro": "afro", "pop": "pop",
}


def _clamp(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def _ramp(x: float, lo: float, hi: float) -> float:
    return _clamp((x - lo) / (hi - lo))


def pick_mood(valence: float, energy: float) -> str:
    if valence < 0.42:
        return "dark" if energy >= 0.5 else "sad"
    if valence < 0.58:
        return "epic" if energy >= 0.6 else "dreamy"
    return "happy" if energy >= 0.45 else "dreamy"


def pick_style(bpm: float, energy: float, valence: float) -> str:
    if bpm < 85:
        return "lofi" if energy < 0.45 else "trap"
    if bpm < 100:
        if valence >= 0.55 and energy >= 0.5:
            return "reggaeton"
        return "boombap" if energy < 0.6 else "trap"
    if bpm < 115:
        return "afro" if valence >= 0.5 else "trap"
    if bpm < 132:
        return "house" if energy >= 0.5 else "pop"
    if bpm < 150:
        return "drill" if valence < 0.42 else "trap"
    return "trap"


def _analyze(track_id: str, path, structure) -> MoodProfile:
    import librosa

    y = _load(path)
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=SR)))
    rms_db = float(20 * np.log10(np.sqrt(np.mean(np.square(y))) + 1e-9))
    onsets = librosa.onset.onset_detect(y=y, sr=SR, units="time")
    duration = max(1.0, len(y) / SR)
    density = len(onsets) / duration

    voiced = [(c.end - c.start, c.chord.endswith("m")) for c in structure.chords if c.chord != "N"]
    total = sum(d for d, _ in voiced)
    minor_share = sum(d for d, m in voiced if m) / total if total > 0 else (1.0 if "minor" in structure.key else 0.0)
    key_minor = "minor" in structure.key

    # Half-time ambiguity: 70 and 140 BPM feel alike; use the faster reading.
    bpm = structure.bpm or 120.0
    feel_bpm = bpm * 2 if bpm < 80 else bpm
    tempo = _ramp(feel_bpm, 80, 150)

    brightness = _ramp(centroid, 1000, 3500)
    energy = _clamp(0.45 * _ramp(density, 1.0, 5.0) + 0.3 * _ramp(rms_db, -28, -10) + 0.25 * tempo)
    valence = _clamp(0.5 * (1 - minor_share) + 0.15 * (0 if key_minor else 1) + 0.2 * brightness + 0.15 * tempo)

    mood = pick_mood(valence, energy)
    style = pick_style(bpm, energy, valence)
    description = (
        f"{MOOD_LABEL[mood]}: {'minore' if minor_share >= 0.5 else 'maggiore'} "
        f"({round(minor_share * 100)}% accordi minori), energia {round(energy * 100)}%, "
        f"timbro {'scuro' if brightness < 0.35 else 'brillante' if brightness > 0.65 else 'medio'}"
    )
    return MoodProfile(
        track_id=track_id, mood=mood, valence=round(valence, 3), energy=round(energy, 3),
        brightness=round(brightness, 3), minor_share=round(minor_share, 3),
        suggested_style=style, description=description,
    )


def mood_for(track_id: str) -> MoodProfile | None:
    """MoodProfile of an upload (cached per structure source). None if the upload is gone."""
    from app.storage import ANALYSIS_DIR, find_upload

    path = find_upload(track_id)
    structure = structure_for(track_id)
    if path is None or structure is None:
        return None
    cache = ANALYSIS_DIR / f"{track_id}.{structure.source}.mood.v{VERSION}.s{STRUCTURE_VERSION}.json"
    if cache.exists():
        try:
            return MoodProfile(**json.loads(cache.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            cache.unlink(missing_ok=True)
    result = _analyze(track_id, path, structure)
    cache.write_text(result.model_dump_json(), encoding="utf-8")
    return result
