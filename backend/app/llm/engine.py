"""llama.cpp wrapper: one model, loaded once, shared by every request.

`llama_cpp` is imported lazily so the rest of the app runs without it (it is
built by hand with CUDA, see README §8). The model is loaded by a warm-up
thread at startup (REMIXR_LLM_PRELOAD=0 to disable) or by the first request.

Env:
    REMIXR_LLM_MODEL    GGUF file (absolute, or relative to backend/models/).
                        Default: the biggest *.gguf in backend/models/ that fits
                        fully in VRAM (<= REMIXR_LLM_MAX_GB). Switchable at
                        runtime from the UI (select_model).
    REMIXR_LLM_MAX_GB   size budget for the automatic pick (default 12: a 14B
                        Q4_K_M/Q5_K_M/Q6_K + 8k context on a 16 GB GPU)
    REMIXR_LLM_CTX      context size (default 8192)
    REMIXR_LLM_GPU_LAYERS  default -1 = full offload
    REMIXR_LLM_VERBOSE  1 (default) = llama.cpp log on the console
"""
from __future__ import annotations

import gc
import glob
import json
import os
import re
import threading
from functools import lru_cache
from pathlib import Path

from app.models import LLMStatus
from app.storage import MODELS_DIR

N_CTX = int(os.environ.get("REMIXR_LLM_CTX", "8192"))
N_GPU_LAYERS = int(os.environ.get("REMIXR_LLM_GPU_LAYERS", "-1"))
VERBOSE = os.environ.get("REMIXR_LLM_VERBOSE", "1") != "0"
PRELOAD = os.environ.get("REMIXR_LLM_PRELOAD", "1") != "0"
MAX_GB = float(os.environ.get("REMIXR_LLM_MAX_GB", "12"))

_SPLIT_RE = re.compile(r"-(\d{5})-of-\d{5}\.gguf$", re.IGNORECASE)


class LLMUnavailable(RuntimeError):
    """llama-cpp-python missing, no model on disk, or the load failed."""


# Llama objects are not thread-safe and FastAPI runs sync endpoints in a
# thread pool: one lock guards both loading and inference.
_lock = threading.Lock()
_llm = None
_state: str = "idle"
_model_path: Path | None = None
_gpu_offload: bool | None = None
_error: str | None = None
_selected: Path | None = None  # chosen from the UI; wins over env/default


def _parts(p: Path) -> list[Path]:
    m = _SPLIT_RE.search(p.name)
    if not m:
        return [p]
    stem = p.name[: m.start()]
    return sorted(p.parent.glob(f"{glob.escape(stem)}-*-of-*.gguf"))


def _size_gb(p: Path) -> float:
    return sum(x.stat().st_size for x in _parts(p)) / 1e9


def available_models() -> list[Path]:
    """GGUF files in backend/models/ (split files listed once, by part 1)."""
    out = []
    for p in MODELS_DIR.glob("*.gguf"):
        m = _SPLIT_RE.search(p.name)
        # Split GGUF: llama.cpp is pointed at part 1 and finds the rest.
        if m and m.group(1) != "00001":
            continue
        out.append(p)
    return sorted(out, key=lambda p: p.name.lower())


def find_model() -> Path | None:
    if _selected is not None and _selected.is_file():
        return _selected

    env = os.environ.get("REMIXR_LLM_MODEL")
    if env:
        p = Path(env)
        if not p.is_absolute():
            p = MODELS_DIR / p
        return p if p.is_file() else None

    candidates = [(p, _size_gb(p)) for p in available_models()]
    if not candidates:
        return None
    # Bigger = more knowledge (artist styles) and steadier JSON, as long as it
    # stays fully on the GPU; partial offload is several times slower.
    fitting = [c for c in candidates if c[1] <= MAX_GB]
    if fitting:
        return max(fitting, key=lambda c: c[1])[0]
    return min(candidates, key=lambda c: c[1])[0]


def status() -> LLMStatus:
    # Lock-free on purpose: polled while the warm-up thread holds the lock.
    path = _model_path or find_model()
    return LLMStatus(
        state=_state,  # type: ignore[arg-type]
        model=path.name if path else None,
        gpu_offload=_gpu_offload,
        error=_error,
        available=[p.name for p in available_models()],
    )


def _ensure_loaded_locked():
    global _llm, _state, _model_path, _gpu_offload, _error
    if _llm is not None:
        return _llm

    _state, _error = "loading", None
    try:
        try:
            import llama_cpp
        except ImportError as e:
            raise LLMUnavailable(
                "llama-cpp-python non installato: compilalo con CUDA (README §8)"
            ) from e

        path = find_model()
        if path is None:
            raise LLMUnavailable(
                f"Nessun modello .gguf in {MODELS_DIR} (README §9) "
                "o REMIXR_LLM_MODEL punta a un file inesistente"
            )

        _model_path = path
        _gpu_offload = bool(llama_cpp.llama_supports_gpu_offload())
        try:
            _llm = llama_cpp.Llama(
                model_path=str(path),
                n_gpu_layers=N_GPU_LAYERS,
                n_ctx=N_CTX,
                verbose=VERBOSE,
            )
        except Exception as e:  # noqa: BLE001
            raise LLMUnavailable(f"Caricamento di {path.name} fallito: {e}") from e
    except LLMUnavailable as e:
        # Not sticky: the next request retries (e.g. after dropping a model in).
        _state, _error = "error", str(e)
        raise

    _state = "ready"
    return _llm


def warmup() -> None:
    """Load the model in the background. Failures only show up in status()."""
    try:
        with _lock:
            _ensure_loaded_locked()
    except LLMUnavailable:
        pass


def select_model(name: str) -> None:
    """Switch model: free the current one, load the new one in background."""
    global _llm, _state, _model_path, _gpu_offload, _error, _selected
    path = MODELS_DIR / Path(name).name  # file name only, no path tricks
    if not path.is_file() or path.suffix.lower() != ".gguf":
        raise LLMUnavailable(f"Modello non trovato in {MODELS_DIR}: {name}")
    with _lock:
        if _llm is not None:
            close = getattr(_llm, "close", None)
            if close:
                close()
            _llm = None
            gc.collect()  # release VRAM before loading the next one
        _selected, _model_path = path, None
        _state, _gpu_offload, _error = "idle", None, None
    threading.Thread(target=warmup, name="llm-switch", daemon=True).start()


@lru_cache(maxsize=4)
def _grammar(schema_json: str):
    """GBNF grammar from a JSON schema; generic JSON if the conversion fails
    (llama-cpp-python 0.3.2 has no fallback of its own). Cached: the schema
    never changes and compiling it costs on every request."""
    from llama_cpp.llama_grammar import JSON_GBNF, LlamaGrammar

    try:
        return LlamaGrammar.from_json_schema(schema_json, verbose=False)
    except Exception:  # noqa: BLE001
        return LlamaGrammar.from_string(JSON_GBNF, verbose=False)


def chat_json(
    messages: list[dict],
    schema: dict,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> str:
    """Chat completion constrained to `schema` by a grammar. Returns the raw
    content string; the caller validates it."""
    with _lock:
        llm = _ensure_loaded_locked()
        out = llm.create_chat_completion(
            messages=messages,
            grammar=_grammar(json.dumps(schema)),
            temperature=temperature,
            max_tokens=max_tokens,
        )
    return out["choices"][0]["message"]["content"] or ""
