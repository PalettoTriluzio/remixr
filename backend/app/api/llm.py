from fastapi import APIRouter, HTTPException

from app.llm import engine, styles
from app.llm.interpret import LLMOutputError, interpret
from app.models import LLMInterpretRequest, LLMInterpretResponse, LLMSelectModel, LLMStatus

router = APIRouter()


@router.get("/llm/status", response_model=LLMStatus)
def status():
    return engine.status()


@router.post("/llm/model", response_model=LLMStatus)
def select_model(req: LLMSelectModel):
    """Switch GGUF model at runtime (loads in background, poll /llm/status)."""
    try:
        engine.select_model(req.model)
    except engine.LLMUnavailable as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return engine.status()


@router.get("/llm/styles", response_model=list[str])
def known_styles():
    """Artists with curated production traits (suggestions for the UI)."""
    return styles.names()


@router.post("/llm/interpret", response_model=LLMInterpretResponse)
def interpret_prompt(req: LLMInterpretRequest):
    try:
        return interpret(req)
    except engine.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except LLMOutputError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
