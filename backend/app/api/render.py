from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from app.dsp import render as dsp
from app.models import EffectChain, RenderRequest, RenderResponse
from app.storage import find_render, find_upload

router = APIRouter()

MIME_BY_EXT = {".wav": "audio/wav", ".mp3": "audio/mpeg"}


def _resolve(req: RenderRequest) -> tuple[Path, EffectChain]:
    path = find_upload(req.track_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Track not found")
    if req.params.per_stem is not None:
        raise HTTPException(status_code=501, detail="Per-stem rendering not implemented (F5)")
    return path, req.params.global_chain


@router.post("/render/export", response_model=RenderResponse)
def export(req: RenderRequest):
    path, chain = _resolve(req)
    try:
        render_id, out, duration = dsp.export(
            path, chain, req.format, req.region_start_sec, req.region_end_sec
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Render failed: {e}") from e

    return RenderResponse(render_id=render_id, path=str(out), duration_sec=duration)


@router.post("/render/preview")
def preview(req: RenderRequest):
    """Short 16-bit WAV streamed back for audition. Not persisted."""
    path, chain = _resolve(req)
    try:
        wav = dsp.preview_wav(path, chain, req.region_start_sec, req.region_end_sec)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Preview failed: {e}") from e

    return Response(
        content=wav,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/render/file/{render_id}")
def get_file(render_id: str):
    path = find_render(render_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Render not found")
    mime = MIME_BY_EXT.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=mime, filename=path.name)
