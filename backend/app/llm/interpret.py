"""Prompt -> param delta -> validated Params.

The model never returns a full Params object: it returns only the fields it
wants to change ("changes", a partial EffectChain) plus a short explanation.
The delta is merged onto the current chain, unknown keys are dropped and every
number is clamped to the Pydantic bounds, so a sloppy answer can never produce
an invalid chain. Grammar schema and parameter reference are both derived from
`app.models`, which stays the single source of truth.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any

from pydantic import BaseModel

from app.llm import engine
from app.models import EffectChain, LLMInterpretRequest, LLMInterpretResponse


class LLMOutputError(RuntimeError):
    """The model answered, but not with usable JSON."""


# ------------------------------------------------------------ schema helpers

def _is_model(ann: Any) -> bool:
    return isinstance(ann, type) and issubclass(ann, BaseModel)


def _bounds(field) -> tuple[float | None, float | None]:
    lo = hi = None
    for m in field.metadata:
        lo = getattr(m, "ge", lo)
        hi = getattr(m, "le", hi)
    return lo, hi


def _partial_schema(model: type[BaseModel]) -> dict:
    """JSON schema where every property is optional (a delta)."""
    props: dict[str, dict] = {}
    for name, f in model.model_fields.items():
        if _is_model(f.annotation):
            props[name] = _partial_schema(f.annotation)
        elif f.annotation is bool:
            props[name] = {"type": "boolean"}
        elif f.annotation is float:
            props[name] = {"type": "number"}
    return {"type": "object", "properties": props, "additionalProperties": False}


RESPONSE_SCHEMA = {
    "type": "object",
    # explanation first: the model states its plan, then emits the numbers.
    "properties": {
        "explanation": {"type": "string"},
        "changes": _partial_schema(EffectChain),
    },
    "required": ["explanation", "changes"],
    "additionalProperties": False,
}


def _param_reference(model: type[BaseModel], prefix: str = "") -> list[str]:
    lines: list[str] = []
    for name, f in model.model_fields.items():
        path = f"{prefix}{name}"
        if _is_model(f.annotation):
            lines += _param_reference(f.annotation, f"{path}.")
        elif f.annotation is float:
            lo, hi = _bounds(f)
            lines.append(f"- {path}: number [{lo:g} .. {hi:g}]")
    return lines


# ------------------------------------------------------------------- prompt

SYSTEM_PROMPT = """You are the mix engineer inside Remixr, an offline audio remixer.
You turn the user's request into changes to a fixed effect chain.

Signal flow (fixed order):
tempo/pitch -> input_gain_db -> hp -> eq -> comp -> distortion -> lp -> delay -> reverb -> stereo -> limiter

Effects (each has "enabled"; a disabled effect does nothing):
- tempo.ratio: playback SPEED multiplier, pitch preserved. 0.8 = 20% slower, 1.25 = 25% faster.
  From BPM A to BPM B: ratio = B / A.
- pitch.semitones: transpose, independent of tempo. "Slowed" style = tempo below 1 AND pitch down.
- input_gain_db: gain before the chain (always active, no "enabled").
- hp.freq / lp.freq: high-pass / low-pass cutoff in Hz. Low-pass ~3000-6000 Hz = muffled, lo-fi, "underwater".
- eq: three peaking bands (low, mid, high), each with freq (Hz), gain_db and q.
- comp: compressor (threshold_db, ratio, attack_ms, release_ms, makeup_db). Punch, glue, density.
- distortion.drive_db: saturation/grit. 3-10 dB = warm, 15+ dB = aggressive.
- delay: time_ms, feedback (0..0.95), mix. Tempo-synced quarter note = 60000 / BPM ms
  (use the BPM AFTER the tempo change; eighth = half of that).
- reverb: room_size, damping, wet, dry, width (all 0..1). Space, ambience.
- stereo.width: 0 = mono, 1 = unchanged, 2 = extra wide.
- limiter: threshold_db, release_ms. Use it when adding gain, drive or makeup to avoid clipping.

Parameter ranges:
{reference}

Rules:
- Put in "changes" ONLY the parameters you change. Omit everything else.
- Keys go in the same order as in the current chain.
- When you use an effect set "enabled": true; set "enabled": false to remove one.
- Build on the current chain: it is the user's current state, keep what they did not ask to change.
- Be musical and moderate: no extreme values unless the user asks for them.
- "explanation": 1-3 short sentences on what you changed and why, in the SAME LANGUAGE as the user's request.
- Answer with JSON only.

Example. Request: "more spacious and warmer"
{{"explanation": "Gentle low boost with softer highs for warmth, plus a medium room reverb for space.", "changes": {{"eq": {{"enabled": true, "low": {{"gain_db": 2.5}}, "high": {{"gain_db": -2}}}}, "reverb": {{"enabled": true, "room_size": 0.6, "wet": 0.3}}}}}}
"""


def build_messages(req: LLMInterpretRequest) -> list[dict]:
    system = SYSTEM_PROMPT.format(reference="\n".join(_param_reference(EffectChain)))

    ctx = []
    if req.bpm:
        ctx.append(f"BPM {req.bpm:.1f}")
    if req.key:
        ctx.append(f"key {req.key}")
    chain = req.current_params.global_chain.model_dump()

    user = [f"Current chain: {json.dumps(chain, separators=(',', ':'))}"]
    if ctx:
        user.append(f"Track: {', '.join(ctx)}")
    if req.genre:
        user.append(f"Target genre: {req.genre}")
    user.append(f"Request: {req.prompt.strip()}")

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n".join(user)},
    ]


# ------------------------------------------------------------- merge + diff

def _merge(model: type[BaseModel], base: dict, patch: Any) -> dict:
    """Apply `patch` to `base` (a model_dump of `model`): known keys only,
    types checked, numbers clamped to the field bounds."""
    if not isinstance(patch, dict):
        return base
    out = dict(base)
    for name, value in patch.items():
        field = model.model_fields.get(name)
        if field is None:
            continue
        ann = field.annotation
        if _is_model(ann):
            merged = _merge(ann, base[name], value)
            # Touching an effect's params but forgetting "enabled" almost always
            # means "use this effect": switch it on.
            if (
                "enabled" in ann.model_fields
                and isinstance(value, dict)
                and "enabled" not in value
                and any(k in ann.model_fields for k in value)
            ):
                merged["enabled"] = True
            out[name] = merged
        elif ann is bool:
            if isinstance(value, bool):
                out[name] = value
        elif ann is float:
            if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                lo, hi = _bounds(field)
                v = float(value)
                if lo is not None:
                    v = max(lo, v)
                if hi is not None:
                    v = min(hi, v)
                out[name] = v
    return out


def _diff(old: dict, new: dict, prefix: str) -> list[str]:
    changed: list[str] = []
    for k, v in new.items():
        path = f"{prefix}.{k}"
        if isinstance(v, dict):
            changed += _diff(old[k], v, path)
        elif isinstance(v, float):
            if abs(v - old[k]) > 1e-9:
                changed.append(path)
        elif v != old[k]:
            changed.append(path)
    return changed


def _parse(raw: str) -> dict:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Without a grammar some models wrap the JSON in prose or a code fence.
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            raise LLMOutputError(f"Risposta del modello non in JSON: {raw[:200]!r}") from None
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError as e:
            raise LLMOutputError(f"JSON del modello non valido: {e}") from e
    if not isinstance(data, dict):
        raise LLMOutputError("Il modello non ha restituito un oggetto JSON")
    return data


# --------------------------------------------------------------------- entry

def interpret(req: LLMInterpretRequest) -> LLMInterpretResponse:
    raw = engine.chat_json(build_messages(req), RESPONSE_SCHEMA)
    data = _parse(raw)

    current = req.current_params.global_chain.model_dump()
    merged = _merge(EffectChain, current, data.get("changes"))
    new_chain = EffectChain.model_validate(merged)
    params = req.current_params.model_copy(update={"global_chain": new_chain})

    explanation = str(data.get("explanation") or "").strip()
    changed = _diff(current, new_chain.model_dump(), "global_chain")
    if not changed and not explanation:
        explanation = "Nessuna modifica."

    return LLMInterpretResponse(params=params, explanation=explanation, changed_fields=changed)
