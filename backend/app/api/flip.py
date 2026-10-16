from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.analysis.mood import mood_for
from app.flip import render as flip
from app.flip.generate import generate as generate_parts
from app.flip.recipe import build as build_recipe
from app.llm import engine
from app.llm.interpret import LLMOutputError
from app.llm.recipe import make_recipe
from app.models import (
    FlipRenderRequest, GenerateRequest, GenerateResponse, MoodProfile, OnsetsResponse, RecipeBuildRequest,
    RecipeRequest, RecipeResponse, RenderResponse,
)

router = APIRouter()


def _errors(e: Exception, what: str) -> HTTPException:
    if isinstance(e, flip.MissingSource):
        return HTTPException(status_code=409, detail=str(e))
    if isinstance(e, FileNotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    if isinstance(e, ValueError):
        return HTTPException(status_code=400, detail=str(e))
    return HTTPException(status_code=500, detail=f"{what} failed: {e}")


@router.post("/flip/preview")
def preview(req: FlipRenderRequest):
    """WAV 16-bit of the project (or the [start_beat, end_beat) window), max 120 s."""
    try:
        wav = flip.preview_wav(req.track_id, req.project, req.master, req.start_beat, req.end_beat)
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Flip preview") from e
    return Response(content=wav, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@router.post("/flip/export", response_model=RenderResponse)
def export(req: FlipRenderRequest):
    try:
        render_id, out, duration = flip.export(req.track_id, req.project, req.master, req.format)
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Flip export") from e
    return RenderResponse(render_id=render_id, path=str(out), duration_sec=duration)


@router.get("/flip/onsets/{track_id}", response_model=OnsetsResponse)
def onsets(
    track_id: str,
    source: str = Query("vocals", pattern="^(vocals|drums|bass|other|mix)$"),
    start: float = Query(..., ge=0.0),
    end: float = Query(..., gt=0.0),
):
    """Transients inside a slice: where to chop."""
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be greater than start")
    try:
        return OnsetsResponse(times=flip.onsets(track_id, source, start, end))
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Onset detection") from e


@router.post("/flip/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    """New drums / bass / chords / arpeggio tracks for the project (patterns,
    editable). Nothing is rendered here: the tracks are returned to the UI."""
    try:
        return generate_parts(req)
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Generation") from e


@router.get("/flip/mood/{track_id}", response_model=MoodProfile)
def mood(track_id: str):
    """How the song feels (mood, energy, brightness) + a style that fits."""
    try:
        result = mood_for(track_id)
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Mood analysis") from e
    if result is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return result


@router.post("/flip/recipe", response_model=RecipeResponse)
def recipe(req: RecipeRequest):
    """Prompt → AI recipe → whole flip project (replaces the current one in the UI)."""
    try:
        return make_recipe(req)
    except engine.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except LLMOutputError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Recipe") from e


@router.post("/flip/recipe/build", response_model=RecipeResponse)
def recipe_build(req: RecipeBuildRequest):
    """Same recipe, no LLM: another seed = another instrumental."""
    try:
        project, notes = build_recipe(req.track_id, req.recipe, req.seed)
    except Exception as e:  # noqa: BLE001
        raise _errors(e, "Recipe build") from e
    return RecipeResponse(recipe=req.recipe, project=project, explanation=req.explanation, notes=notes)
