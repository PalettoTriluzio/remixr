"""Artist / producer references -> production traits the chain can imitate.

The LLM knows many artists, but a 7B/14B model is vague about their *mix*
signature. This table gives it concrete traits expressed in the vocabulary of
our effect chain. Artists not in the table are still accepted: the prompt then
asks the model to use its own knowledge (and to say so if it has none).

Only production/mix traits: the chain cannot change melody, lyrics, voice
timbre or arrangement, and the prompt tells the model to be honest about it.
"""
from __future__ import annotations

import re
import unicodedata

# name -> (aliases, traits)
_STYLES: dict[str, tuple[tuple[str, ...], str]] = {
    # ---- international pop / r&b
    "Billie Eilish": ((), "intimate and close, dark soft top end (high shelf down, lp ~10-14 kHz), deep sub low end, gentle compression, small dark reverb, quiet and dynamic (light limiter)"),
    "The Weeknd": (("weeknd",), "80s synth-pop sheen: bright highs, punchy compression, big lush reverb and tempo-synced delay, wide stereo, polished loud limiter"),
    "Dua Lipa": ((), "disco-pop: tight punchy compression, bright mids/highs, short reverb, wide stereo, loud clean limiter, tempo ~ 120-124 BPM"),
    "Lana Del Rey": (("lana",), "cinematic and hazy: big long reverb, darker highs, slow tempo feel, gentle tape-like saturation, wide stereo"),
    "Frank Ocean": ((), "warm and minimal: soft highs, low-mid warmth, light saturation, medium reverb, relaxed dynamics, sometimes pitched-down textures"),
    "Taylor Swift": (("taylor",), "clean modern pop: clear mids, bright air, controlled compression, medium plate-like reverb, polished limiter"),
    "Drake": ((), "moody hip-hop/R&B: dark muffled highs (lp ~6-9 kHz), heavy sub, laid-back tempo, roomy reverb, soft compression"),
    "Travis Scott": (("travis",), "dark psychedelic trap: heavy reverb and delay throws, saturated/distorted low end, darker top, wide stereo, loud limiter"),
    "Kanye West": (("kanye",), "soul-sample hip-hop: warm saturated mids, punchy compression, vintage band-limited tone (hp ~60 Hz, lp ~10 kHz)"),
    "Post Malone": (("post malone",), "pop-rap: bright vocal-forward mids, lush reverb, moderate delay, smooth compression, wide"),
    # ---- electronic
    "Daft Punk": ((), "French house: filtered sound (lp sweeps 1-4 kHz feel), pumping compression (fast attack, high ratio), warm saturation, tempo ~ 120-124 BPM"),
    "Fred again..": (("fred again",), "emotional UK house: heavy pumping compression, lo-fi filtered textures, roomy reverb, tempo ~ 128-135 BPM"),
    "Burial": ((), "dark UK garage: muffled lo-fi (lp ~4-6 kHz), vinyl-like grit (light distortion), cavernous reverb, pitched-down feel, mono-ish narrow stereo"),
    "Aphex Twin": (("aphex",), "experimental IDM: aggressive distortion, sharp highs, unpredictable delays, wide stereo"),
    "Skrillex": ((), "brostep/EDM: aggressive distortion, very loud limiter, bright highs, hard compression, tempo ~ 140-150 BPM"),
    "Avicii": ((), "progressive house: bright and wide, big reverb, pumping compression, tempo ~ 126-128 BPM, loud limiter"),
    "Calvin Harris": (("calvin",), "polished dance-pop: bright, punchy, wide, clean loud limiter, tempo ~ 120-128 BPM"),
    "Nujabes": ((), "jazzy lo-fi hip-hop: warm and muffled (lp ~6-8 kHz), soft saturation, gentle compression, roomy reverb, tempo ~ 85-95 BPM"),
    "J Dilla": (("dilla",), "dusty boom-bap: band-limited (hp ~50 Hz, lp ~8 kHz), saturated warm mids, punchy compression, tempo ~ 85-95 BPM"),
    "Metro Boomin": ((), "dark cinematic trap: deep sub boost, dark highs, big reverb, saturated low end, loud limiter"),
    # ---- rock / alt
    "Tame Impala": (("kevin parker",), "psychedelic: heavy compression and pumping, phase-y wide stereo, long reverb and delay, warm saturation, darker highs"),
    "Arctic Monkeys": (("arctic",), "garage/indie rock: mid-forward, saturated drive, short room reverb, punchy compression"),
    "Radiohead": ((), "art rock: textured and moody, mid-heavy, tape saturation, spacious reverb and delay, dynamic (soft limiting)"),
    "Pink Floyd": (("floyd",), "70s prog: warm vintage tone (lp ~12 kHz), long lush reverb, tape delay, wide stereo, dynamic"),
    "Nirvana": ((), "grunge: heavy distortion, mid-forward, compressed drums, dry small room, raw"),
    "Bon Iver": ((), "indie folk/experimental: lots of reverb, warm lows, soft highs, gentle saturation, intimate"),
    # ---- Italian
    "Sfera Ebbasta": (("sfera",), "trap italiana: sub boost, crisp highs, heavy reverb and delay, loud limiter, tempo ~ 130-145 BPM (half-time feel)"),
    "Lazza": ((), "trap/rap italiano moderno: punchy compression, bright highs, deep sub, wide stereo, loud limiter"),
    "Geolier": ((), "rap napoletano moderno: deep sub, dark-warm tone, roomy reverb, punchy compression"),
    "Marracash": (("marra",), "rap italiano: dense mid-forward mix, punchy compression, moderate reverb, loud"),
    "Salmo": ((), "rap/rock aggressivo: distortion, hard compression, bright highs, loud limiter"),
    "Måneskin": (("maneskin",), "rock moderno: saturated guitars (distortion), punchy compression, short room reverb, loud"),
    "Mahmood": ((), "pop/urban: dark sub, bright vocal air, wide stereo, medium reverb with delay throws"),
    "Vasco Rossi": (("vasco",), "rock italiano anni 80-90: mid-forward, moderate drive, plate reverb, punchy"),
    "Lucio Battisti": (("battisti",), "pop italiano anni 70: warm vintage tone (hp ~60 Hz, lp ~12 kHz), light tape saturation, natural reverb, dynamic (no heavy limiting)"),
    "Ultimo": ((), "pop italiano ballad: big reverb, warm lows, gentle compression, wide stereo"),
}


# Names that are also common words ("ultimo" = "last"): matched only when the
# user typed them in the artist field, never inside a free-text prompt.
_AMBIGUOUS = {"Ultimo"}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", s).strip()


_INDEX: list[tuple[re.Pattern[str], str]] = []
for _name, (_aliases, _) in _STYLES.items():
    for _alias in (_name, *_aliases):
        _INDEX.append((re.compile(rf"(?<![a-z0-9]){re.escape(_norm(_alias))}(?![a-z0-9])"), _name))
# Longest alias first: "post malone" must win over a shorter overlapping one.
_INDEX.sort(key=lambda t: -len(t[0].pattern))


def names() -> list[str]:
    return sorted(_STYLES)


def match(text: str, *, explicit: bool = False) -> list[str]:
    """Known artists mentioned in `text` (order of the table, no duplicates).
    `explicit` = `text` is the artist field, not a free-text prompt."""
    t = _norm(text)
    found = {name for pat, name in _INDEX if pat.search(t) and (explicit or name not in _AMBIGUOUS)}
    return [n for n in _STYLES if n in found]


def traits(name: str) -> str | None:
    hit = match(name, explicit=True)
    return _STYLES[hit[0]][1] if hit else None
