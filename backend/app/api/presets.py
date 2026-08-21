from fastapi import APIRouter, HTTPException

from app.models import Preset

router = APIRouter()


@router.get("/presets", response_model=list[Preset])
def list_presets():
    raise HTTPException(status_code=501, detail="Not implemented (F6)")


@router.post("/presets", response_model=Preset)
def create_preset(preset: Preset):
    raise HTTPException(status_code=501, detail="Not implemented (F6)")


@router.delete("/presets/{name}")
def delete_preset(name: str):
    raise HTTPException(status_code=501, detail="Not implemented (F6)")


@router.get("/genre-templates", response_model=list[Preset])
def list_genre_templates():
    raise HTTPException(status_code=501, detail="Not implemented (F6)")
