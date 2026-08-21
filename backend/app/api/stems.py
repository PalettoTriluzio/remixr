from fastapi import APIRouter, HTTPException

from app.models import StemsJobResponse

router = APIRouter()


@router.post("/stems/{track_id}", response_model=StemsJobResponse)
def start_stems(track_id: str):
    raise HTTPException(status_code=501, detail="Not implemented (F5)")


@router.get("/stems/{track_id}", response_model=StemsJobResponse)
def get_stems_status(track_id: str):
    raise HTTPException(status_code=501, detail="Not implemented (F5)")
