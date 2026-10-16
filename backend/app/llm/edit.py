"""Prompt → edits of the current flip (F11b).

The model sees a summary of the project (sections, what each track holds
where, tempo/key/style) and answers with a few operations (EditOp), which
app/flip/edit.py applies in order. Unknown values are dropped, numbers clamped:
a sloppy answer can only produce fewer edits, never an invalid project.
"""
from __future__ import annotations

import random
import typing

from app.flip.edit import GEN, LABEL, apply
from app.llm import engine
from app.llm.interpret import LLMOutputError, _parse
from app.llm.recipe import BARS, ENERGY, FX, MOODS, PARTS, SAMPLE_BARS, SAMPLES, SOURCES, STYLE_NAMES, _list, _nearest, _pick
from app.models import EditOp, EditOpName, EditRequest, EditResponse, EditTarget, FlipProject

OPS = list(typing.get_args(EditOpName))
TARGETS = list(typing.get_args(EditTarget))
SHAPES = ["none", "fade_in", "fade_out", "filter_open", "filter_close", "rise"]

OP_SCHEMA = {
    "type": "object",
    "properties": {
        "op": {"enum": OPS},
        "section": {"type": "string"},
        "after": {"type": "string"},
        "name": {"type": "string"},
        "bars": {"enum": BARS},
        "sample": {"enum": SAMPLES},
        "sample_bars": {"enum": SAMPLE_BARS},
        "keep": {"type": "array", "items": {"enum": SOURCES}},
        "fx": {"type": "array", "items": {"enum": FX}},
        "parts": {"type": "array", "items": {"enum": PARTS}},
        "targets": {"type": "array", "items": {"enum": TARGETS}},
        "energy": {"enum": ENERGY},
        "value": {"type": "number"},
        "style": {"enum": STYLE_NAMES},
        "mood": {"enum": MOODS},
        "shape": {"enum": SHAPES},
    },
    "required": ["op"],
    "additionalProperties": False,
}

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "explanation": {"type": "string"},
        "ops": {"type": "array", "items": OP_SCHEMA, "minItems": 1, "maxItems": 8},
    },
    "required": ["explanation", "ops"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are the producer inside Remixr. The user already has a FLIP (a new song built
from pieces of an original song plus generated drums/bass/chords/arpeggio) and asks
for a change. Answer with a short list of OPERATIONS (JSON), applied in order.
Change ONLY what is asked; everything else stays as it is.

Addressing:
- "section": a section name from the project (every section with that name), "all"
  for the whole song, or "bars A-B" (1-based, inclusive).
- "targets": what to act on: drums, bass, chords, arp (generated parts), vocals,
  other, mix (pieces of the original), orig_drums, orig_bass (the original's drum/bass
  stems), harmony (the backing vocal).

Operations (only the listed fields matter for each):
- add_section {{name, bars, after, sample, sample_bars, keep, fx, parts, energy}}: insert a
  new section of `bars` bars after the section named in "after" ("start"/"end" also ok).
  sample/sample_bars/keep/fx = loop from the original, like a recipe; parts = generated
  parts; energy low|mid|high.
- remove_section {{section}}: cut it out, the rest moves up.
- duplicate_section {{section}}: repeat it right after itself.
- remove {{targets, section}}: take those parts away there (section "all" = everywhere).
- add_parts {{parts, section, energy}}: generate new parts there (replacing the same parts).
- regenerate {{targets, section, energy?, style?, mood?}}: a new take of generated parts.
- set_fx {{targets, section, fx}}: effects on the original's pieces there. fx REPLACES
  their current effects (include the ones to keep; [] removes all). fx: filtered,
  telephone, reversed, stutter, octave_up, octave_down, harmony, tuned.
- volume {{targets, value}}: value = dB to add (e.g. -4 quieter, 3 louder).
- tempo {{value}}: BPM. transpose {{value}}: semitones (-12..12) for the whole flip.
- style {{style, mood?}}: redo the whole instrumental in another style ({style_names}).
- automate {{targets, section, shape}}: shape fade_in, fade_out, filter_open (low-pass
  opening), filter_close, rise (high-pass sweeping down). targets [] = every track.
- sidechain {{targets, value}}: those tracks duck on the kick (pumping), value = dB (default 8, 0 = off).

Rules:
- Use the section names exactly as listed. If the project has no sections, use "all"
  or "bars A-B".
- "explanation": 1-3 short sentences in the SAME LANGUAGE as the request.
- Answer with JSON only.

Examples:
"aggiungi un break di 4 battute dopo il ritornello" ->
{{"explanation": "Break di 4 battute dopo il ritornello: voce filtrata in loop e solo accordi.", "ops": [{{"op": "add_section", "name": "break", "bars": 4, "after": "ritornello", "sample": "auto", "sample_bars": 2, "keep": ["vocals"], "fx": ["filtered"], "parts": ["chords"], "energy": "low"}}]}}
"togli l'arpeggio e fai pompare gli accordi" ->
{{"explanation": "Via l'arpeggio, accordi in sidechain sulla cassa.", "ops": [{{"op": "remove", "targets": ["arp"], "section": "all"}}, {{"op": "sidechain", "targets": ["chords"], "value": 8}}]}}
"voce un'ottava sopra nell'outro, e un filtro che si apre nell'intro" ->
{{"explanation": "Outro con la voce un'ottava sopra; nell'intro il filtro si apre piano.", "ops": [{{"op": "set_fx", "targets": ["vocals"], "section": "outro", "fx": ["octave_up"]}}, {{"op": "automate", "targets": [], "section": "intro", "shape": "filter_open"}}]}}
"""

FX_IT = {"filtered": "filtrata", "telephone": "telefono", "reversed": "al contrario", "stutter": "stutter",
         "octave_up": "+8va", "octave_down": "-8va", "harmony": "armonia", "tuned": "intonata"}


def summarize(p: FlipProject, style: str, mood: str, harmony: str) -> str:
    bpb = p.beats_per_bar
    bar = lambda b: int(b // bpb) + 1  # noqa: E731
    lines = [
        f"Project: {p.bpm:g} BPM, {p.bars} bars, key {p.source_key} transposed {p.transpose:+g}, "
        f"style {style}, mood {mood}, harmony {harmony}.",
    ]
    secs = sorted(p.markers, key=lambda m: m.start)
    if secs:
        lines.append("Sections:")
        for m in secs:
            lines.append(f"- {m.name}: bars {bar(m.start)}-{bar(m.end - 0.01)} (energy {m.energy:.2f})")
    else:
        lines.append("Sections: none (address with \"all\" or \"bars A-B\").")

    def where(a: float, b: float) -> str:
        names = [m.name for m in secs if m.start < b and m.end > a]
        return ", ".join(dict.fromkeys(names)) if names else f"bars {bar(a)}-{bar(b - 0.01)}"

    lines.append("Tracks:")
    for t in p.tracks:
        flags = []
        if t.mute:
            flags.append("muted")
        if abs(t.gain_db) > 0.05:
            flags.append(f"{t.gain_db:+.1f} dB")
        if t.sidechain.enabled:
            flags.append("sidechain")
        if any(t.automation.values()):
            flags.append("automated " + "/".join(k for k, v in t.automation.items() if v))
        f = f" [{', '.join(flags)}]" if flags else ""
        if t.kind == "audio":
            parts = []
            for c in sorted(t.clips, key=lambda c: c.at_beat):
                fx = [FX_IT[k] for k, on in (
                    ("filtered", c.lp_freq < 2000 and c.hp_freq <= 20.5), ("telephone", c.hp_freq > 300),
                    ("reversed", c.reverse), ("stutter", c.gate != "off"), ("octave_up", c.semitones >= 12),
                    ("octave_down", c.semitones <= -12), ("tuned", c.tune > 0), ("harmony", c.harmony != 0)) if on]
                parts.append(f"{c.source} in {where(c.at_beat, c.at_beat + c.length_beats)}" + (f" ({', '.join(fx)})" if fx else ""))
            lines.append(f"- {t.name} (original pieces){f}: " + ("; ".join(dict.fromkeys(parts)) or "empty"))
        else:
            role = next((k for k, (kind, name) in GEN.items() if t.kind == kind and (name is None or t.name == name)), t.kind)
            spans = "; ".join(dict.fromkeys(where(c.at_beat, c.at_beat + c.length_beats) for c in sorted(t.patterns, key=lambda c: c.at_beat)))
            lines.append(f"- {t.name} (generated {LABEL.get(role, role)} = target {role}){f}: {spans or 'empty'}")
    return "\n".join(lines)


def build_messages(req: EditRequest) -> list[dict]:
    system = SYSTEM_PROMPT.format(style_names=", ".join(STYLE_NAMES))
    user = [summarize(req.project, req.style, req.mood, req.harmony)]
    if req.variation:
        user.append(f"This is alternative #{req.variation}: interpret the request in a distinct, creative way, still doing what is asked.")
    user.append(f"Request: {req.prompt.strip()}")
    return [{"role": "system", "content": system}, {"role": "user", "content": "\n".join(user)}]


def sanitize_ops(data: dict) -> list[EditOp]:
    ops: list[EditOp] = []
    for raw in data.get("ops") or []:
        if not isinstance(raw, dict) or raw.get("op") not in OPS:
            continue
        clean: dict = {"op": raw["op"]}
        for k in ("section", "after", "name"):
            if isinstance(raw.get(k), str):
                clean[k] = raw[k][:40] if k != "name" else raw[k][:30]
        if "bars" in raw:
            clean["bars"] = max(1, min(32, int(_nearest(raw["bars"], list(range(1, 33))))))
        if "sample" in raw:
            clean["sample"] = _pick(raw["sample"], SAMPLES, "auto")
        if "sample_bars" in raw:
            clean["sample_bars"] = _nearest(raw["sample_bars"], SAMPLE_BARS)
        for k, opts in (("keep", SOURCES), ("fx", FX), ("parts", PARTS), ("targets", TARGETS)):
            if k in raw:
                clean[k] = _list(raw[k], opts)
        if raw.get("energy") in ENERGY:
            clean["energy"] = raw["energy"]
        if raw.get("style") in STYLE_NAMES:
            clean["style"] = raw["style"]
        if raw.get("mood") in MOODS:
            clean["mood"] = raw["mood"]
        if raw.get("shape") in SHAPES:
            clean["shape"] = raw["shape"]
        try:
            clean["value"] = float(raw.get("value") or 0.0)
        except (TypeError, ValueError):
            pass
        ops.append(EditOp(**clean))
    if not ops:
        raise LLMOutputError("Il modello non ha proposto modifiche valide")
    return ops[:8]


def edit_flip(req: EditRequest) -> EditResponse:
    messages = build_messages(req)
    if req.variation:
        raw = engine.chat_json(messages, RESPONSE_SCHEMA, max_tokens=1200, temperature=0.8, seed=random.randrange(2**31))
    else:
        raw = engine.chat_json(messages, RESPONSE_SCHEMA, max_tokens=1200, temperature=0.2)
    data = _parse(raw)
    ops = sanitize_ops(data)
    res = apply(req, ops)
    res.explanation = str(data.get("explanation") or "").strip() or "Fatto."
    if not res.applied:
        res.explanation += " (nessuna modifica applicata: vedi le note)"
    return res

