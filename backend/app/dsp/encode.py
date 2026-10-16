"""MP3 320 kbps CBR.

ffmpeg (libmp3lame, already required for decoding MP3/M4A, README §3) gets
the float samples on stdin. Without ffmpeg: libsndfile's own LAME encoder
(soundfile >= 0.12) in constant bitrate at compression level 0 = 320 kbps.

Env: REMIXR_FFMPEG = path to ffmpeg.exe when it is not on PATH.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

BITRATE = "320k"
MP3_RATES = (8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000)


def ffmpeg_path() -> str | None:
    env = os.environ.get("REMIXR_FFMPEG")
    if env and Path(env).is_file():
        return env
    return shutil.which("ffmpeg")


def write_mp3(out: Path, samples: np.ndarray, sr: int, title: str | None = None) -> str:
    """samples (channels, n) float. Returns the encoder used ("ffmpeg" | "libsndfile")."""
    data = np.ascontiguousarray(np.clip(samples, -1.0, 1.0).T, dtype=np.float32)  # (n, channels)
    exe = ffmpeg_path()
    if exe:
        cmd = [
            exe, "-hide_banner", "-loglevel", "error", "-y",
            "-f", "f32le", "-ar", str(sr), "-ac", str(data.shape[1]), "-i", "pipe:0",
        ]
        if sr not in MP3_RATES:
            cmd += ["-ar", "48000" if sr > 48000 else "44100"]
        cmd += ["-codec:a", "libmp3lame", "-b:a", BITRATE, "-id3v2_version", "3"]
        if title:
            cmd += ["-metadata", f"title={title}"]
        cmd.append(str(out))
        try:
            proc = subprocess.run(cmd, input=data.tobytes(), capture_output=True, timeout=600)
            if proc.returncode == 0 and out.exists() and out.stat().st_size > 0:
                return "ffmpeg"
            err = proc.stderr.decode(errors="replace").strip()[-300:]
        except (OSError, subprocess.TimeoutExpired) as e:
            err = str(e)
        out.unlink(missing_ok=True)
        fallback_reason = f"ffmpeg failed ({err})"
    else:
        fallback_reason = "ffmpeg not found"

    if sr not in MP3_RATES:
        import librosa
        target = 48000 if sr > 48000 else 44100
        data = np.ascontiguousarray(librosa.resample(data.T, orig_sr=sr, target_sr=target, axis=1).T, dtype=np.float32)
        sr = target
    try:
        sf.write(str(out), data, sr, format="MP3", bitrate_mode="CONSTANT", compression_level=0.0)
    except Exception as exc:  # noqa: BLE001
        out.unlink(missing_ok=True)
        raise ValueError(f"MP3 export unavailable: {fallback_reason}; libsndfile: {exc}") from exc
    return "libsndfile"
