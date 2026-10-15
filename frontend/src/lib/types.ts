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
  reference_artist?: string | null;
  variation?: number | null;
}

export interface LLMStatus {
  state: "idle" | "loading" | "ready" | "error";
  model?: string | null;
  gpu_offload?: boolean | null;
  error?: string | null;
  available?: string[];
}

export interface LLMInterpretResponse {
  params: Params;
  explanation: string;
  changed_fields: string[];
}

export type StemName = "vocals" | "drums" | "bass" | "other";
export const STEM_NAMES: StemName[] = ["vocals", "drums", "bass", "other"];

export interface StemLevel { gain_db: number; mute: boolean; solo: boolean; }
export type StemMix = Record<StemName, StemLevel>;

export interface RenderRequest {
  track_id: string;
  params: Params;
  /** Set = render from the stems with these levels (409 if not separated). */
  stem_mix?: StemMix | null;
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
  status: "none" | "pending" | "running" | "done" | "error";
  progress: number; // 0..1
  stems?: Record<StemName, string> | null; // URLs when done
  model?: string | null;
  device?: string | null;
  elapsed_sec?: number | null;
  error?: string | null;
}

export interface Section {
  start: number;
  end: number;
  bar_start: number; // 1-based, inclusive
  bar_end: number;   // 1-based, exclusive
  label: string;     // same letter = same material
  name: string;      // intro / strofa / ritornello / bridge / break / outro / parte
  energy: number;    // 0..1
}

export interface ChordSpan { start: number; end: number; chord: string; } // "N" = no chord

export interface StructureResponse {
  track_id: string;
  source: "mix" | "stems";
  bpm: number;
  key: string;
  beats_per_bar: number;
  beats: number[];
  downbeats: number[]; // downbeats[i] = start of bar i+1
  sections: Section[];
  chords: ChordSpan[];
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

export const defaultStemLevel = (): StemLevel => ({ gain_db: 0, mute: false, solo: false });
export const defaultStemMix = (): StemMix => ({
  vocals: defaultStemLevel(), drums: defaultStemLevel(), bass: defaultStemLevel(), other: defaultStemLevel(),
});

export const defaultParams = (): Params => ({
  global_chain: defaultChain(),
  per_stem: null,
});

// ---- Flip (arrangement), mirror of the Flip* models ----

export type FlipSource = StemName | "mix";
export type GateRate = "off" | "1/4" | "1/8" | "1/16" | "1/32";

export interface FlipClip {
  id: string;
  source: FlipSource;
  src_start: number;   // seconds in the original
  src_end: number;
  src_beats: number;   // beats of the original grid the slice spans
  at_beat: number;     // position on the project timeline
  length_beats: number;
  loop: boolean;       // false = stretched to fill, true = repeats at project tempo
  stretch: "warp" | "repitch";
  semitones: number;
  reverse: boolean;
  gain_db: number;
  hp_freq: number;     // 20 = off
  lp_freq: number;     // 20000 = off
  gate: GateRate;
  gate_duty: number;
  fade_in_ms: number;
  fade_out_ms: number;
  tune: number;        // 0..1 pitch correction toward the scale
  harmony: number;     // diatonic steps, 0 = off
}

export type DrumVoice = "kick" | "snare" | "clap" | "hat" | "open_hat" | "rim" | "perc";
export const DRUM_VOICES: DrumVoice[] = ["kick", "snare", "clap", "hat", "open_hat", "rim", "perc"];
export type TrackKind = "audio" | "drums" | "bass" | "keys";

export interface Note {
  start: number;  // beats from the pattern start
  length: number; // beats
  pitch: number;  // MIDI, key of the original (transpose added at render)
  vel: number;
}

/** Generated material: one cycle of pattern_beats repeated over length_beats. */
export interface PatternClip {
  id: string;
  at_beat: number;
  length_beats: number;
  pattern_beats: number;
  steps_per_beat: number;
  lanes: Partial<Record<DrumVoice, number[]>>; // velocity per step, 0 = off
  rolls: Partial<Record<DrumVoice, number[]>>; // 2..6 = roll inside the step
  notes: Note[];
  swing: number;
  gain_db: number;
}

export type Kit = "trap" | "boombap" | "house" | "lofi" | "afro";
export type SynthPreset = "808" | "sub" | "reese" | "pluck_bass" | "pad" | "keys" | "pluck" | "bell" | "lead";

export interface Instrument {
  kit: Kit;
  preset: SynthPreset;
  tune: number;
  decay: number;
  attack_ms: number;
  release_ms: number;
  cutoff: number;
  glide_ms: number;
  drive_db: number;
  detune: number;
}

export interface ChordMark { start: number; end: number; name: string; }

export interface FlipTrack {
  id: string;
  name: string;
  kind: TrackKind;
  instrument: Instrument;
  patterns: PatternClip[];
  gain_db: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  follow_key: boolean;
  chain: EffectChain;
  clips: FlipClip[];
}

export interface FlipProject {
  bpm: number;
  bars: number;
  beats_per_bar: number;
  source_key: string;
  transpose: number;
  tracks: FlipTrack[];
  chords: ChordMark[];
}

export type GenStyle = "trap" | "drill" | "boombap" | "house" | "lofi" | "reggaeton" | "afro" | "pop";
export type GenPart = "drums" | "bass" | "chords" | "arp";
export type Mood = "dark" | "sad" | "epic" | "happy" | "dreamy";

export interface GenerateRequest {
  track_id: string;
  project: FlipProject;
  style: GenStyle;
  harmony: "song" | "new";
  mood: Mood;
  parts: GenPart[];
  start_bar: number;
  bars: number;
  seed: number;
}

export interface GenerateResponse {
  tracks: FlipTrack[];
  chords: ChordMark[];
  explanation: string;
}

export const defaultInstrument = (): Instrument => ({
  kit: "trap", preset: "808", tune: 0, decay: 1, attack_ms: 5, release_ms: 150,
  cutoff: 6000, glide_ms: 0, drive_db: 0, detune: 0.3,
});

export interface FlipRenderRequest {
  track_id: string;
  project: FlipProject;
  master: EffectChain;
  format?: "wav" | "mp3";
  start_beat?: number | null;
  end_beat?: number | null;
}

export const defaultClip = (c: Pick<FlipClip, "id" | "source" | "src_start" | "src_end" | "src_beats" | "at_beat" | "length_beats">): FlipClip => ({
  loop: false, stretch: "warp", semitones: 0, reverse: false, gain_db: 0,
  hp_freq: 20, lp_freq: 20000, gate: "off", gate_duty: 0.5,
  fade_in_ms: 5, fade_out_ms: 10, tune: 0, harmony: 0,
  ...c,
});
