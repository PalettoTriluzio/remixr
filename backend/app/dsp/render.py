"""Load -> process -> write. Shared by /api/render/preview and /api/render/export."""
from __future__ import annotations

import io
import uuid
from collections import OrderedDict
from pathlib import Path

import numpy as np
import soundfile as sf

from app.audio.loader import audio_info, load_audio_segment
from app.dsp.chain import process
from app.models import EffectChain, StemMix
from app.storage import RENDERS_DIR, STEM_NAMES

# A preview is an audition, not a bounce: cap the window and drop to 16-bit.
PREVIEW_MAX_SEC = 30.0
PREVIEW_SUBTYPE = "PCM_16"
EXPORT_SUBTYPE = "PCM_24"

# Decoded tracks are the expensive part of a preview (F3 fires /preview on every
# knob move), so keep the last few around. One entry is a float32 copy of the
# audio: ~100 MB for 5 minutes of 44.1 kHz stereo — hence the small cap.
# Stems mode decodes 4 files per render: room for two windows of them.
_CACHE_MAX = 10
_cache: "OrderedDict[tuple, tuple[np.ndarray, int]]" = OrderedDict()


def clear_cache() -> None:
    _cache.clear()


def _decode(path: Path, start: float | None, end: float | None) -> tuple[np.ndarray, int]:
    key = (str(path), path.stat().st_mtime_ns, start, end)
    cached = _cache.get(key)
    if cached is not None:
        _cache.move_to_end(key)
        return cached

    samples, sr = load_audio_segment(path, start, end)
    _cache[key] = (samples, sr)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return samples, sr


def clamp_region(
    path: Path, start: float | None, end: float | None, max_len_sec: float | None = None
) -> tuple[float | None, float | None]:
    """Clamp a requested region to the file, optionally capping its length.

    `(None, None)` is passed straight through so full-track renders take the
    loader's fast path.
    """
    if start is None and end is None and max_len_sec is None:
        return None, None

    duration, _, _ = audio_info(path)
    s = 0.0 if start is None else max(0.0, min(float(start), duration))
    e = duration if end is None else min(float(end), duration)
    if e <= s:
        raise ValueError(f"Empty region: start={s:.3f}s end={e:.3f}s (duration {duration:.3f}s)")
    if max_len_sec is not None and e - s > max_len_sec:
        e = s + max_len_sec
    return s, e


def _mix_stems(
    stems: dict[str, Path], mix: StemMix, start: float | None, end: float | None
) -> tuple[np.ndarray, int]:
    """Sum the stems with their levels. Solo wins over mute-less stems, like a DAW."""
    levels = {name: getattr(mix, name) for name in STEM_NAMES}
    any_solo = any(lvl.solo and not lvl.mute for lvl in levels.values())
    out: np.ndarray | None = None
    sr = 0
    for name, lvl in levels.items():
        # Fader at the bottom (-60 dB) = off, like the UI shows ("-∞").
        audible = (lvl.solo if any_solo else True) and not lvl.mute and lvl.gain_db > -60.0
        if not audible:
            continue
        samples, sr = _decode(stems[name], start, end)
        part = samples * np.float32(10 ** (lvl.gain_db / 20))
        out = part if out is None else out + part
    if out is None:  # everything muted: silence of the right shape
        samples, sr = _decode(stems[STEM_NAMES[0]], start, end)
        out = np.zeros_like(samples)
    return out, sr


def render(
    path: Path,
    chain: EffectChain,
    start: float | None = None,
    end: float | None = None,
    stems: dict[str, Path] | None = None,
    stem_mix: StemMix | None = None,
) -> tuple[np.ndarray, int]:
    """Decode (cached) + run the chain. Returns (samples (channels, n), sr).
    With `stems` + `stem_mix` the source is the stem mix instead of the file."""
    if stems is not None and stem_mix is not None:
        samples, sr = _mix_stems(stems, stem_mix, start, end)
    else:
        samples, sr = _decode(path, start, end)
    return process(samples, sr, chain), sr


def _write(target, samples: np.ndarray, sr: int, *, fmt: str, subtype: str | None = None) -> None:
    # Clip before quantising: int conversion wraps around on overshoot, which
    # turns a hot mix into full-scale noise.
    data = np.clip(samples, -1.0, 1.0).T  # soundfile wants (frames, channels)
    sf.write(target, data, sr, format=fmt, subtype=subtype)


def export(
    path: Path,
    chain: EffectChain,
    fmt: str = "wav",
    start: float | None = None,
    end: float | None = None,
    stems: dict[str, Path] | None = None,
    stem_mix: StemMix | None = None,
) -> tuple[str, Path, float]:
    """Render to a file in data/renders/. Returns (render_id, path, duration_sec)."""
    s, e = clamp_region(path, start, end)
    samples, sr = render(path, chain, s, e, stems, stem_mix)

    render_id = uuid.uuid4().hex
    if fmt == "wav":
        out = RENDERS_DIR / f"{render_id}.wav"
        _write(str(out), samples, sr, fmt="WAV", subtype=EXPORT_SUBTYPE)
    elif fmt == "mp3":
        out = RENDERS_DIR / f"{render_id}.mp3"
        try:
            # libsndfile >= 1.1 (soundfile >= 0.12) can encode MP3, but exposes
            # no bitrate control — true 320 kbps CBR lands in F7 via ffmpeg.
            _write(str(out), samples, sr, fmt="MP3")
        except Exception as exc:  # noqa: BLE001
            out.unlink(missing_ok=True)
            raise ValueError(f"MP3 encoding unavailable in this libsndfile build: {exc}") from exc
    else:
        raise ValueError(f"Unsupported format: {fmt}")

    return render_id, out, samples.shape[1] / sr


def preview_wav(
    path: Path,
    chain: EffectChain,
    start: float | None = None,
    end: float | None = None,
    stems: dict[str, Path] | None = None,
    stem_mix: StemMix | None = None,
) -> bytes:
    """Render a short WAV to memory. With no region, previews the first
    PREVIEW_MAX_SEC of the track."""
    s, e = clamp_region(path, start, end, max_len_sec=PREVIEW_MAX_SEC)
    samples, sr = render(path, chain, s, e, stems, stem_mix)

    buf = io.BytesIO()
    _write(buf, samples, sr, fmt="WAV", subtype=PREVIEW_SUBTYPE)
    return buf.getvalue()
