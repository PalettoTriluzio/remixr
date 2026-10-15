"""Stem separation with demucs (vocals / drums / bass / other).

One background worker, one job per track. Results live in
data/stems/<track_id>/: four WAVs at the original sample rate and length (so
they line up sample-for-sample with the upload) + meta.json, written last as
the "done" marker. Finished separations survive a backend restart.

torch/demucs are imported lazily: without them the rest of the app runs and
the job ends in "error" with the import message.

Env:
  REMIXR_STEMS_MODEL   demucs model (default: htdemucs_ft on GPU — best vocals,
                       4 passes — htdemucs on CPU, 4x faster)
  REMIXR_STEMS_DEVICE  "cuda" | "cpu" (default: cuda if available)
"""
from __future__ import annotations

import json
import os
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import soundfile as sf

from app.audio.loader import load_audio
from app.storage import STEM_NAMES, find_stems, stems_dir

STEM_SUBTYPE = "PCM_24"


@dataclass
class Job:
    track_id: str
    status: str = "pending"  # pending | running | done | error
    progress: float = 0.0
    model: str | None = None
    device: str | None = None
    started: float = field(default_factory=time.time)
    elapsed_sec: float | None = None
    error: str | None = None


_jobs: dict[str, Job] = {}
_jobs_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="stems")
_models: dict[str, object] = {}  # name → demucs model, kept on CPU between jobs


def _pick_device() -> str:
    import torch
    wanted = os.environ.get("REMIXR_STEMS_DEVICE")
    if wanted:
        return wanted
    return "cuda" if torch.cuda.is_available() else "cpu"


def _model_name(device: str) -> str:
    return os.environ.get("REMIXR_STEMS_MODEL") or ("htdemucs_ft" if device == "cuda" else "htdemucs")


def _get_model(name: str):
    if name not in _models:
        from demucs.pretrained import get_model  # first call downloads the weights
        model = get_model(name)
        model.eval()
        _models[name] = model
    return _models[name]


class _Progress:
    """Stands in for `tqdm` inside demucs.apply: apply_model iterates its
    segments through tqdm.tqdm(...) when progress=True. A bag of N models
    (htdemucs_ft) runs N passes, each with its own loop."""

    def __init__(self, job: Job, passes: int):
        self.job, self.passes, self.done_passes = job, max(1, passes), 0

    def tqdm(self, iterable, **_kw):
        items = list(iterable)
        total = max(1, len(items))
        for i, item in enumerate(items):
            yield item
            self.job.progress = min(0.99, (self.done_passes + (i + 1) / total) / self.passes)
        self.done_passes += 1


def _separate(job: Job, path: Path) -> None:
    import torch
    import demucs.apply as dapply

    device = _pick_device()
    name = _model_name(device)
    job.device, job.model = device, name
    model = _get_model(name)

    samples, sr = load_audio(path)  # (channels, n), original sr
    channels, n = samples.shape
    model_sr = int(model.samplerate)

    x = samples
    if channels == 1:
        x = np.repeat(x, 2, axis=0)
    elif channels > 2:
        x = x[:2]
    if sr != model_sr:
        import librosa
        x = librosa.resample(x, orig_sr=sr, target_sr=model_sr, axis=1)

    wav = torch.from_numpy(np.ascontiguousarray(x, dtype=np.float32))
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    wav = (wav - mean) / std

    passes = len(getattr(model, "models", [model]))
    progress = _Progress(job, passes)
    # demucs.apply does `import tqdm` (module) in 4.x; handle a bare function too.
    original_tqdm = dapply.tqdm
    dapply.tqdm = SimpleNamespace(tqdm=progress.tqdm) if hasattr(original_tqdm, "tqdm") else progress.tqdm

    def run(dev: str):
        model.to(dev)
        with torch.no_grad():
            return dapply.apply_model(
                model, wav[None], device=dev, shifts=1, split=True, overlap=0.25, progress=True
            )[0]

    try:
        try:
            out = run(device)
        except RuntimeError as e:
            # The LLM sits in VRAM too: on OOM fall back to the CPU (slow, but it finishes).
            if device != "cuda" or "out of memory" not in str(e).lower():
                raise
            torch.cuda.empty_cache()
            job.device, progress.done_passes, job.progress = "cpu", 0, 0.0
            out = run("cpu")
    finally:
        dapply.tqdm = original_tqdm
        model.to("cpu")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    out = (out * std + mean).cpu().numpy()  # (sources, 2, n_model)

    tmp = stems_dir(job.track_id).with_name(job.track_id + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    for src_name, stem in zip(model.sources, out):
        if src_name not in STEM_NAMES:
            continue
        if sr != model_sr:
            import librosa
            stem = librosa.resample(stem, orig_sr=model_sr, target_sr=sr, axis=1)
        if channels == 1:
            stem = stem.mean(axis=0, keepdims=True)
        # Same length as the upload, so stems and original share one timeline.
        if stem.shape[1] >= n:
            stem = stem[:, :n]
        else:
            stem = np.pad(stem, ((0, 0), (0, n - stem.shape[1])))
        sf.write(str(tmp / f"{src_name}.wav"), np.clip(stem, -1.0, 1.0).T, sr, subtype=STEM_SUBTYPE)

    job.elapsed_sec = round(time.time() - job.started, 1)
    meta = {"model": job.model, "device": job.device, "elapsed_sec": job.elapsed_sec, "sample_rate": sr}
    (tmp / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    final = stems_dir(job.track_id)
    shutil.rmtree(final, ignore_errors=True)
    tmp.rename(final)


def _run(job: Job, path: Path) -> None:
    job.status, job.started = "running", time.time()
    try:
        _separate(job, path)
        job.status, job.progress = "done", 1.0
    except Exception as e:  # noqa: BLE001
        job.status, job.error = "error", f"{type(e).__name__}: {e}"
        job.elapsed_sec = round(time.time() - job.started, 1)


def _from_disk(track_id: str) -> Job | None:
    if find_stems(track_id) is None:
        return None
    try:
        meta = json.loads((stems_dir(track_id) / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        meta = {}
    return Job(
        track_id, status="done", progress=1.0,
        model=meta.get("model"), device=meta.get("device"), elapsed_sec=meta.get("elapsed_sec"),
    )


def status(track_id: str) -> Job | None:
    with _jobs_lock:
        job = _jobs.get(track_id)
    if job is not None and job.status != "done":
        return job
    return _from_disk(track_id) or job


def start(track_id: str, path: Path) -> Job:
    """Queue a separation. Already done / in progress → that job."""
    with _jobs_lock:
        job = _jobs.get(track_id)
        if job is not None and job.status in ("pending", "running"):
            return job
        done = _from_disk(track_id)
        if done is not None:
            return done
        job = Job(track_id)
        _jobs[track_id] = job
    _executor.submit(_run, job, path)
    return job
