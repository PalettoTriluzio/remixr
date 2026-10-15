"""Note-by-note pitch correction and diatonic harmony (no extra models).

pYIN (librosa) tracks the pitch, frames are grouped into notes (runs that sit
closest to the same scale note), and each note is pitch-shifted as a block
with short crossfades:

  tune      move each note's median pitch toward its scale note
            (strength 0..1; vibrato and slides inside a note are kept)
  harmony   move each note N scale steps: a third above is 3 or 4 semitones
            depending on the degree, like a real backing vocal

Unvoiced parts (consonants, breaths, silence) are left untouched.
"""
from __future__ import annotations

import numpy as np

from app.analysis.features import _PITCH_CLASSES
from app.dsp.chain import time_pitch

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],  # natural minor
}
_FLATS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}

PYIN_SR = 22050
HOP = 256
FRAME = 2048
MIN_NOTE_FRAMES = 3  # ~35 ms
FADE_SEC = 0.01
PAD_SEC = 0.05       # context around each note for the shifter


def scale_notes(key: str) -> np.ndarray:
    """All MIDI notes (0..127) of the scale named by `key` ("A minor", "F# major")."""
    parts = key.strip().split()
    tonic = _FLATS.get(parts[0], parts[0]) if parts else "C"
    mode = parts[1].lower() if len(parts) > 1 else "major"
    pc = _PITCH_CLASSES.index(tonic) if tonic in _PITCH_CLASSES else 0
    steps = SCALES.get(mode, SCALES["major"])
    return np.array([m for m in range(128) if (m - pc) % 12 in steps], dtype=float)


def _notes(midi: np.ndarray, voiced: np.ndarray, scale: np.ndarray) -> list[tuple[int, int, int]]:
    """(first frame, end frame, index in `scale`) per detected note."""
    valid = voiced & np.isfinite(midi)
    target = np.full(len(midi), -1)
    if valid.any():
        target[valid] = np.abs(scale[None, :] - midi[valid][:, None]).argmin(axis=1)

    notes = []
    i = 0
    while i < len(target):
        if target[i] < 0:
            i += 1
            continue
        j = i
        while j < len(target) and target[j] == target[i]:
            j += 1
        if j - i >= MIN_NOTE_FRAMES:
            notes.append((i, j, int(target[i])))
        i = j
    return notes


def retune(x: np.ndarray, sr: int, key: str, strength: float, harmony: int) -> np.ndarray:
    """x: (channels, n). Returns the same shape."""
    import librosa

    if strength <= 0 and harmony == 0:
        return x
    mono = x.mean(axis=0)
    y = librosa.resample(mono, orig_sr=sr, target_sr=PYIN_SR) if sr != PYIN_SR else mono
    f0, voiced, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C6"),
        sr=PYIN_SR, frame_length=FRAME, hop_length=HOP,
    )
    midi = librosa.hz_to_midi(f0)
    scale = scale_notes(key)

    out = x.copy()
    n = x.shape[1]
    to_sample = HOP * sr / PYIN_SR
    pad = int(PAD_SEC * sr)
    for a, b, k in _notes(midi, voiced, scale):
        shift = (scale[k] - float(np.nanmedian(midi[a:b]))) * strength
        if harmony:
            shift += scale[int(np.clip(k + harmony, 0, len(scale) - 1))] - scale[k]
        if abs(shift) < 0.02:
            continue
        s0, s1 = int(a * to_sample), min(int(b * to_sample), n)
        if s1 - s0 < 8:
            continue
        lo, hi = max(0, s0 - pad), min(n, s1 + pad)
        shifted = time_pitch(x[:, lo:hi], sr, 1.0, float(shift))[:, s0 - lo:s1 - lo]
        if shifted.shape[1] < s1 - s0:
            shifted = np.pad(shifted, ((0, 0), (0, s1 - s0 - shifted.shape[1])))
        w = np.ones(s1 - s0, dtype=np.float32)
        f = min(int(FADE_SEC * sr), (s1 - s0) // 2)
        if f > 0:
            w[:f] = np.linspace(0, 1, f)
            w[-f:] = np.linspace(1, 0, f)
        out[:, s0:s1] = out[:, s0:s1] * (1 - w) + shifted * w
    return out
