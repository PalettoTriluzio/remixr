"""Preset I/O: user presets in data/presets/, genre templates in data/genre_templates/.

Files are Preset JSON. Templates may list only the effects they use: missing
fields take the Pydantic defaults (EffectChain is all-optional with defaults).
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from app.models import Preset
from app.storage import GENRE_TEMPLATES_DIR, PRESETS_DIR


def _slug(name: str) -> str:
    s = re.sub(r"[^\w\- ]+", "", name, flags=re.UNICODE).strip().replace(" ", "_")
    return s[:64]


def _read_dir(d: Path) -> list[Preset]:
    out = []
    for p in d.glob("*.json"):
        try:
            out.append(Preset.model_validate_json(p.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001 — a broken file must not hide the others
            continue
    return out


def list_presets() -> list[Preset]:
    return sorted(_read_dir(PRESETS_DIR), key=lambda p: p.created_at, reverse=True)


def save_preset(preset: Preset) -> Preset:
    slug = _slug(preset.name)
    if not slug:
        raise ValueError("Nome preset non valido")
    preset = preset.model_copy(update={
        "name": preset.name.strip(),
        "created_at": preset.created_at or datetime.now(timezone.utc).isoformat(),
    })
    (PRESETS_DIR / f"{slug}.json").write_text(preset.model_dump_json(indent=2), encoding="utf-8")
    return preset


def delete_preset(name: str) -> bool:
    p = PRESETS_DIR / f"{_slug(name)}.json"
    if not _slug(name) or not p.is_file():
        return False
    p.unlink()
    return True


def list_genre_templates() -> list[Preset]:
    return sorted(_read_dir(GENRE_TEMPLATES_DIR), key=lambda p: p.name.lower())


def genre_template_chain(genre: str) -> dict | None:
    """The template's chain as written in the file (only the effects it sets):
    compact context for the LLM."""
    p = GENRE_TEMPLATES_DIR / f"{_slug(genre.lower())}.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))["params"]["global_chain"]
    except (KeyError, ValueError):
        return None
