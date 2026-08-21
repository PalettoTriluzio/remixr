"""Single source of truth for parameter schema. Mirrored in frontend/src/lib/types.ts."""
from typing import Literal, Optional
from pydantic import BaseModel, Field


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
    prompt: str
    current_params: Params
    genre: Optional[str] = None


class LLMInterpretResponse(BaseModel):
    params: Params
    explanation: str
    changed_fields: list[str]


class RenderRequest(BaseModel):
    track_id: str
    params: Params
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
    created_at: str


class StemsJobResponse(BaseModel):
    job_id: str
    status: Literal["pending", "running", "done", "error"]
    stems: Optional[dict[str, str]] = None  # {"vocals": path, ...} when done
    error: Optional[str] = None
