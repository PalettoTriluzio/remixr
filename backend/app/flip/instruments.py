"""Synthesised instruments for generated tracks: no samples, no licences.

Drums: one-shots built from sines, noise and filters, one flavour per kit
(cached per kit/sr/tune/decay). Bass and keys: oscillators (band-limited saw
via polyBLEP, square, sine, FM) + envelopes + filters, one function per preset.

Everything returns float32 (2, n). Pitch is MIDI; 69 = A4 = 440 Hz.
"""
from __future__ import annotations

import zlib
from functools import lru_cache

import numpy as np
from scipy.signal import butter, sosfilt

from app.models import Instrument, Note, PatternClip

TAU = 2 * np.pi


def midi_hz(m: float | np.ndarray) -> float | np.ndarray:
    return 440.0 * 2 ** ((np.asarray(m, dtype=np.float64) - 69) / 12)


def _filt(x: np.ndarray, sr: int, kind: str, freq, order: int = 2) -> np.ndarray:
    nyq = sr / 2 * 0.98
    if isinstance(freq, (list, tuple)):
        wn = [min(max(f, 10.0), nyq) / (sr / 2) for f in freq]
    else:
        wn = min(max(float(freq), 10.0), nyq) / (sr / 2)
    return sosfilt(butter(order, wn, btype=kind, output="sos"), x).astype(np.float32)


def _exp_env(n: int, sr: int, tau: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (sr * max(tau, 1e-4))).astype(np.float32)


# ---------------------------------------------------------------- drums

# Per kit: (kick start Hz, kick end Hz, kick decay s, snare tone Hz, hat brightness Hz, saturation, lowpass Hz)
_KITS = {
    "trap":    (180.0, 45.0, 0.55, 190.0, 7500.0, 1.5, 20000.0),
    "boombap": (140.0, 52.0, 0.35, 180.0, 6000.0, 2.5, 9000.0),
    "house":   (160.0, 50.0, 0.32, 200.0, 8000.0, 1.8, 20000.0),
    "lofi":    (120.0, 50.0, 0.30, 170.0, 5000.0, 2.0, 5500.0),
    "afro":    (150.0, 55.0, 0.30, 220.0, 8500.0, 1.3, 16000.0),
}


@lru_cache(maxsize=128)
def drum_hit(voice: str, kit: str, sr: int, tune: float, decay: float) -> np.ndarray:
    """Mono one-shot (float32). Deterministic: noise has a fixed seed."""
    k0, k1, kdec, stone, hatf, sat, lp = _KITS.get(kit, _KITS["trap"])
    t_scale = 2 ** (tune / 12)
    rng = np.random.default_rng(zlib.crc32(f"{voice}/{kit}".encode()))

    def noise(sec: float) -> np.ndarray:
        return rng.uniform(-1, 1, int(sec * sr)).astype(np.float32)

    if voice == "kick":
        dur = kdec * decay * 2.5
        n = int(dur * sr)
        t = np.arange(n) / sr
        f = (k1 + (k0 - k1) * np.exp(-t / 0.035)) * t_scale
        x = np.sin(TAU * np.cumsum(f) / sr) * _exp_env(n, sr, kdec * decay / 2.5)
        click = _filt(noise(0.005), sr, "highpass", 3000) * 0.3
        x[: click.size] += click
        x = np.tanh(x * sat) / np.tanh(sat)
    elif voice == "snare":
        n = int(0.35 * decay * sr)
        t = np.arange(n) / sr
        tone = np.sin(TAU * stone * t_scale * t) * _exp_env(n, sr, 0.05 * decay)
        nz = _filt(noise(n / sr), sr, "bandpass", (1500, 9000)) * _exp_env(n, sr, 0.09 * decay)
        x = 0.6 * tone + 0.8 * nz
    elif voice == "clap":
        n = int(0.4 * decay * sr)
        nz = _filt(noise(n / sr), sr, "bandpass", (900, 3500))
        env = np.zeros(n, dtype=np.float32)
        for d in (0.0, 0.011, 0.023):  # three hands, then the room
            i = int(d * sr)
            env[i:] += _exp_env(n - i, sr, 0.008)
        i = int(0.03 * sr)
        env[i:] += 0.5 * _exp_env(n - i, sr, 0.12 * decay)
        x = nz * env
    elif voice in ("hat", "open_hat"):
        dur = (0.06 if voice == "hat" else 0.45) * decay
        n = int(dur * sr)
        t = np.arange(n) / sr
        # Metallic: inharmonic squares (808 recipe) + noise, high-passed.
        ratios = (2.0, 3.0, 4.16, 5.43, 6.79, 8.21)
        metal = sum(np.sign(np.sin(TAU * 310.0 * t_scale * r * t)) for r in ratios) / len(ratios)
        x = _filt(0.6 * metal + 0.6 * noise(n / sr), sr, "highpass", hatf)
        x *= _exp_env(n, sr, dur / 3.5)
    elif voice == "rim":
        n = int(0.08 * decay * sr)
        t = np.arange(n) / sr
        x = (np.sin(TAU * 1700 * t_scale * t) + 0.5 * np.sin(TAU * 520 * t_scale * t)) * _exp_env(n, sr, 0.012)
    elif voice == "perc":  # shaker / conga-ish tick
        n = int(0.12 * decay * sr)
        x = _filt(noise(n / sr), sr, "bandpass", (3000, 9000)) * _exp_env(n, sr, 0.03 * decay)
        t = np.arange(n) / sr
        x += 0.4 * np.sin(TAU * 330 * t_scale * t) * _exp_env(n, sr, 0.04)
    else:
        return np.zeros(1, dtype=np.float32)

    x = np.asarray(x, dtype=np.float32)
    if lp < 19000:
        x = _filt(x, sr, "lowpass", lp)
    peak = float(np.max(np.abs(x))) or 1.0
    fade = min(64, x.size)
    x[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return (x / peak).astype(np.float32)


_VOICE_GAIN = {"kick": 1.0, "snare": 0.7, "clap": 0.65, "hat": 0.35, "open_hat": 0.3, "rim": 0.45, "perc": 0.35}
_VOICE_PAN = {"hat": 0.15, "open_hat": 0.2, "perc": -0.25, "rim": -0.1}


def render_drums(clip: PatternClip, inst: Instrument, bpm: float, sr: int) -> np.ndarray:
    beat = 60.0 / bpm
    n = int(round(clip.length_beats * beat * sr))
    out = np.zeros((2, n), dtype=np.float32)
    spb = clip.steps_per_beat
    step_sec = beat / spb
    cycles = int(np.ceil(clip.length_beats / clip.pattern_beats))

    for voice, vels in clip.lanes.items():
        hit = drum_hit(voice, inst.kit, sr, inst.tune, inst.decay) * _VOICE_GAIN.get(voice, 0.5)
        pan = _VOICE_PAN.get(voice, 0.0)
        gl, gr = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2), np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        rolls = clip.rolls.get(voice, [])
        for c in range(cycles):
            base = c * clip.pattern_beats * beat
            for s, v in enumerate(vels[: int(round(clip.pattern_beats * spb))]):
                if v <= 0:
                    continue
                t = base + s * step_sec
                # Swing: odd 16ths (the "e" and "a") arrive late.
                if clip.swing > 0 and (s * 4 // spb) % 2 == 1 and (s * 4) % spb == 0:
                    t += clip.swing * beat / 4
                r = rolls[s] if s < len(rolls) and rolls[s] > 1 else 1
                for j in range(r):
                    i0 = int(round((t + j * step_sec / r) * sr))
                    if i0 >= n:
                        break
                    vel = v * (1.0 - 0.25 * j / r if r > 1 else 1.0)
                    seg = hit[: n - i0] * np.float32(vel)
                    out[0, i0:i0 + seg.size] += seg * np.float32(gl)
                    out[1, i0:i0 + seg.size] += seg * np.float32(gr)
    return out


# ---------------------------------------------------------------- oscillators

def _phase(freq: np.ndarray, sr: int, start: float = 0.0) -> np.ndarray:
    return (start + np.cumsum(freq) / sr) % 1.0


def _blep(t: np.ndarray, dt: np.ndarray) -> np.ndarray:
    out = np.zeros_like(t)
    a = t < dt
    x = t[a] / dt[a]
    out[a] = 2 * x - x * x - 1
    b = t > 1 - dt
    x = (t[b] - 1) / dt[b]
    out[b] = x * x + 2 * x + 1
    return out


def saw(freq: np.ndarray, sr: int, phase0: float = 0.0) -> np.ndarray:
    t = _phase(freq, sr, phase0)
    dt = np.clip(freq / sr, 1e-6, 0.5)
    return (2 * t - 1 - _blep(t, dt)).astype(np.float32)


def square(freq: np.ndarray, sr: int) -> np.ndarray:
    t = _phase(freq, sr)
    dt = np.clip(freq / sr, 1e-6, 0.5)
    sq = np.where(t < 0.5, 1.0, -1.0) + _blep(t, dt) - _blep((t + 0.5) % 1.0, dt)
    return sq.astype(np.float32)


def sine(freq: np.ndarray, sr: int) -> np.ndarray:
    return np.sin(TAU * _phase(freq, sr)).astype(np.float32)


def adsr(n: int, sr: int, gate_n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    """Attack/decay/sustain while the note is held (gate_n samples), then release."""
    env = np.zeros(n, dtype=np.float32)
    an = max(1, int(a * sr))
    dn = max(1, int(d * sr))
    g = min(gate_n, n)
    idx = np.arange(g)
    held = np.where(idx < an, idx / an, s + (1 - s) * np.exp(-(idx - an) / dn))
    env[:g] = held
    level = float(held[-1]) if g else 0.0
    rn = n - g
    if rn > 0:
        env[g:] = level * np.exp(-np.arange(rn) / max(1, r * sr / 5))
    return env


# ---------------------------------------------------------------- presets

def _voice(note: Note, inst: Instrument, sr: int, beat: float, transpose: float) -> np.ndarray:
    """One note of a polyphonic preset → (2, n), release tail included."""
    gate_sec = note.length * beat
    rel = inst.release_ms / 1000
    a = inst.attack_ms / 1000
    n = int((gate_sec + rel) * sr) + 1
    gate_n = int(gate_sec * sr)
    f = float(midi_hz(note.pitch + transpose))
    fr = np.full(n, f)
    p = inst.preset
    det = 1 + inst.detune * 0.012

    if p == "pad":
        l = saw(fr / det, sr, 0.1) + saw(fr, sr, 0.5)
        r = saw(fr * det, sr, 0.7) + saw(fr, sr, 0.3)
        env = adsr(n, sr, gate_n, max(a, 0.02), 0.8, 0.8, rel)
        l, r = _filt(l, sr, "lowpass", inst.cutoff), _filt(r, sr, "lowpass", inst.cutoff)
        return np.stack([l * env, r * env]) * 0.25
    if p == "keys":  # electric-piano-ish: sine + decaying bell partial + soft tremolo
        t = np.arange(n) / sr
        tine = sine(fr * 2, sr) * _exp_env(n, sr, 0.25)
        x = sine(fr, sr) + 0.35 * tine + 0.08 * sine(fr * 3, sr) * _exp_env(n, sr, 0.1)
        x *= 1 + 0.08 * np.sin(TAU * 4.5 * t)
        env = adsr(n, sr, gate_n, max(a, 0.004), 1.2, 0.35, rel)
        x = _filt(x * env, sr, "lowpass", inst.cutoff)
        return np.stack([x, x]) * 0.4
    if p in ("pluck", "lead"):
        raw = saw(fr, sr) + (0.5 * square(fr * det, sr) if p == "lead" else 0)
        dark = _filt(raw, sr, "lowpass", 400)
        bright = _filt(raw, sr, "lowpass", inst.cutoff)
        if p == "pluck":
            k = _exp_env(n, sr, 0.12)
            x = bright * k + dark * (1 - k)
            env = adsr(n, sr, gate_n, 0.002, 0.25, 0.0, rel)
        else:
            x = bright
            env = adsr(n, sr, gate_n, max(a, 0.01), 0.3, 0.7, rel)
        x = x * env
        return np.stack([x, x]) * 0.3
    if p == "bell":  # FM, ratio 3.5, index decaying
        t = np.arange(n) / sr
        idx = 3.0 * _exp_env(n, sr, 0.4)
        x = np.sin(TAU * f * t + idx * np.sin(TAU * f * 3.5 * t)).astype(np.float32)
        x *= adsr(n, sr, gate_n, 0.002, 1.0, 0.0, max(rel, 0.8))
        return np.stack([x, x]) * 0.3
    # Bass presets played polyphonically (no glide).
    x = _bass_wave(np.full(n, f), inst, sr) * adsr(n, sr, gate_n, max(a, 0.003), 0.4 if p == "pluck_bass" else 2.0,
                                                   0.0 if p == "pluck_bass" else 1.0, rel)
    return np.stack([x, x])


def _bass_wave(freq: np.ndarray, inst: Instrument, sr: int) -> np.ndarray:
    p = inst.preset
    if p == "reese":
        det = 1 + inst.detune * 0.01
        x = (saw(freq / det, sr) + saw(freq * det, sr, 0.37)) * 0.5
        x = _filt(x, sr, "lowpass", min(inst.cutoff, 1500))
    elif p == "pluck_bass":
        raw = saw(freq, sr)
        k = _exp_env(freq.size, sr, 0.08)
        x = _filt(raw, sr, "lowpass", min(inst.cutoff, 3000)) * k + _filt(raw, sr, "lowpass", 250) * (1 - k)
    else:  # sub / 808
        x = sine(freq, sr) + 0.15 * sine(freq * 2, sr)
    if inst.drive_db > 0:
        g = 10 ** (inst.drive_db / 20)
        x = np.tanh(x * g) / np.tanh(g)
    return (x * 0.6).astype(np.float32)


def _render_808(notes: list[Note], inst: Instrument, sr: int, beat: float, transpose: float, n: int) -> np.ndarray:
    """Monophonic 808: each note retriggers a long decay; a note that starts
    where the previous ended slides to its pitch (glide)."""
    out = np.zeros(n, dtype=np.float32)
    notes = sorted(notes, key=lambda x: x.start)
    prev_end, prev_pitch = -1.0, None
    for i, note in enumerate(notes):
        s0 = int(round(note.start * beat * sr))
        if s0 >= n:
            break
        nxt = notes[i + 1].start * beat * sr if i + 1 < len(notes) else n
        length = int(min(nxt, s0 + (note.length * beat + inst.decay) * sr)) - s0
        length = max(16, min(length, n - s0))
        f1 = float(midi_hz(note.pitch + transpose))
        freq = np.full(length, f1)
        slide = prev_pitch is not None and inst.glide_ms > 0 and abs(note.start - prev_end) < 0.02
        if slide:
            gn = min(length, int(inst.glide_ms / 1000 * sr))
            f0 = float(midi_hz(prev_pitch + transpose))
            freq[:gn] = f0 * (f1 / f0) ** np.linspace(0, 1, gn)
        else:
            # Punch: a few semitones of pitch drop in the first 30 ms.
            freq *= 1 + 0.25 * np.exp(-np.arange(length) / (0.012 * sr))
        x = _bass_wave(freq, inst, sr)
        env = np.minimum(1.0, np.arange(length) / max(1, 0.002 * sr)) * _exp_env(length, sr, max(inst.decay, 0.05) / 2)
        # Cut (short fade) when the next note takes over.
        tail = min(64, length)
        env[-tail:] *= np.linspace(1, 0, tail)
        out[s0:s0 + length] += x * env
        prev_end, prev_pitch = note.start + note.length, note.pitch
    return np.stack([out, out])


def render_notes(clip: PatternClip, inst: Instrument, bpm: float, sr: int, transpose: float) -> np.ndarray:
    beat = 60.0 / bpm
    n = int(round(clip.length_beats * beat * sr))
    cycles = int(np.ceil(clip.length_beats / clip.pattern_beats))
    notes = [
        Note(start=nt.start + c * clip.pattern_beats, length=nt.length, pitch=nt.pitch, vel=nt.vel)
        for c in range(cycles) for nt in clip.notes
        if nt.start < clip.pattern_beats and nt.start + c * clip.pattern_beats < clip.length_beats
    ]
    if inst.preset == "808":
        return _render_808(notes, inst, sr, beat, transpose, n)

    out = np.zeros((2, n), dtype=np.float32)
    for note in notes:
        i0 = int(round(note.start * beat * sr))
        if i0 >= n:
            continue
        v = _voice(note, inst, sr, beat, transpose) * np.float32(note.vel)
        m = min(v.shape[1], n - i0)
        out[:, i0:i0 + m] += v[:, :m]
    return out
