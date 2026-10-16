from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from app.models import StemsJobResponse
from app.stems import separate
from app.storage import STEM_NAMES, find_stems, find_upload

router = APIRouter()


def _response(track_id: str, job: separate.Job | None) -> StemsJobResponse:
    if job is None:
        return StemsJobResponse(job_id=track_id, status="none")
    return StemsJobResponse(
        job_id=track_id,
        status=job.status,  # type: ignore[arg-type]
        progress=round(job.progress, 3),
        stems={n: f"/api/stems/{track_id}/{n}" for n in STEM_NAMES} if job.status == "done" else None,
        model=job.model,
        device=job.device,
        elapsed_sec=job.elapsed_sec,
        error=job.error,
    )


@router.post("/stems/{track_id}", response_model=StemsJobResponse)
def start_stems(track_id: str):
    path = find_upload(track_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return _response(track_id, separate.start(track_id, path))


@router.get("/stems/{track_id}", response_model=StemsJobResponse)
def get_stems_status(track_id: str):
    if find_upload(track_id) is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return _response(track_id, separate.status(track_id))


PEAKS_RATE = 100  # columns per second


def _peaks(wav) -> bytes:
    """Peak per 1/PEAKS_RATE s (mono, abs), uint8 scaled to the stem's own
    max. Cached next to the stem."""
    import numpy as np
    import soundfile as sf

    cache = wav.with_suffix(f".peaks{PEAKS_RATE}.u8")
    if cache.exists() and cache.stat().st_mtime_ns >= wav.stat().st_mtime_ns:
        return cache.read_bytes()
    info = sf.info(str(wav))
    hop = max(1, round(info.samplerate / PEAKS_RATE))
    cols: list[np.ndarray] = []
    for block in sf.blocks(str(wav), blocksize=hop * 4096, dtype="float32", always_2d=True):
        a = np.abs(block).max(axis=1)
        n = len(a) // hop * hop
        if n:
            cols.append(a[:n].reshape(-1, hop).max(axis=1))
        if len(a) > n:
            cols.append(np.array([a[n:].max()], dtype=np.float32))
    peaks = np.concatenate(cols) if cols else np.zeros(1, dtype=np.float32)
    data = np.round(peaks / max(float(peaks.max()), 1e-6) * 255).astype(np.uint8).tobytes()
    try:
        cache.write_bytes(data)
    except OSError:
        pass
    return data


@router.get("/stems/{track_id}/{stem}/peaks")
def get_stem_peaks(track_id: str, stem: str):
    """Waveform of a stem for the flip clips: uint8 peaks, PEAKS_RATE per second."""
    stems = find_stems(track_id)
    if stems is None or stem not in stems:
        raise HTTPException(status_code=404, detail="Stem not found")
    return Response(
        content=_peaks(stems[stem]), media_type="application/octet-stream",
        headers={"X-Peaks-Rate": str(PEAKS_RATE), "Cache-Control": "no-store"},
    )


@router.get("/stems/{track_id}/{stem}")
def get_stem_file(track_id: str, stem: str):
    stems = find_stems(track_id)
    if stems is None or stem not in stems:
        raise HTTPException(status_code=404, detail="Stem not found")
    return FileResponse(stems[stem], media_type="audio/wav", filename=f"{track_id[:8]}_{stem}.wav")
