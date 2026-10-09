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


def _postprocess(
    samples: np.ndarray, sr: int, target_sr: int | None, mono: bool
) -> tuple[np.ndarray, int]:
    if mono and samples.shape[0] > 1:
        samples = samples.mean(axis=0, keepdims=True)

    if target_sr is not None and sr != target_sr:
        import librosa
        resampled = librosa.resample(samples, orig_sr=sr, target_sr=target_sr, axis=1)
        samples = resampled.astype(np.float32)
        sr = target_sr

    return samples, sr


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

    return _postprocess(samples, sr, target_sr, mono)


def load_audio_segment(
    path: str | Path,
    start_sec: float | None = None,
    end_sec: float | None = None,
    target_sr: int | None = None,
    mono: bool = False,
) -> tuple[np.ndarray, int]:
    """Decode only the `[start_sec, end_sec)` slice of a file.

    Keeps previews cheap on long tracks: soundfile seeks, librosa uses
    offset/duration. `None` bounds mean "from the start" / "to the end".
    """
    path = Path(path)
    if start_sec is None and end_sec is None:
        return load_audio(path, target_sr=target_sr, mono=mono)

    start = max(0.0, start_sec or 0.0)

    try:
        info = sf.info(str(path))
        start_frame = min(int(start * info.samplerate), info.frames)
        stop_frame = (
            min(int(end_sec * info.samplerate), info.frames) if end_sec is not None else None
        )
        data, sr = sf.read(
            str(path), start=start_frame, stop=stop_frame, always_2d=True
        )  # shape (n, channels)
        samples = data.T.astype(np.float32)
    except (sf.SoundFileError, RuntimeError):
        import librosa
        duration = None if end_sec is None else max(0.0, end_sec - start)
        y, sr = librosa.load(str(path), sr=None, mono=False, offset=start, duration=duration)
        if y.ndim == 1:
            samples = y[np.newaxis, :].astype(np.float32)
        else:
            samples = y.astype(np.float32)

    return _postprocess(samples, sr, target_sr, mono)


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
