"""Filesystem paths for user data. Central config so we can move them later."""
from pathlib import Path


BASE = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = BASE / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
RENDERS_DIR = DATA_DIR / "renders"
STEMS_DIR = DATA_DIR / "stems"
PRESETS_DIR = DATA_DIR / "presets"
GENRE_TEMPLATES_DIR = DATA_DIR / "genre_templates"
MODELS_DIR = BASE / "models"

for d in (UPLOADS_DIR, RENDERS_DIR, STEMS_DIR, PRESETS_DIR, GENRE_TEMPLATES_DIR, MODELS_DIR):
    d.mkdir(parents=True, exist_ok=True)


def find_upload(track_id: str) -> Path | None:
    """Given a track_id (uuid), find its uploaded file (any extension)."""
    matches = list(UPLOADS_DIR.glob(f"{track_id}.*"))
    return matches[0] if matches else None
