from fastapi import APIRouter, HTTPException

from app.models import Preset
from app.presets import store

router = APIRouter()


@router.get("/presets", response_model=list[Preset])
def list_presets():
    return store.list_presets()


@router.post("/presets", response_model=Preset)
def create_preset(preset: Preset):
    try:
        return store.save_preset(preset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/presets/{name}")
def delete_preset(name: str):
    if not store.delete_preset(name):
        raise HTTPException(status_code=404, detail="Preset not found")
    return {"deleted": name}


@router.get("/genre-templates", response_model=list[Preset])
def list_genre_templates():
    return store.list_genre_templates()
