"""Track automation (volume, low-pass, high-pass over time) and sidechain
ducking, applied by app/flip/render.py.

Order per track: clips → automated HP/LP → track chain → automated volume
→ ducking → pan/gain. Values are normalised 0..1 (see AutoPoint):
    volume    gain = value²   (fader-like: 0.5 ≈ −12 dB)
    lowpass   60 Hz · (20000/60)^value
    highpass  20 Hz · (4000/20)^value
The filters are 2nd-order Butterworth recomputed every BLOCK samples, with
the state carried across blocks (designs cached on a quantised cutoff).
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from app.models import AutoPoint

BLOCK = 256
NEUTRAL = {"volume": 1.0, "lowpass": 1.0, "highpass": 0.0}
_Q = 400  # cutoff quantisation steps over 0..1


def curve(points: list[AutoPoint], beats: np.ndarray) -> np.ndarray:
    pts = sorted(points, key=lambda p: p.beat)
    return np.interp(beats, [p.beat for p in pts], [p.value for p in pts]).astype(np.float32)


def is_neutral(param: str, points: list[AutoPoint]) -> bool:
    return not points or all(abs(p.value - NEUTRAL[param]) < 1e-3 for p in points)


def cutoff(param: str, v: float) -> float:
    if param == "lowpass":
        return 60.0 * (20000.0 / 60.0) ** v
    return 20.0 * (4000.0 / 20.0) ** v


@lru_cache(maxsize=2048)
def _sos(param: str, q: int, sr: int):
    from scipy.signal import butter
    f = min(cutoff(param, q / _Q), 0.45 * sr)
    return butter(2, f, btype="low" if param == "lowpass" else "high", fs=sr, output="sos")


def filter_sweep(x: np.ndarray, sr: int, param: str, values: np.ndarray) -> np.ndarray:
    """x (channels, n), values (n,) normalised cutoff per sample."""
    from scipy.signal import sosfilt
    n = x.shape[1]
    out = np.empty_like(x)
    zi = np.zeros((1, x.shape[0], 2))
    for s in range(0, n, BLOCK):
        e = min(n, s + BLOCK)
        q = int(round(float(values[(s + e) // 2]) * _Q))
        out[:, s:e], zi = sosfilt(_sos(param, q, sr), x[:, s:e], axis=-1, zi=zi)
    return out.astype(np.float32)


def apply_filters(x: np.ndarray, sr: int, auto: dict, beats: np.ndarray) -> np.ndarray:
    for param in ("highpass", "lowpass"):
        pts = auto.get(param) or []
        if not is_neutral(param, pts):
            x = filter_sweep(x, sr, param, curve(pts, beats))
    return x


def apply_volume(x: np.ndarray, auto: dict, beats: np.ndarray) -> np.ndarray:
    pts = auto.get("volume") or []
    if is_neutral("volume", pts):
        return x
    g = curve(pts, beats)
    return x * (g * g)[None, :]


def duck(x: np.ndarray, key: np.ndarray, sr: int, amount_db: float, release_ms: float, low: bool) -> np.ndarray:
    """Gain reduction following `key` (instant attack, exponential release),
    up to amount_db at the key's loudest hits. `low` = key on < 150 Hz (kick)."""
    if amount_db <= 0:
        return x
    mono = key.mean(axis=0)
    if low:
        from scipy.signal import butter, sosfilt
        mono = sosfilt(butter(2, 150.0, btype="low", fs=sr, output="sos"), mono)
    hop = max(1, sr // 1000)  # 1 ms frames
    n = len(mono) // hop
    if n < 2:
        return x
    frames = np.abs(mono[:n * hop]).reshape(n, hop).max(axis=1)
    ref = float(np.percentile(frames, 99.5)) or float(frames.max()) or 1.0
    level = np.minimum(frames / ref, 1.0)
    coef = float(np.exp(-1.0 / max(1.0, release_ms)))
    env = np.empty(n, dtype=np.float32)
    e = 0.0
    for i, v in enumerate(level.tolist()):
        e = v if v > e else e * coef
        env[i] = e
    gain = 10 ** (-amount_db * env / 20)
    g = np.interp(np.arange(x.shape[1]) / hop, np.arange(n), gain).astype(np.float32)
    return x * g[None, :]
