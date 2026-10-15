from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.flip import render as flip
from app.models import FlipRenderRequest, OnsetsResponse, RenderResponse

router = APIRouter()


def _errors(e: Exception, what: str) -> HTTPException:
    if isinstance(e, flip.MissingSource):
        return HTTPException(status_code=409, detail=str(e))
    if isinstance(e, FileNotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    if isinstance(e, ValueError):
        return HTTPException(status_code=400, detail=str(e))
    return HTTPException(status_code=500, detail=f"{what} failed: {e}")


@router.post("/flip/preview")
def preview(req: FlipRenderRequest):
    """WAV 16-bit of the project (or the [start_beat, end_beat) window), max 120 s."""
    try:
        wav = flip.preview_wav(req.track_id, req.project, req.master, req.start_beat, req.end_beat)
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Flip preview") from e
    return Response(content=wav, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@router.post("/flip/export", response_model=RenderResponse)
def export(req: FlipRenderRequest):
    try:
        render_id, out, duration = flip.export(req.track_id, req.project, req.master, req.format)
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Flip export") from e
    return RenderResponse(render_id=render_id, path=str(out), duration_sec=duration)


@router.get("/flip/onsets/{track_id}", response_model=OnsetsResponse)
def onsets(
    track_id: str,
    source: str = Query("vocals", pattern="^(vocals|drums|bass|other|mix)$"),
    start: float = Query(..., ge=0.0),
    end: float = Query(..., gt=0.0),
):
    """Transients inside a slice: where to chop."""
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be greater than start")
    try:
        return OnsetsResponse(times=flip.onsets(track_id, source, start, end))
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Onset detection") from e
