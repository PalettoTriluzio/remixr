import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from app.audio.loader import ALLOWED_EXTS, audio_info
from app.models import UploadResponse
from app.storage import UPLOADS_DIR, find_upload

router = APIRouter()

MAX_FILE_MB = 200
MIME_BY_EXT = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac",
    ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".aac": "audio/aac",
}


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format {ext}. Allowed: {sorted(ALLOWED_EXTS)}",
        )

    track_id = uuid.uuid4().hex
    dest = UPLOADS_DIR / f"{track_id}{ext}"

    size = 0
    chunk_size = 1024 * 1024  # 1 MB
    with dest.open("wb") as f:
        while chunk := await file.read(chunk_size):
            size += len(chunk)
            if size > MAX_FILE_MB * 1024 * 1024:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"File exceeds {MAX_FILE_MB} MB limit")
            f.write(chunk)

    try:
        duration, sr, channels = audio_info(dest)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Cannot decode audio: {e}") from e

    return UploadResponse(
        track_id=track_id,
        filename=file.filename,
        duration_sec=duration,
        sample_rate=sr,
        channels=channels,
    )


@router.get("/audio/{track_id}")
def stream_audio(track_id: str):
    """Stream the raw uploaded audio file (used by wavesurfer.js on the client)."""
    path = find_upload(track_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Track not found")
    mime = MIME_BY_EXT.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=mime, filename=path.name)
