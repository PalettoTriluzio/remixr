// Mirror of backend/app/models.py. Keep in sync manually until we auto-generate.

export interface EqBand { freq: number; gain_db: number; q: number; }

export interface HighPass { enabled: boolean; freq: number; }
export interface LowPass { enabled: boolean; freq: number; }
export interface EQ { enabled: boolean; low: EqBand; mid: EqBand; high: EqBand; }
export interface Compressor {
  enabled: boolean; threshold_db: number; ratio: number;
  attack_ms: number; release_ms: number; makeup_db: number;
}
export interface Limiter { enabled: boolean; threshold_db: number; release_ms: number; }
export interface Reverb {
  enabled: boolean; room_size: number; damping: number;
  wet: number; dry: number; width: number;
}
export interface Delay { enabled: boolean; time_ms: number; feedback: number; mix: number; }
export interface Distortion { enabled: boolean; drive_db: number; }
export interface StereoWidth { enabled: boolean; width: number; }
export interface Pitch { enabled: boolean; semitones: number; }
export interface Tempo { enabled: boolean; ratio: number; }

export interface EffectChain {
  input_gain_db: number;
  hp: HighPass;
  eq: EQ;
  comp: Compressor;
  distortion: Distortion;
  lp: LowPass;
  delay: Delay;
  reverb: Reverb;
  stereo: StereoWidth;
  pitch: Pitch;
  tempo: Tempo;
  limiter: Limiter;
}

export interface PerStemChains {
  vocals: EffectChain;
  drums: EffectChain;
  bass: EffectChain;
  other: EffectChain;
}

export interface Params {
  global_chain: EffectChain;
  per_stem: PerStemChains | null;
}

export interface UploadResponse {
  track_id: string;
  filename: string;
  duration_sec: number;
  sample_rate: number;
  channels: number;
}

export interface AnalyzeResponse {
  track_id: string;
  bpm: number;
  key: string;
  peaks: number[];
  spectrum: number[];
}

export interface LLMInterpretRequest {
  prompt: string;
  current_params: Params;
  genre?: string | null;
  bpm?: number | null;
  key?: string | null;
}

export interface LLMStatus {
  state: "idle" | "loading" | "ready" | "error";
  model?: string | null;
  gpu_offload?: boolean | null;
  error?: string | null;
}

export interface LLMInterpretResponse {
  params: Params;
  explanation: string;
  changed_fields: string[];
}

export interface RenderRequest {
  track_id: string;
  params: Params;
  format?: "wav" | "mp3";
  region_start_sec?: number | null;
  region_end_sec?: number | null;
}

export interface RenderResponse {
  render_id: string;
  path: string;
  duration_sec: number;
}

export interface Preset {
  name: string;
  params: Params;
  genre?: string | null;
  created_at: string;
}

export interface StemsJobResponse {
  job_id: string;
  status: "pending" | "running" | "done" | "error";
  stems?: Record<string, string> | null;
  error?: string | null;
}

// ---- Defaults ----

export const defaultChain = (): EffectChain => ({
  input_gain_db: 0,
  hp: { enabled: false, freq: 80 },
  eq: {
    enabled: false,
    low: { freq: 100, gain_db: 0, q: 0.7 },
    mid: { freq: 1000, gain_db: 0, q: 1.0 },
    high: { freq: 8000, gain_db: 0, q: 0.7 },
  },
  comp: { enabled: false, threshold_db: -18, ratio: 4, attack_ms: 10, release_ms: 100, makeup_db: 0 },
  distortion: { enabled: false, drive_db: 6 },
  lp: { enabled: false, freq: 18000 },
  delay: { enabled: false, time_ms: 375, feedback: 0.35, mix: 0.25 },
  reverb: { enabled: false, room_size: 0.5, damping: 0.5, wet: 0.25, dry: 0.75, width: 1.0 },
  stereo: { enabled: false, width: 1.0 },
  pitch: { enabled: false, semitones: 0 },
  tempo: { enabled: false, ratio: 1.0 },
  limiter: { enabled: false, threshold_db: -0.3, release_ms: 100 },
});

export const defaultParams = (): Params => ({
  global_chain: defaultChain(),
  per_stem: null,
});
