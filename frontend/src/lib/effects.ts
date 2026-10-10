// UI description of the effect chain: which knobs each card shows.
// Ranges mirror the Field(ge=, le=) bounds in backend/app/models.py.
import type { EffectChain } from "./types";

export type EffectId =
  | "tempo" | "pitch" | "hp" | "eq" | "comp" | "distortion"
  | "lp" | "delay" | "reverb" | "stereo" | "limiter";

export interface ControlDef {
  /** Path inside the effect, e.g. "freq" or "low.gain_db". */
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  log?: boolean;
}

export interface EffectDef {
  id: EffectId;
  label: string;
  controls: ControlDef[];
}

const hz = (key: string, label: string, min: number, max: number): ControlDef =>
  ({ key, label, min, max, step: 1, unit: "Hz", log: true });

// Display order = signal flow (backend/app/dsp/chain.py, fixed).
export const EFFECTS: EffectDef[] = [
  { id: "tempo", label: "Tempo", controls: [
    { key: "ratio", label: "Speed", min: 0.25, max: 4, step: 0.01, unit: "×", log: true },
  ] },
  { id: "pitch", label: "Pitch", controls: [
    { key: "semitones", label: "Semi", min: -24, max: 24, step: 0.1, unit: "st" },
  ] },
  { id: "hp", label: "High Pass", controls: [hz("freq", "Freq", 20, 2000)] },
  { id: "eq", label: "EQ 3-Band", controls: [
    { key: "low.gain_db", label: "Low", min: -24, max: 24, step: 0.1, unit: "dB" },
    hz("low.freq", "Low F", 20, 20000),
    { key: "mid.gain_db", label: "Mid", min: -24, max: 24, step: 0.1, unit: "dB" },
    hz("mid.freq", "Mid F", 20, 20000),
    { key: "mid.q", label: "Mid Q", min: 0.1, max: 10, step: 0.01, log: true },
    { key: "high.gain_db", label: "High", min: -24, max: 24, step: 0.1, unit: "dB" },
    hz("high.freq", "High F", 20, 20000),
  ] },
  { id: "comp", label: "Compressor", controls: [
    { key: "threshold_db", label: "Thresh", min: -60, max: 0, step: 0.1, unit: "dB" },
    { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, unit: ":1", log: true },
    { key: "attack_ms", label: "Attack", min: 0.1, max: 200, step: 0.1, unit: "ms", log: true },
    { key: "release_ms", label: "Release", min: 10, max: 2000, step: 1, unit: "ms", log: true },
    { key: "makeup_db", label: "Makeup", min: -12, max: 24, step: 0.1, unit: "dB" },
  ] },
  { id: "distortion", label: "Distortion", controls: [
    { key: "drive_db", label: "Drive", min: 0, max: 48, step: 0.1, unit: "dB" },
  ] },
  { id: "lp", label: "Low Pass", controls: [hz("freq", "Freq", 200, 20000)] },
  { id: "delay", label: "Delay", controls: [
    { key: "time_ms", label: "Time", min: 1, max: 2000, step: 1, unit: "ms", log: true },
    { key: "feedback", label: "Fdbk", min: 0, max: 0.95, step: 0.01 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01 },
  ] },
  { id: "reverb", label: "Reverb", controls: [
    { key: "room_size", label: "Size", min: 0, max: 1, step: 0.01 },
    { key: "damping", label: "Damp", min: 0, max: 1, step: 0.01 },
    { key: "wet", label: "Wet", min: 0, max: 1, step: 0.01 },
    { key: "dry", label: "Dry", min: 0, max: 1, step: 0.01 },
    { key: "width", label: "Width", min: 0, max: 1, step: 0.01 },
  ] },
  { id: "stereo", label: "Stereo Width", controls: [
    { key: "width", label: "Width", min: 0, max: 2, step: 0.01 },
  ] },
  { id: "limiter", label: "Limiter", controls: [
    { key: "threshold_db", label: "Thresh", min: -12, max: 0, step: 0.1, unit: "dB" },
    { key: "release_ms", label: "Release", min: 10, max: 2000, step: 1, unit: "ms", log: true },
  ] },
];

export const INPUT_GAIN: ControlDef =
  { key: "input_gain_db", label: "Gain", min: -24, max: 24, step: 0.1, unit: "dB" };

// ---- path helpers (paths are dot-separated, e.g. "reverb.wet") ----

export function getIn(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (o, k) => (o != null && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

export function setIn<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const src = obj as Record<string, unknown>;
  return {
    ...src,
    [head]: rest.length ? setIn(src[head], rest.join("."), value) : value,
  } as T;
}

/** True when the chain would leave the audio untouched: no preview needed. */
export function isNeutral(chain: EffectChain): boolean {
  return Math.abs(chain.input_gain_db) < 1e-6 && EFFECTS.every((e) => !chain[e.id].enabled);
}

/** Playback speed of the rendered audio vs the original. */
export function speedOf(chain: EffectChain): number {
  return chain.tempo.enabled ? chain.tempo.ratio : 1;
}

export function decimals(step: number): number {
  return step >= 1 ? 0 : Math.ceil(-Math.log10(step));
}

export function formatValue(v: number, c: Pick<ControlDef, "step" | "unit">): string {
  if (c.unit === "Hz" && v >= 1000) {
    return `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k`;
  }
  const s = v.toFixed(decimals(c.step));
  return c.unit && c.unit !== "Hz" ? `${s}${c.unit === "×" || c.unit === ":1" ? "" : " "}${c.unit}` : s;
}

/** Look up the control definition for a full param path ("global_chain.reverb.wet"). */
export function controlForPath(path: string): ControlDef | undefined {
  const p = path.replace(/^global_chain\./, "");
  if (p === INPUT_GAIN.key) return INPUT_GAIN;
  const [id, ...rest] = p.split(".");
  return EFFECTS.find((e) => e.id === id)?.controls.find((c) => c.key === rest.join("."));
}
