"""Prompt → flip recipe (F11).

The model writes a FlipRecipe (sections of the new song: what to sample from
the original, what to keep, effects, which parts to generate); the recipe is
sanitised (enums filtered, numbers clamped) and built into a FlipProject by
app/flip/recipe.py, deterministically. The model never touches audio or
individual notes.
"""
from __future__ import annotations

import json
import random
import typing

from app.analysis.mood import MOOD_LABEL, mood_for
from app.analysis.structure import structure_for
from app.flip.generate import STYLES
from app.flip.recipe import build
from app.llm import engine
from app.llm.interpret import LLMOutputError, _parse
from app.models import (
    FlipRecipe, FlipSource, GenPart, GenStyle, Mood, RecipeFx, RecipeRequest, RecipeResponse, RecipeSection, SampleFrom,
)
from app.storage import find_stems


def _enum(lit) -> list:
    return list(typing.get_args(lit))


SOURCES = _enum(FlipSource)
PARTS = _enum(GenPart)
STYLE_NAMES = _enum(GenStyle)
MOODS = _enum(Mood)
FX = _enum(RecipeFx)
SAMPLES = _enum(SampleFrom)
BARS = [1, 2, 4, 8, 12, 16]
SAMPLE_BARS = [1, 2, 4, 8]
ENERGY = ["low", "mid", "high"]

SECTION_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "bars": {"enum": BARS},
        "sample": {"enum": SAMPLES},
        "sample_bars": {"enum": SAMPLE_BARS},
        "keep": {"type": "array", "items": {"enum": SOURCES}},
        "fx": {"type": "array", "items": {"enum": FX}},
        "parts": {"type": "array", "items": {"enum": PARTS}},
        "energy": {"enum": ENERGY},
    },
    "required": ["name", "bars", "sample", "sample_bars", "keep", "fx", "parts", "energy"],
    "additionalProperties": False,
}

RESPONSE_SCHEMA = {
    "type": "object",
    # explanation first: the model states its plan, then writes it down.
    "properties": {
        "explanation": {"type": "string"},
        "bpm": {"type": "integer"},
        "transpose": {"type": "integer"},
        "style": {"enum": STYLE_NAMES},
        "mood": {"enum": MOODS},
        "harmony": {"enum": ["song", "new"]},
        "sections": {"type": "array", "items": SECTION_SCHEMA, "minItems": 1, "maxItems": 8},
    },
    "required": ["explanation", "bpm", "transpose", "style", "mood", "harmony", "sections"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are the producer inside Remixr, an offline tool that FLIPS songs: like thasup
rebuilding Neffa's "Una direzione giusta", you keep a recognisable piece of the
original (usually the vocal hook), throw the rest away and build a new song
around it: new tempo, new groove, sometimes new harmony.

You answer with a RECIPE (JSON). A program turns it into an arrangement the user
can edit; you never write audio or notes yourself.

Recipe fields:
- bpm: tempo of the new song. If the user gives one, use it. Otherwise the style's
  typical tempo: {styles}.
  Trap/drill at 70 feel like 140 (half-time).
- transpose: semitones for the whole flip (vocals included). 0 unless asked.
- style: {style_names}.
- mood: {moods}. Shapes density, brightness and space of the new parts.
  Default: the song's own mood (given below) unless the request suggests another.
- harmony: "song" = the new chords follow the original chords under the kept
  vocal (always fits); "new" = a fresh progression in the song's key (only if the
  user asks for new chords, or no vocal/other is kept).
- sections: the new song, in order (1 to 8). Each section:
  - name: short label in the user's language (intro, strofa, ritornello, drop, outro…)
  - bars: {bars}. Total usually 16-48 bars unless the user asks otherwise.
  - sample: which section of the ORIGINAL to take the loop from: {samples}
    ("auto" = its chorus/hook, "none" = nothing from the original).
  - sample_bars: how many bars of it to loop ({sample_bars}). Short loops (1-2)
    sound chopped and hypnotic; 4-8 keep whole phrases of the vocal.
  - keep: stems of the original to use: vocals, drums, bass, other (pads, guitars,
    keys), mix (everything). Usually ["vocals"]. Keeping the original drums/bass
    keeps the old groove: avoid it when the style changes.
  - fx on the kept vocals/other/mix: none, filtered (muffled, low-pass), telephone
    (thin, band-pass), reversed, stutter (gated 1/16), octave_up, octave_down,
    harmony (a third above, as a second voice), tuned (pitch correction).
  - parts: generated parts: drums, bass, chords, arp. Empty = only samples.
  - energy: low (intro/break: sparse), mid (verse), high (chorus/drop: busy, loud).

Rules:
- Follow the request literally (tempo, sections, what to keep). Fill the gaps
  with good producer choices: an intro with fewer parts, the full beat on the
  hook, an outro that thins out.
- If stems are not available, "keep" can only be ["mix"] or [].
- "explanation": 2-4 short sentences in the SAME LANGUAGE as the request, saying
  the idea of the flip and the structure.
- Answer with JSON only.

Example. Request: "rifalla drill a 142, tieni solo il ritornello, intro con voce filtrata"
{{"explanation": "Drill a 142 costruita solo sul ritornello: intro di 4 battute con la voce filtrata e solo gli accordi, poi il ritornello con beat e 808 pieni, chiusura che si svuota.", "bpm": 142, "transpose": 0, "style": "drill", "mood": "dark", "harmony": "song", "sections": [{{"name": "intro", "bars": 4, "sample": "ritornello", "sample_bars": 4, "keep": ["vocals"], "fx": ["filtered"], "parts": ["chords"], "energy": "low"}}, {{"name": "ritornello", "bars": 16, "sample": "ritornello", "sample_bars": 8, "keep": ["vocals"], "fx": [], "parts": ["drums", "bass", "chords"], "energy": "high"}}, {{"name": "outro", "bars": 4, "sample": "ritornello", "sample_bars": 2, "keep": ["vocals"], "fx": ["reversed"], "parts": ["chords"], "energy": "low"}}]}}
"""


def build_messages(req: RecipeRequest) -> list[dict]:
    styles = ", ".join(f"{k} {v[7]}" for k, v in STYLES.items())
    system = SYSTEM_PROMPT.format(
        styles=styles, style_names=", ".join(STYLE_NAMES), moods=", ".join(MOODS),
        bars=", ".join(map(str, BARS)), samples=", ".join(SAMPLES), sample_bars=", ".join(map(str, SAMPLE_BARS)),
    )
    structure = structure_for(req.track_id)
    if structure is None:
        raise FileNotFoundError("Track not found")
    lines = [
        f"Original song: BPM {structure.bpm:g}, key {structure.key}, "
        f"stems available: {'yes' if find_stems(req.track_id) else 'no'}.",
    ]
    try:
        m = mood_for(req.track_id)
    except Exception:  # noqa: BLE001
        m = None
    if m is not None:
        lines.append(
            f"Mood of the song: {m.mood} ({MOOD_LABEL[m.mood]}), energy {m.energy:.2f}, "
            f"valence {m.valence:.2f}, brightness {m.brightness:.2f}; style that fits: {m.suggested_style}."
        )
    if structure.sections:
        lines.append("Sections of the original:")
        for s in structure.sections:
            lines.append(f"- bars {s.bar_start}-{s.bar_end - 1}: {s.name} (material {s.label}), energy {s.energy:.2f}")
    if req.variation:
        lines.append(
            f"This is alternative #{req.variation}: a distinct, creative take (different style, structure "
            "or treatment of the vocal than the most obvious answer), still respecting the request."
        )
    lines.append(f"Request: {req.prompt.strip()}")
    return [{"role": "system", "content": system}, {"role": "user", "content": "\n".join(lines)}]


def _nearest(x, options: list[int]) -> int:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return options[len(options) // 2]
    return min(options, key=lambda o: abs(o - v))


def _pick(x, options: list, default):
    return x if x in options else default


def _list(x, options: list) -> list:
    return list(dict.fromkeys(v for v in x if v in options)) if isinstance(x, list) else []


def sanitize(data: dict) -> FlipRecipe:
    """Model output → valid FlipRecipe (unknown values dropped, numbers clamped)."""
    sections = []
    for raw in data.get("sections") or []:
        if not isinstance(raw, dict):
            continue
        sections.append(RecipeSection(
            name=str(raw.get("name") or "parte")[:30],
            bars=max(1, min(32, int(_nearest(raw.get("bars"), list(range(1, 33)))))),
            sample=_pick(raw.get("sample"), SAMPLES, "auto"),
            sample_bars=_nearest(raw.get("sample_bars"), SAMPLE_BARS),
            keep=_list(raw.get("keep"), SOURCES),
            fx=[f for f in _list(raw.get("fx"), FX) if f != "none"],
            parts=_list(raw.get("parts"), PARTS),
            energy=_pick(raw.get("energy"), ENERGY, "mid"),
        ))
    if not sections:
        raise LLMOutputError("La ricetta non ha sezioni")
    try:
        bpm = float(data.get("bpm"))
    except (TypeError, ValueError):
        bpm = 120.0
    try:
        transpose = int(round(float(data.get("transpose") or 0)))
    except (TypeError, ValueError):
        transpose = 0
    return FlipRecipe(
        bpm=min(240.0, max(40.0, bpm)),
        transpose=max(-12, min(12, transpose)),
        style=_pick(data.get("style"), STYLE_NAMES, "trap"),
        mood=_pick(data.get("mood"), MOODS, "dark"),
        harmony=_pick(data.get("harmony"), ["song", "new"], "song"),
        sections=sections[:12],
    )


def make_recipe(req: RecipeRequest) -> RecipeResponse:
    messages = build_messages(req)
    if req.variation:
        raw = engine.chat_json(messages, RESPONSE_SCHEMA, max_tokens=1800, temperature=0.8, seed=random.randrange(2**31))
    else:
        raw = engine.chat_json(messages, RESPONSE_SCHEMA, max_tokens=1800, temperature=0.3)
    data = _parse(raw)
    recipe = sanitize(data)
    project, notes = build(req.track_id, recipe, req.seed)
    explanation = str(data.get("explanation") or "").strip() or "Ricetta pronta."
    return RecipeResponse(recipe=recipe, project=project, explanation=explanation, notes=notes)
