"""Feature extraction: BPM, musical key, waveform peaks, average spectrum."""
from __future__ import annotations

import numpy as np


# Krumhansl-Schmuckler key profiles (major, minor).
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def estimate_bpm(y_mono: np.ndarray, sr: int) -> float:
    """Estimate tempo in BPM using librosa's beat tracker."""
    import librosa
    tempo, _ = librosa.beat.beat_track(y=y_mono, sr=sr)
    # librosa returns np.float64 or 1-element ndarray depending on version
    return float(np.atleast_1d(tempo)[0])


def estimate_key(y_mono: np.ndarray, sr: int) -> str:
    """Estimate musical key using chroma + Krumhansl-Schmuckler profile correlation.
    Returns a string like "C major" / "A minor"."""
    import librosa
    chroma = librosa.feature.chroma_cqt(y=y_mono, sr=sr)
    mean_chroma = chroma.mean(axis=1)
    mean_chroma = mean_chroma / (mean_chroma.sum() + 1e-9)

    best_score = -np.inf
    best_key = "C"
    best_mode = "major"
    for i in range(12):
        rotated_major = np.roll(_MAJOR_PROFILE, i)
        rotated_minor = np.roll(_MINOR_PROFILE, i)
        s_major = float(np.corrcoef(mean_chroma, rotated_major)[0, 1])
        s_minor = float(np.corrcoef(mean_chroma, rotated_minor)[0, 1])
        if s_major > best_score:
            best_score, best_key, best_mode = s_major, _PITCH_CLASSES[i], "major"
        if s_minor > best_score:
            best_score, best_key, best_mode = s_minor, _PITCH_CLASSES[i], "minor"

    return f"{best_key} {best_mode}"


def compute_peaks(y_mono: np.ndarray, n_points: int = 2000) -> list[float]:
    """Downsample to n_points by taking max-abs per bucket (nice for waveform overview)."""
    n = len(y_mono)
    if n == 0:
        return []
    if n <= n_points:
        return y_mono.astype(np.float32).tolist()
    bucket = n // n_points
    trimmed = y_mono[: bucket * n_points]
    reshaped = np.abs(trimmed).reshape(n_points, bucket)
    peaks = reshaped.max(axis=1)
    return peaks.astype(np.float32).tolist()


def compute_spectrum(y_mono: np.ndarray, sr: int, n_mels: int = 128) -> list[float]:
    """Log-mean mel-spectrogram → 128-band average spectrum, useful for a static EQ display."""
    import librosa
    S = librosa.feature.melspectrogram(y=y_mono, sr=sr, n_mels=n_mels)
    log_S = librosa.power_to_db(S, ref=np.max)
    mean_spec = log_S.mean(axis=1)
    # Normalize roughly to 0..1 for the frontend
    mn, mx = float(mean_spec.min()), float(mean_spec.max())
    if mx - mn < 1e-6:
        return [0.0] * n_mels
    normalized = (mean_spec - mn) / (mx - mn)
    return normalized.astype(np.float32).tolist()
