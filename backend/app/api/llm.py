from fastapi import APIRouter, HTTPException

from app.llm import engine
from app.llm.interpret import LLMOutputError, interpret
from app.models import LLMInterpretRequest, LLMInterpretResponse, LLMStatus

router = APIRouter()


@router.get("/llm/status", response_model=LLMStatus)
def status():
    return engine.status()


@router.post("/llm/interpret", response_model=LLMInterpretResponse)
def interpret_prompt(req: LLMInterpretRequest):
    try:
        return interpret(req)
    except engine.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except LLMOutputError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
