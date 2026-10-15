import json

from fastapi import APIRouter, HTTPException

from app.analysis.structure import analyze_structure
from app.models import StructureResponse
from app.storage import ANALYSIS_DIR, find_stems, find_upload

router = APIRouter()

# Bump when the analysis changes: old cached results are recomputed.
VERSION = 1


@router.get("/structure/{track_id}", response_model=StructureResponse)
def structure(track_id: str):
    """Beat grid, sections, chords. Uses the stems when they exist (more
    accurate); cached per track and source in data/analysis/."""
    path = find_upload(track_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Track not found")
    stems = find_stems(track_id)
    cache = ANALYSIS_DIR / f"{track_id}.{'stems' if stems else 'mix'}.v{VERSION}.json"

    if cache.exists():
        try:
            return StructureResponse(**json.loads(cache.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            cache.unlink(missing_ok=True)

    try:
        result = StructureResponse(track_id=track_id, **analyze_structure(path, stems))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Structure analysis failed: {e}") from e
    cache.write_text(result.model_dump_json(), encoding="utf-8")
    return result
