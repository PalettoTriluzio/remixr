from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.models import RenderRequest, RenderResponse

router = APIRouter()


@router.post("/render/export", response_model=RenderResponse)
def export(req: RenderRequest):
    raise HTTPException(status_code=501, detail="Not implemented (F2)")


@router.post("/render/preview")
def preview(req: RenderRequest):
    raise HTTPException(status_code=501, detail="Not implemented (F2)")


@router.get("/render/file/{render_id}")
def get_file(render_id: str):
    raise HTTPException(status_code=501, detail="Not implemented (F2)")
