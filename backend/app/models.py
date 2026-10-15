"""Single source of truth for parameter schema. Mirrored in frontend/src/lib/types.ts."""
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


# ---- Effects ----

class HighPass(BaseModel):
    enabled: bool = False
    freq: float = Field(80.0, ge=20.0, le=2000.0)


class LowPass(BaseModel):
    enabled: bool = False
    freq: float = Field(18000.0, ge=200.0, le=20000.0)


class EqBand(BaseModel):
    freq: float = Field(1000.0, ge=20.0, le=20000.0)
    gain_db: float = Field(0.0, ge=-24.0, le=24.0)
    q: float = Field(1.0, ge=0.1, le=10.0)


class EQ(BaseModel):
    enabled: bool = False
    low: EqBand = Field(default_factory=lambda: EqBand(freq=100.0, gain_db=0.0, q=0.7))
    mid: EqBand = Field(default_factory=lambda: EqBand(freq=1000.0, gain_db=0.0, q=1.0))
    high: EqBand = Field(default_factory=lambda: EqBand(freq=8000.0, gain_db=0.0, q=0.7))


class Compressor(BaseModel):
    enabled: bool = False
    threshold_db: float = Field(-18.0, ge=-60.0, le=0.0)
    ratio: float = Field(4.0, ge=1.0, le=20.0)
    attack_ms: float = Field(10.0, ge=0.1, le=200.0)
    release_ms: float = Field(100.0, ge=10.0, le=2000.0)
    makeup_db: float = Field(0.0, ge=-12.0, le=24.0)


class Limiter(BaseModel):
    enabled: bool = False
    threshold_db: float = Field(-0.3, ge=-12.0, le=0.0)
    release_ms: float = Field(100.0, ge=10.0, le=2000.0)


class Reverb(BaseModel):
    enabled: bool = False
    room_size: float = Field(0.5, ge=0.0, le=1.0)
    damping: float = Field(0.5, ge=0.0, le=1.0)
    wet: float = Field(0.25, ge=0.0, le=1.0)
    dry: float = Field(0.75, ge=0.0, le=1.0)
    width: float = Field(1.0, ge=0.0, le=1.0)


class Delay(BaseModel):
    enabled: bool = False
    time_ms: float = Field(375.0, ge=1.0, le=2000.0)
    feedback: float = Field(0.35, ge=0.0, le=0.95)
    mix: float = Field(0.25, ge=0.0, le=1.0)


class Distortion(BaseModel):
    enabled: bool = False
    drive_db: float = Field(6.0, ge=0.0, le=48.0)


class StereoWidth(BaseModel):
    enabled: bool = False
    width: float = Field(1.0, ge=0.0, le=2.0)  # 0=mono, 1=neutral, 2=extra wide


class Pitch(BaseModel):
    enabled: bool = False
    semitones: float = Field(0.0, ge=-24.0, le=24.0)


class Tempo(BaseModel):
    enabled: bool = False
    ratio: float = Field(1.0, ge=0.25, le=4.0)  # 1.0 = original


# ---- Chain (per stem or global) ----

class EffectChain(BaseModel):
    input_gain_db: float = Field(0.0, ge=-24.0, le=24.0)
    hp: HighPass = Field(default_factory=HighPass)
    eq: EQ = Field(default_factory=EQ)
    comp: Compressor = Field(default_factory=Compressor)
    distortion: Distortion = Field(default_factory=Distortion)
    lp: LowPass = Field(default_factory=LowPass)
    delay: Delay = Field(default_factory=Delay)
    reverb: Reverb = Field(default_factory=Reverb)
    stereo: StereoWidth = Field(default_factory=StereoWidth)
    pitch: Pitch = Field(default_factory=Pitch)
    tempo: Tempo = Field(default_factory=Tempo)
    limiter: Limiter = Field(default_factory=Limiter)


class PerStemChains(BaseModel):
    vocals: EffectChain = Field(default_factory=EffectChain)
    drums: EffectChain = Field(default_factory=EffectChain)
    bass: EffectChain = Field(default_factory=EffectChain)
    other: EffectChain = Field(default_factory=EffectChain)


class Params(BaseModel):
    """Complete parameter set for a remix render."""
    global_chain: EffectChain = Field(default_factory=EffectChain)
    per_stem: Optional[PerStemChains] = None  # None = mix mode, set = stems mode


# ---- API payloads ----

class UploadResponse(BaseModel):
    track_id: str
    filename: str
    duration_sec: float
    sample_rate: int
    channels: int


class AnalyzeResponse(BaseModel):
    track_id: str
    bpm: float
    key: str
    peaks: list[float]
    spectrum: list[float]


class LLMInterpretRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    current_params: Params
    genre: Optional[str] = None
    # Track context from /analyze, optional: lets the model sync delay times
    # and compute tempo ratios toward a target BPM.
    bpm: Optional[float] = None
    key: Optional[str] = None
    # "Do it like <artist>": production traits come from app/llm/styles.py
    # when the artist is known, otherwise from the model's own knowledge.
    reference_artist: Optional[str] = Field(None, max_length=100)
    # Set = one of several alternative answers to the same prompt: sampled
    # hotter, with its own seed and a hint to differ from the obvious take.
    variation: Optional[int] = Field(None, ge=1, le=5)


class LLMInterpretResponse(BaseModel):
    params: Params
    explanation: str
    changed_fields: list[str]


class LLMStatus(BaseModel):
    state: Literal["idle", "loading", "ready", "error"]
    model: Optional[str] = None        # GGUF file name
    gpu_offload: Optional[bool] = None  # llama_supports_gpu_offload(), known after load
    error: Optional[str] = None
    available: list[str] = []          # *.gguf in backend/models/ (part 1 of split files)


class LLMSelectModel(BaseModel):
    model: str  # file name from LLMStatus.available


class StemLevel(BaseModel):
    gain_db: float = Field(0.0, ge=-60.0, le=12.0)
    mute: bool = False
    solo: bool = False


class StemMix(BaseModel):
    """Volume of each separated stem. Track-bound (stems exist per track), so
    it travels next to Params in the render request, not inside it."""
    vocals: StemLevel = Field(default_factory=StemLevel)
    drums: StemLevel = Field(default_factory=StemLevel)
    bass: StemLevel = Field(default_factory=StemLevel)
    other: StemLevel = Field(default_factory=StemLevel)


class RenderRequest(BaseModel):
    track_id: str
    params: Params
    # Set = render from the stems (data/stems/<track_id>/) mixed with these
    # levels instead of the original file. 409 if the track has no stems.
    stem_mix: Optional[StemMix] = None
    format: Literal["wav", "mp3"] = "wav"
    region_start_sec: Optional[float] = None
    region_end_sec: Optional[float] = None


class RenderResponse(BaseModel):
    render_id: str
    path: str
    duration_sec: float


class Preset(BaseModel):
    name: str
    params: Params
    genre: Optional[str] = None
    created_at: str = ""  # set by the server on save


class StemsJobResponse(BaseModel):
    job_id: str  # = track_id: one separation per track
    status: Literal["none", "pending", "running", "done", "error"]
    progress: float = 0.0                   # 0..1
    stems: Optional[dict[str, str]] = None  # {"vocals": "/api/stems/<id>/vocals", ...} when done
    model: Optional[str] = None             # demucs model name
    device: Optional[str] = None            # "cuda" | "cpu"
    elapsed_sec: Optional[float] = None
    error: Optional[str] = None


# ---- Structure (grid, sections, chords) ----

class Section(BaseModel):
    start: float
    end: float
    bar_start: int  # 1-based, inclusive
    bar_end: int    # 1-based, exclusive
    label: str      # "A", "B"…: same letter = same material
    name: str       # best guess: intro / strofa / ritornello / bridge / break / outro
    energy: float   # 0..1, relative to the loudest section


class ChordSpan(BaseModel):
    start: float
    end: float
    chord: str  # "C", "F#m", "N" = no chord


class StructureResponse(BaseModel):
    track_id: str
    source: Literal["mix", "stems"]  # stems = beats from the drum stem, chords from bass+other
    bpm: float
    key: str
    beats_per_bar: int = 4
    beats: list[float]
    downbeats: list[float]  # downbeats[i] = start of bar i+1
    sections: list[Section]
    chords: list[ChordSpan]


# ---- Flip: arrangement built from slices of the song ----
# A project is a timeline in beats at its own BPM. Each clip takes a slice of
# the original (a stem or the mix) and places it on a track; the backend
# renders it deterministically (app/flip/render.py). F10/F11 add generated
# tracks and an AI "recipe" on top of this same schema.

FlipSource = Literal["vocals", "drums", "bass", "other", "mix"]
GateRate = Literal["off", "1/4", "1/8", "1/16", "1/32"]


class FlipClip(BaseModel):
    id: str = Field(..., min_length=1, max_length=40)
    source: FlipSource = "vocals"
    # Slice of the original, in seconds, and how many beats of the original
    # grid it spans (sets the natural speed at the project's BPM).
    src_start: float = Field(..., ge=0.0)
    src_end: float = Field(..., gt=0.0)
    src_beats: float = Field(4.0, gt=0.0, le=256.0)
    # Placement on the project timeline.
    at_beat: float = Field(0.0, ge=0.0, le=4096.0)
    length_beats: float = Field(4.0, gt=0.0, le=1024.0)
    # loop=False: the slice is stretched to fill length_beats.
    # loop=True:  it plays src_beats long at the project tempo and repeats.
    loop: bool = False
    # warp = tempo changes, pitch stays · repitch = like a turntable, pitch follows speed
    stretch: Literal["warp", "repitch"] = "warp"
    semitones: float = Field(0.0, ge=-24.0, le=24.0)
    reverse: bool = False
    gain_db: float = Field(0.0, ge=-60.0, le=12.0)
    hp_freq: float = Field(20.0, ge=20.0, le=2000.0)      # 20 = off
    lp_freq: float = Field(20000.0, ge=200.0, le=20000.0)  # 20000 = off
    gate: GateRate = "off"  # rhythmic chopper locked to the project grid
    gate_duty: float = Field(0.5, ge=0.05, le=0.95)
    fade_in_ms: float = Field(5.0, ge=0.0, le=2000.0)
    fade_out_ms: float = Field(10.0, ge=0.0, le=4000.0)
    # Note-by-note pitch correction toward the scale of project.source_key
    # (0 = off, 1 = every note dead on), for vocals and melodic stems.
    tune: float = Field(0.0, ge=0.0, le=1.0)
    # Diatonic harmony: every note moved N scale steps (2 = third above,
    # 4 = fifth above, -2 = third below, 7 = octave). 0 = off.
    harmony: int = Field(0, ge=-7, le=7)

    @model_validator(mode="after")
    def _slice_not_empty(self):
        if self.src_end <= self.src_start:
            raise ValueError("src_end must be greater than src_start")
        return self


DrumVoice = Literal["kick", "snare", "clap", "hat", "open_hat", "rim", "perc"]
DRUM_VOICES = ("kick", "snare", "clap", "hat", "open_hat", "rim", "perc")
TrackKind = Literal["audio", "drums", "bass", "keys"]


class Note(BaseModel):
    start: float = Field(..., ge=0.0, le=1024.0)  # beats from the start of the pattern
    length: float = Field(..., gt=0.0, le=256.0)  # beats
    pitch: int = Field(..., ge=0, le=127)         # MIDI, in the key of the original (transpose added at render)
    vel: float = Field(0.8, ge=0.0, le=1.0)


class PatternClip(BaseModel):
    """Generated material on a drums/bass/keys track: one cycle of
    `pattern_beats`, repeated to fill `length_beats`."""
    id: str = Field(..., min_length=1, max_length=40)
    at_beat: float = Field(0.0, ge=0.0, le=4096.0)
    length_beats: float = Field(16.0, gt=0.0, le=1024.0)
    pattern_beats: float = Field(16.0, gt=0.0, le=1024.0)
    # drums: velocity per step (0 = off) and rolls (2..6 hits inside the step)
    steps_per_beat: int = Field(4, ge=1, le=8)
    lanes: dict[DrumVoice, list[float]] = Field(default_factory=dict)
    rolls: dict[DrumVoice, list[int]] = Field(default_factory=dict)
    # bass / keys
    notes: list[Note] = Field(default_factory=list, max_length=4096)
    swing: float = Field(0.0, ge=0.0, le=0.5)  # off-beat 16ths pushed late, fraction of a step
    gain_db: float = Field(0.0, ge=-60.0, le=12.0)


class Instrument(BaseModel):
    """Sound of a generated track (app/flip/instruments.py). Each kind reads
    the fields it needs."""
    kit: Literal["trap", "boombap", "house", "lofi", "afro"] = "trap"  # drums
    preset: Literal["808", "sub", "reese", "pluck_bass", "pad", "keys", "pluck", "bell", "lead"] = "808"
    tune: float = Field(0.0, ge=-12.0, le=12.0)        # drums: semitones
    decay: float = Field(1.0, ge=0.05, le=4.0)         # drums: length scale · 808: seconds
    attack_ms: float = Field(5.0, ge=0.0, le=2000.0)
    release_ms: float = Field(150.0, ge=5.0, le=4000.0)
    cutoff: float = Field(6000.0, ge=100.0, le=20000.0)
    glide_ms: float = Field(0.0, ge=0.0, le=500.0)     # 808 slides between touching notes
    drive_db: float = Field(0.0, ge=0.0, le=36.0)
    detune: float = Field(0.3, ge=0.0, le=1.0)         # unison spread


class ChordMark(BaseModel):
    start: float  # project beats
    end: float
    name: str     # "Am", "F" (key of the original; the UI adds the transpose)


class FlipTrack(BaseModel):
    id: str = Field(..., min_length=1, max_length=40)
    name: str = Field("Traccia", max_length=40)
    kind: TrackKind = "audio"
    instrument: Instrument = Field(default_factory=Instrument)
    patterns: list[PatternClip] = Field(default_factory=list, max_length=256)
    gain_db: float = Field(0.0, ge=-60.0, le=12.0)
    pan: float = Field(0.0, ge=-1.0, le=1.0)
    mute: bool = False
    solo: bool = False
    follow_key: bool = True  # transposed with the project (off for drums)
    chain: EffectChain = Field(default_factory=EffectChain)  # tempo is ignored here
    clips: list[FlipClip] = Field(default_factory=list, max_length=512)


class FlipProject(BaseModel):
    bpm: float = Field(120.0, ge=40.0, le=240.0)
    bars: int = Field(16, ge=1, le=256)
    beats_per_bar: int = Field(4, ge=1, le=12)
    source_key: str = Field("C major", max_length=20)  # key of the original: scale for tune/harmony
    transpose: float = Field(0.0, ge=-12.0, le=12.0)    # semitones, tracks with follow_key
    tracks: list[FlipTrack] = Field(default_factory=list, max_length=16)
    chords: list[ChordMark] = Field(default_factory=list, max_length=1024)  # last generated progression


class FlipRenderRequest(BaseModel):
    track_id: str
    project: FlipProject
    master: EffectChain = Field(default_factory=EffectChain)  # the rack, as heard (intensity applied)
    format: Literal["wav", "mp3"] = "wav"
    # Preview window in project beats (None = from the start / to the end).
    start_beat: Optional[float] = Field(None, ge=0.0)
    end_beat: Optional[float] = Field(None, gt=0.0)


class OnsetsResponse(BaseModel):
    times: list[float]  # seconds in the original, inside the requested slice


GenStyle = Literal["trap", "drill", "boombap", "house", "lofi", "reggaeton", "afro", "pop"]
GenPart = Literal["drums", "bass", "chords", "arp"]


class GenerateRequest(BaseModel):
    track_id: str
    project: FlipProject
    style: GenStyle = "trap"
    # song = the chords of the original under the audio clips in the range
    # (they fit the vocal) · new = a fresh progression in the key
    harmony: Literal["song", "new"] = "song"
    mood: Literal["dark", "sad", "epic", "happy", "dreamy"] = "dark"
    parts: list[GenPart] = Field(default_factory=lambda: ["drums", "bass", "chords"], min_length=1)
    start_bar: int = Field(1, ge=1, le=256)
    bars: int = Field(8, ge=1, le=256)
    seed: int = Field(0, ge=0, le=2**31 - 1)


class GenerateResponse(BaseModel):
    tracks: list[FlipTrack]   # one per part, ready to add (they replace same-name generated tracks)
    chords: list[ChordMark]   # progression used, project beats
    explanation: str
