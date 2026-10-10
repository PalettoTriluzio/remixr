import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import upload, analyze, stems, llm, render, presets
from app.llm import engine


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load the LLM in the background: the server answers immediately and
    # /api/llm/status reports "loading" until the model is on the GPU.
    if engine.PRELOAD:
        threading.Thread(target=engine.warmup, name="llm-warmup", daemon=True).start()
    yield


app = FastAPI(title="Remixr", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "remixr", "version": "0.1.0"}


app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(analyze.router, prefix="/api", tags=["analyze"])
app.include_router(stems.router, prefix="/api", tags=["stems"])
app.include_router(llm.router, prefix="/api", tags=["llm"])
app.include_router(render.router, prefix="/api", tags=["render"])
app.include_router(presets.router, prefix="/api", tags=["presets"])
