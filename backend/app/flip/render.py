"""FlipProject → audio.

Per clip (cached, so editing one clip re-renders only that one):
    slice of the source → tune/harmony → reverse → warp or repitch to the
    project tempo (+ transpose) → loop to length → HP/LP
Then, positioned on the timeline: gate on the project grid, fades, gain.
Per track: sum of its clips → track chain (tempo ignored) → pan/gain.
Master: sum of the audible tracks → master chain (the rack).

Everything runs at the upload's sample rate (stems share it, see
app/stems/separate.py) and in stereo.
"""
from __future__ import annotations

import hashlib
import uuid
from collections import OrderedDict
from pathlib import Path

import numpy as np
from pedalboard import HighpassFilter, LowpassFilter, Pedalboard

from app.dsp.chain import EPS, process, time_pitch
from app.dsp.render import EXPORT_SUBTYPE, PREVIEW_SUBTYPE, decode, write_audio
from app.flip.instruments import render_drums, render_notes
from app.flip.tune import retune
from app.models import EffectChain, FlipClip, FlipProject, FlipTrack, PatternClip
from app.storage import RENDERS_DIR, find_stems, find_upload

PREVIEW_MAX_SEC = 120.0
GATE_STEPS = {"1/4": 1, "1/8": 2, "1/16": 4, "1/32": 8}  # per beat
GATE_SMOOTH_SEC = 0.002

_CLIP_CACHE_MAX = 48
_clip_cache: "OrderedDict[str, np.ndarray]" = OrderedDict()


class MissingSource(Exception):
    """Clip needs stems that were never separated (→ 409)."""


def _source_path(track_id: str, source: str) -> Path:
    if source == "mix":
        path = find_upload(track_id)
        if path is None:
            raise FileNotFoundError("Track not found")
        return path
    stems = find_stems(track_id)
    if stems is None:
        raise MissingSource(f"Clip uses the '{source}' stem but the track has no stems: separate them first")
    return stems[source]


def _stereo(x: np.ndarray) -> np.ndarray:
    if x.shape[0] == 2:
        return x
    if x.shape[0] == 1:
        return np.repeat(x, 2, axis=0)
    return x[:2]


def _fit(x: np.ndarray, n: int) -> np.ndarray:
    if x.shape[1] >= n:
        return x[:, :n]
    return np.pad(x, ((0, 0), (0, n - x.shape[1])))


def _resample_speed(x: np.ndarray, sr: int, speed: float) -> np.ndarray:
    """Turntable: play `speed` times faster, pitch follows."""
    import librosa
    if abs(speed - 1.0) <= EPS:
        return x
    return librosa.resample(x, orig_sr=sr * speed, target_sr=sr, axis=1).astype(np.float32)


def _clip_key(track_id: str, clip: FlipClip, project: FlipProject, semis: float, path: Path) -> str:
    shape = clip.model_dump(exclude={"id", "at_beat", "gain_db", "gate", "gate_duty", "fade_in_ms", "fade_out_ms"})
    raw = f"{track_id}|{path}|{path.stat().st_mtime_ns}|{project.bpm}|{project.source_key}|{semis}|{sorted(shape.items())}"
    return hashlib.sha1(raw.encode()).hexdigest()


def clip_audio(track_id: str, clip: FlipClip, project: FlipProject, follow_key: bool, sr: int) -> np.ndarray:
    """The clip rendered to its full length_beats, unpositioned. (2, n) at `sr`
    (the upload's rate, shared by the stems)."""
    path = _source_path(track_id, clip.source)
    semis = clip.semitones + (project.transpose if follow_key else 0.0)
    key = _clip_key(track_id, clip, project, semis, path)

    cached = _clip_cache.get(key)
    if cached is not None:
        _clip_cache.move_to_end(key)
        return cached

    x, src_sr = decode(path, clip.src_start, clip.src_end)
    if src_sr != sr:
        import librosa
        x = librosa.resample(x, orig_sr=src_sr, target_sr=sr, axis=1)
    x = _stereo(np.ascontiguousarray(x, dtype=np.float32))
    if clip.tune > 0 or clip.harmony != 0:
        x = retune(x, sr, project.source_key, clip.tune, clip.harmony)
    if clip.reverse:
        x = np.ascontiguousarray(x[:, ::-1])

    beat_sec = 60.0 / project.bpm
    cycle_sec = (clip.src_beats if clip.loop else clip.length_beats) * beat_sec
    src_sec = x.shape[1] / sr
    speed = src_sec / cycle_sec if cycle_sec > 0 else 1.0

    if clip.stretch == "warp":
        y = time_pitch(x, sr, speed, semis)
    else:
        y = _resample_speed(x, sr, speed)
        if abs(semis) > EPS:
            y = time_pitch(y, sr, 1.0, semis)
    y = _fit(np.ascontiguousarray(y, dtype=np.float32), max(1, round(cycle_sec * sr)))

    total = max(1, round(clip.length_beats * beat_sec * sr))
    if clip.loop and y.shape[1] < total:
        y = np.tile(y, (1, int(np.ceil(total / y.shape[1]))))
    y = _fit(y, total)

    fx = []
    if clip.hp_freq > 20.5:
        fx.append(HighpassFilter(cutoff_frequency_hz=clip.hp_freq))
    if clip.lp_freq < 19999.0:
        fx.append(LowpassFilter(cutoff_frequency_hz=clip.lp_freq))
    if fx:
        y = Pedalboard(fx)(y, sr, reset=True)

    y = np.ascontiguousarray(y, dtype=np.float32)
    _clip_cache[key] = y
    while len(_clip_cache) > _CLIP_CACHE_MAX:
        _clip_cache.popitem(last=False)
    return y


def pattern_audio(clip: PatternClip, track: FlipTrack, project: FlipProject, sr: int) -> np.ndarray:
    """A generated clip (drums / notes) rendered to its full length, cached."""
    transpose = project.transpose if track.follow_key else 0.0
    raw = (f"{clip.model_dump_json(exclude={'id', 'at_beat', 'gain_db'})}|{track.kind}|"
           f"{track.instrument.model_dump_json()}|{project.bpm}|{transpose}|{sr}")
    key = "p" + hashlib.sha1(raw.encode()).hexdigest()
    cached = _clip_cache.get(key)
    if cached is not None:
        _clip_cache.move_to_end(key)
        return cached
    if track.kind == "drums":
        y = render_drums(clip, track.instrument, project.bpm, sr)
    else:
        y = render_notes(clip, track.instrument, project.bpm, sr, transpose)
    y = np.ascontiguousarray(y, dtype=np.float32)
    _clip_cache[key] = y
    while len(_clip_cache) > _CLIP_CACHE_MAX:
        _clip_cache.popitem(last=False)
    return y


def _place(buf: np.ndarray, audio: np.ndarray, c0: float, c1: float, b0: float, beat_sec: float, sr: int) -> bool:
    """Add a clip spanning project beats [c0, c1) to a window buffer starting at b0."""
    n = buf.shape[1]
    off = round((c0 - b0) * beat_sec * sr)  # may be negative: clip starts before the window
    end_in_clip = round((c1 - c0) * beat_sec * sr)
    src_from = max(0, -off)
    dst_from = max(0, off)
    length = min(end_in_clip - src_from, n - dst_from, audio.shape[1] - src_from)
    if length <= 0:
        return False
    buf[:, dst_from:dst_from + length] += audio[:, src_from:src_from + length]
    return True


def _envelope(clip: FlipClip, n: int, sr: int, bpm: float) -> np.ndarray | None:
    """Gate (on the project grid) × fades × gain, or None if all neutral."""
    env = None
    if clip.gate != "off":
        steps = GATE_STEPS[clip.gate]
        beats = clip.at_beat + np.arange(n) / (sr * 60.0 / bpm)
        env = (np.mod(beats * steps, 1.0) < clip.gate_duty).astype(np.float32)
        k = max(1, int(GATE_SMOOTH_SEC * sr))
        env = np.convolve(env, np.ones(k, dtype=np.float32) / k, mode="same")

    fi = min(n, int(clip.fade_in_ms / 1000 * sr))
    fo = min(n, int(clip.fade_out_ms / 1000 * sr))
    if fi or fo:
        if env is None:
            env = np.ones(n, dtype=np.float32)
        if fi:
            env[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
        if fo:
            env[n - fo:] *= np.linspace(1, 0, fo, dtype=np.float32)

    if abs(clip.gain_db) > EPS:
        g = np.float32(10 ** (clip.gain_db / 20))
        env = np.full(n, g, dtype=np.float32) if env is None else env * g
    return env


def _pan(x: np.ndarray, pan: float, gain_db: float) -> np.ndarray:
    # Equal-power, normalised so the centre is unity.
    angle = (pan + 1.0) * np.pi / 4
    g = 10 ** (gain_db / 20) * np.sqrt(2.0)
    x[0] *= np.float32(np.cos(angle) * g)
    x[1] *= np.float32(np.sin(angle) * g)
    return x


def _audible(tracks: list[FlipTrack]) -> list[FlipTrack]:
    any_solo = any(t.solo and not t.mute for t in tracks)
    return [t for t in tracks if not t.mute and (t.solo or not any_solo) and t.gain_db > -60.0]


def render_project(
    track_id: str,
    project: FlipProject,
    master: EffectChain,
    start_beat: float | None = None,
    end_beat: float | None = None,
    max_sec: float | None = None,
) -> tuple[np.ndarray, int]:
    upload = find_upload(track_id)
    if upload is None:
        raise FileNotFoundError("Track not found")
    _, sr = decode(upload, 0.0, 0.1)

    beat_sec = 60.0 / project.bpm
    total_beats = project.bars * project.beats_per_bar
    b0 = 0.0 if start_beat is None else min(start_beat, total_beats)
    b1 = total_beats if end_beat is None else min(end_beat, total_beats)
    if max_sec is not None:
        b1 = min(b1, b0 + max_sec / beat_sec)
    if b1 <= b0:
        raise ValueError("Empty window")
    n = round((b1 - b0) * beat_sec * sr)
    mix = np.zeros((2, n), dtype=np.float32)

    for track in _audible(project.tracks):
        buf = np.zeros((2, n), dtype=np.float32)
        used = False
        if track.kind == "audio":
            for clip in track.clips:
                c0, c1 = clip.at_beat, min(clip.at_beat + clip.length_beats, total_beats)
                if c1 <= b0 or c0 >= b1:
                    continue
                audio = clip_audio(track_id, clip, project, track.follow_key, sr)
                env = _envelope(clip, audio.shape[1], sr, project.bpm)
                if env is not None:
                    audio = audio * env
                used |= _place(buf, audio, c0, c1, b0, beat_sec, sr)
        else:
            for pat in track.patterns:
                c0, c1 = pat.at_beat, min(pat.at_beat + pat.length_beats, total_beats)
                if c1 <= b0 or c0 >= b1:
                    continue
                audio = pattern_audio(pat, track, project, sr)
                if abs(pat.gain_db) > EPS:
                    audio = audio * np.float32(10 ** (pat.gain_db / 20))
                used |= _place(buf, audio, c0, c1, b0, beat_sec, sr)
        if not used:
            continue
        chain = track.chain.model_copy(update={"tempo": track.chain.tempo.model_copy(update={"enabled": False})})
        buf = _stereo(process(buf, sr, chain))
        mix += _fit(_pan(buf, track.pan, track.gain_db), n)

    return process(mix, sr, master), sr


def preview_wav(track_id: str, project: FlipProject, master: EffectChain,
                start_beat: float | None, end_beat: float | None) -> bytes:
    import io
    samples, sr = render_project(track_id, project, master, start_beat, end_beat, PREVIEW_MAX_SEC)
    buf = io.BytesIO()
    write_audio(buf, samples, sr, fmt="WAV", subtype=PREVIEW_SUBTYPE)
    return buf.getvalue()


def export(track_id: str, project: FlipProject, master: EffectChain, fmt: str) -> tuple[str, Path, float]:
    samples, sr = render_project(track_id, project, master)
    render_id = uuid.uuid4().hex
    out = RENDERS_DIR / f"{render_id}.{fmt}"
    if fmt == "wav":
        write_audio(str(out), samples, sr, fmt="WAV", subtype=EXPORT_SUBTYPE)
    elif fmt == "mp3":
        try:
            write_audio(str(out), samples, sr, fmt="MP3")
        except Exception as exc:  # noqa: BLE001
            out.unlink(missing_ok=True)
            raise ValueError(f"MP3 encoding unavailable in this libsndfile build: {exc}") from exc
    else:
        raise ValueError(f"Unsupported format: {fmt}")
    return render_id, out, samples.shape[1] / sr


def onsets(track_id: str, source: str, start: float, end: float) -> list[float]:
    """Transients inside a slice (for chopping), absolute seconds."""
    import librosa
    x, sr = decode(_source_path(track_id, source), start, end)
    y = x.mean(axis=0)
    frames = librosa.onset.onset_detect(y=y, sr=sr, hop_length=512, backtrack=True, units="frames")
    times = librosa.frames_to_time(frames, sr=sr, hop_length=512)
    return [round(start + float(t), 3) for t in times if 0.03 < t < (end - start) - 0.03]
