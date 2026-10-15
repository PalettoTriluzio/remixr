"""Filesystem paths for user data. Central config so we can move them later."""
from pathlib import Path


BASE = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = BASE / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
RENDERS_DIR = DATA_DIR / "renders"
STEMS_DIR = DATA_DIR / "stems"
ANALYSIS_DIR = DATA_DIR / "analysis"
PRESETS_DIR = DATA_DIR / "presets"
GENRE_TEMPLATES_DIR = DATA_DIR / "genre_templates"
MODELS_DIR = BASE / "models"

for d in (UPLOADS_DIR, RENDERS_DIR, STEMS_DIR, ANALYSIS_DIR, PRESETS_DIR, GENRE_TEMPLATES_DIR, MODELS_DIR):
    d.mkdir(parents=True, exist_ok=True)


def find_upload(track_id: str) -> Path | None:
    """Given a track_id (uuid), find its uploaded file (any extension)."""
    matches = list(UPLOADS_DIR.glob(f"{track_id}.*"))
    return matches[0] if matches else None


def find_render(render_id: str) -> Path | None:
    """Given a render_id (uuid), find its rendered file (any extension)."""
    matches = list(RENDERS_DIR.glob(f"{render_id}.*"))
    return matches[0] if matches else None


STEM_NAMES = ("vocals", "drums", "bass", "other")


def stems_dir(track_id: str) -> Path:
    """data/stems/<track_id>/ — one WAV per stem + meta.json (written last)."""
    return STEMS_DIR / track_id


def find_stems(track_id: str) -> dict[str, Path] | None:
    """All four stems of a finished separation, or None."""
    d = stems_dir(track_id)
    if not (d / "meta.json").exists():
        return None
    paths = {name: d / f"{name}.wav" for name in STEM_NAMES}
    return paths if all(p.exists() for p in paths.values()) else None
