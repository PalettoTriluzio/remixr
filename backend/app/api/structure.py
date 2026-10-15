from fastapi import APIRouter, HTTPException

from app.analysis.structure import structure_for
from app.models import StructureResponse

router = APIRouter()


@router.get("/structure/{track_id}", response_model=StructureResponse)
def structure(track_id: str):
    """Beat grid, sections, chords. Uses the stems when they exist (more
    accurate); cached per track and source in data/analysis/."""
    try:
        result = structure_for(track_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Structure analysis failed: {e}") from e
    if result is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return result
