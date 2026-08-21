"""Universal audio loader.

Strategy:
  1. Try `soundfile` — fast, handles WAV/FLAC/OGG natively, no decoding overhead.
  2. Fallback to `librosa.load` — uses audioread → ffmpeg, handles MP3/M4A/AAC/anything.

Returns (samples: np.ndarray shape (n_channels, n_samples), sample_rate: int).
"""
from __future__ import annotations
from pathlib import Path

import numpy as np
import soundfile as sf


ALLOWED_EXTS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}


def load_audio(path: str | Path, target_sr: int | None = None, mono: bool = False) -> tuple[np.ndarray, int]:
    """Load an audio file. Returns (samples with shape (channels, n), sr)."""
    path = Path(path)

    try:
        data, sr = sf.read(str(path), always_2d=True)  # shape (n, channels)
        samples = data.T.astype(np.float32)  # -> (channels, n)
    except (sf.SoundFileError, RuntimeError):
        import librosa
        y, sr = librosa.load(str(path), sr=None, mono=False)
        if y.ndim == 1:
            samples = y[np.newaxis, :].astype(np.float32)
        else:
            samples = y.astype(np.float32)

    if mono and samples.shape[0] > 1:
        samples = samples.mean(axis=0, keepdims=True)

    if target_sr is not None and sr != target_sr:
        import librosa
        resampled = librosa.resample(samples, orig_sr=sr, target_sr=target_sr, axis=1)
        samples = resampled.astype(np.float32)
        sr = target_sr

    return samples, sr


def audio_info(path: str | Path) -> tuple[float, int, int]:
    """Quick metadata read without loading full samples. Returns (duration_sec, sr, channels)."""
    path = Path(path)
    try:
        info = sf.info(str(path))
        return float(info.duration), int(info.samplerate), int(info.channels)
    except (sf.SoundFileError, RuntimeError):
        # Fallback: load with librosa to get metadata (slower)
        samples, sr = load_audio(path)
        duration = samples.shape[1] / sr
        return float(duration), int(sr), int(samples.shape[0])
