// "Intensità": one macro over the whole remix.
//   0 %   = original (neutral chain, no preview)
//   100 % = the chain exactly as set in the rack
//   150 % = every move pushed further, clamped to the knob ranges
// Each control slides between its *neutral* value (where it does nothing) and
// its current value; controls that only shape an effect (eq freq/q, attack,
// delay time, room size…) are left alone.
import { EFFECTS, INPUT_GAIN, getIn, setIn, type ControlDef } from "./effects";
import { defaultChain, type EffectChain, type Params } from "./types";

const NEUTRAL: Record<string, number> = {
  "input_gain_db": 0,
  "tempo.ratio": 1,
  "pitch.semitones": 0,
  "hp.freq": 20,
  "lp.freq": 20000,
  "eq.low.gain_db": 0,
  "eq.mid.gain_db": 0,
  "eq.high.gain_db": 0,
  "comp.threshold_db": 0,
  "comp.ratio": 1,
  "comp.makeup_db": 0,
  "distortion.drive_db": 0,
  "delay.mix": 0,
  "reverb.wet": 0,
  "reverb.dry": 1,
  "stereo.width": 1,
  "limiter.threshold_db": 0,
};

const CONTROLS: Array<[string, ControlDef]> = [
  [INPUT_GAIN.key, INPUT_GAIN] as [string, ControlDef],
  ...EFFECTS.flatMap((e) => e.controls.map((c) => [`${e.id}.${c.key}`, c] as [string, ControlDef])),
].filter(([path]) => path in NEUTRAL);

function lerp(from: number, to: number, t: number, c: ControlDef): number {
  const v = c.log && from > 0 && to > 0
    ? from * Math.pow(to / from, t) // musical for Hz, ratios, speed
    : from + (to - from) * t;
  return Math.min(c.max, Math.max(c.min, v));
}

export function morphChain(chain: EffectChain, amount: number): EffectChain {
  if (Math.abs(amount - 1) < 1e-6) return chain;
  if (amount <= 0) return defaultChain();
  let out = chain;
  for (const [path, c] of CONTROLS) {
    const value = getIn(chain, path) as number;
    out = setIn(out, path, lerp(NEUTRAL[path], value, amount, c));
  }
  return out;
}

export function morphParams(params: Params, amountPct: number): Params {
  return { ...params, global_chain: morphChain(params.global_chain, amountPct / 100) };
}
