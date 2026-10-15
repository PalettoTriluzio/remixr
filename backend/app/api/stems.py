from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

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


@router.get("/stems/{track_id}/{stem}")
def get_stem_file(track_id: str, stem: str):
    stems = find_stems(track_id)
    if stems is None or stem not in stems:
        raise HTTPException(status_code=404, detail="Stem not found")
    return FileResponse(stems[stem], media_type="audio/wav", filename=f"{track_id[:8]}_{stem}.wav")
