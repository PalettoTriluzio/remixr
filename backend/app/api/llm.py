from fastapi import APIRouter, HTTPException

from app.models import LLMInterpretRequest, LLMInterpretResponse

router = APIRouter()


@router.post("/llm/interpret", response_model=LLMInterpretResponse)
def interpret(req: LLMInterpretRequest):
    raise HTTPException(status_code=501, detail="Not implemented (F4)")
