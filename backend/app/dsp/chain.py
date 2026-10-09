"""params -> audio. Builds the pedalboard chain and applies the non-plugin steps.

Signal flow (default order, see PLAN.md):

    [time/pitch]  ->  input gain -> HP -> EQ -> Comp(+makeup) -> Distortion
                  ->  LP -> Delay -> Reverb  ->  [stereo width]  ->  Limiter

Time-stretch / pitch-shift run *first*: they transform the source material,
everything after that is colouring. Stereo width is mid/side maths (no
pedalboard plugin exists for it), so the chain is split into two boards with
the numpy step in between.

All arrays are float32 with shape (channels, n_samples) — same convention as
`app.audio.loader`.
"""
from __future__ import annotations

import numpy as np
import pedalboard
from pedalboard import (
    Compressor,
    Delay,
    Distortion,
    Gain,
    HighpassFilter,
    Limiter,
    LowpassFilter,
    PeakFilter,
    PitchShift,
    Pedalboard,
    Reverb,
)

from app.models import EffectChain

EPS = 1e-6

# pedalboard.time_stretch landed in 0.9.0; guard so an older wheel degrades to
# the pyrubberband/librosa fallback instead of failing at import time.
_time_stretch = getattr(pedalboard, "time_stretch", None)


# ---------------------------------------------------------------- plugin boards

def build_board(chain: EffectChain) -> Pedalboard:
    """Everything from input gain up to (and including) reverb."""
    fx: list = []

    if abs(chain.input_gain_db) > EPS:
        fx.append(Gain(gain_db=chain.input_gain_db))

    if chain.hp.enabled:
        fx.append(HighpassFilter(cutoff_frequency_hz=chain.hp.freq))

    if chain.eq.enabled:
        for band in (chain.eq.low, chain.eq.mid, chain.eq.high):
            # A 0 dB peaking filter is a no-op; skip it to save a pass.
            if abs(band.gain_db) > EPS:
                fx.append(
                    PeakFilter(
                        cutoff_frequency_hz=band.freq,
                        gain_db=band.gain_db,
                        q=band.q,
                    )
                )

    if chain.comp.enabled:
        fx.append(
            Compressor(
                threshold_db=chain.comp.threshold_db,
                ratio=chain.comp.ratio,
                attack_ms=chain.comp.attack_ms,
                release_ms=chain.comp.release_ms,
            )
        )
        # pedalboard's Compressor has no makeup stage — emulate with a Gain.
        if abs(chain.comp.makeup_db) > EPS:
            fx.append(Gain(gain_db=chain.comp.makeup_db))

    if chain.distortion.enabled:
        fx.append(Distortion(drive_db=chain.distortion.drive_db))

    if chain.lp.enabled:
        fx.append(LowpassFilter(cutoff_frequency_hz=chain.lp.freq))

    if chain.delay.enabled:
        fx.append(
            Delay(
                delay_seconds=chain.delay.time_ms / 1000.0,
                feedback=chain.delay.feedback,
                mix=chain.delay.mix,
            )
        )

    if chain.reverb.enabled:
        fx.append(
            Reverb(
                room_size=chain.reverb.room_size,
                damping=chain.reverb.damping,
                wet_level=chain.reverb.wet,
                dry_level=chain.reverb.dry,
                width=chain.reverb.width,
            )
        )

    return Pedalboard(fx)


def build_limiter(chain: EffectChain) -> Pedalboard:
    """Last stage, after the stereo-width maths."""
    if not chain.limiter.enabled:
        return Pedalboard([])
    return Pedalboard(
        [
            Limiter(
                threshold_db=chain.limiter.threshold_db,
                release_ms=chain.limiter.release_ms,
            )
        ]
    )


# ------------------------------------------------------------------ stereo width

def apply_stereo_width(samples: np.ndarray, width: float) -> np.ndarray:
    """Mid/side width. 0 = mono, 1 = untouched, 2 = double the side signal.

    Mono input has no side signal to scale, so it is returned as-is.
    """
    if samples.shape[0] < 2:
        return samples

    left, right = samples[0], samples[1]
    mid = (left + right) * 0.5
    side = (left - right) * 0.5 * width
    out = samples.copy()
    out[0] = mid + side
    out[1] = mid - side
    return out.astype(np.float32, copy=False)


# -------------------------------------------------------------- time and pitch

_stretch_is_speed: bool | None = None


def _stretch_factor_is_speed(sr: int = 24000) -> bool:
    """Does `stretch_factor=2.0` mean "twice as fast" or "twice as long"?

    The two readings are opposites and the answer differs between pedalboard
    releases, so probe once with a 1-second buffer rather than guessing. Result
    is cached for the process lifetime.
    """
    global _stretch_is_speed
    if _stretch_is_speed is None:
        probe = np.zeros((1, sr), dtype=np.float32)
        out = _time_stretch(probe, sr, stretch_factor=2.0)
        _stretch_is_speed = out.shape[-1] < probe.shape[-1]
    return _stretch_is_speed


def apply_time_pitch(samples: np.ndarray, sr: int, chain: EffectChain) -> np.ndarray:
    """Time-stretch and/or pitch-shift. `tempo.ratio` is a speed multiplier
    (2.0 = twice as fast, half as long); `pitch.semitones` is independent of it.
    """
    semitones = chain.pitch.semitones if chain.pitch.enabled else 0.0
    ratio = chain.tempo.ratio if chain.tempo.enabled else 1.0

    pitch_only = abs(ratio - 1.0) <= EPS
    if pitch_only and abs(semitones) <= EPS:
        return samples

    # Pitch without tempo: the plugin is simpler and sidesteps the stretch_factor
    # ambiguity entirely.
    if pitch_only:
        return Pedalboard([PitchShift(semitones=semitones)])(samples, sr, reset=True)

    if _time_stretch is not None:
        try:
            factor = ratio if _stretch_factor_is_speed() else 1.0 / ratio
            out = _time_stretch(
                samples,
                sr,
                stretch_factor=factor,
                pitch_shift_in_semitones=semitones,
                high_quality=True,
            )
            return np.ascontiguousarray(out, dtype=np.float32)
        except Exception:  # noqa: BLE001 — any rubberband failure falls through
            pass

    return _fallback_time_pitch(samples, sr, ratio, semitones)


def _fallback_time_pitch(
    samples: np.ndarray, sr: int, ratio: float, semitones: float
) -> np.ndarray:
    """pyrubberband (needs the `rubberband` binary on PATH), then librosa."""
    try:
        import pyrubberband as pyrb

        y = samples.T  # pyrubberband wants (n_samples, channels)
        if abs(ratio - 1.0) > EPS:
            y = pyrb.time_stretch(y, sr, rate=ratio)
        if abs(semitones) > EPS:
            y = pyrb.pitch_shift(y, sr, n_steps=semitones)
        return np.ascontiguousarray(np.atleast_2d(y.T), dtype=np.float32)
    except Exception:  # noqa: BLE001
        pass

    import librosa

    y = samples  # librosa 0.10 stretches along the last axis, multichannel ok
    if abs(ratio - 1.0) > EPS:
        y = librosa.effects.time_stretch(y, rate=ratio)
    if abs(semitones) > EPS:
        y = librosa.effects.pitch_shift(y, sr=sr, n_steps=semitones)
    return np.ascontiguousarray(y, dtype=np.float32)


# ------------------------------------------------------------------ full chain

def process(samples: np.ndarray, sr: int, chain: EffectChain) -> np.ndarray:
    """Run the whole chain. Input is never mutated."""
    out = np.ascontiguousarray(samples, dtype=np.float32)
    if out.ndim == 1:
        out = out[np.newaxis, :]

    out = apply_time_pitch(out, sr, chain)

    board = build_board(chain)
    if len(board) > 0:
        out = board(out, sr, reset=True)

    if chain.stereo.enabled and abs(chain.stereo.width - 1.0) > EPS:
        out = apply_stereo_width(out, chain.stereo.width)

    limiter = build_limiter(chain)
    if len(limiter) > 0:
        out = limiter(out, sr, reset=True)

    return np.ascontiguousarray(out, dtype=np.float32)
