// One-tap looks: instant, no LLM. Each one replaces the chain (starting from
// defaults) and can then be dosed with "Intensità" or refined by hand / by AI.
// Delay times sync to the track BPM when known (after the look's tempo change).
import { defaultChain, type EffectChain } from "./types";

export interface Look {
  id: string;
  label: string;
  hint: string;
  build: (bpm: number | null) => EffectChain;
}

type Partial2<T> = { [K in keyof T]?: T[K] extends object ? Partial2<T[K]> : T[K] };

function merge<T>(base: T, patch: Partial2<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const b = out[k];
    out[k] = v && typeof v === "object" && b && typeof b === "object" ? merge(b, v as Partial2<typeof b>) : v;
  }
  return out as T;
}

const chain = (p: Partial2<EffectChain>) => merge(defaultChain(), p);

/** Quarter note (or a fraction of it) in ms at `bpm × speed`, within the delay range. */
const beatMs = (bpm: number | null, speed = 1, fraction = 1, fallback = 375) =>
  bpm ? Math.min(2000, Math.max(1, Math.round((60000 / (bpm * speed)) * fraction))) : fallback;

// Same speed change as a slowed-down record: pitch follows tempo.
const vinylSemitones = (ratio: number) => Number((12 * Math.log2(ratio)).toFixed(1));

export const LOOKS: Look[] = [
  {
    id: "slowed",
    label: "Slowed + Reverb",
    hint: "più lenta e più grave, riverbero ampio",
    build: () => chain({
      tempo: { enabled: true, ratio: 0.82 },
      pitch: { enabled: true, semitones: vinylSemitones(0.82) },
      lp: { enabled: true, freq: 12000 },
      reverb: { enabled: true, room_size: 0.85, damping: 0.55, wet: 0.35, dry: 0.8, width: 1 },
      stereo: { enabled: true, width: 1.2 },
      limiter: { enabled: true, threshold_db: -1 },
    }),
  },
  {
    id: "nightcore",
    label: "Nightcore",
    hint: "più veloce e più acuta, brillante",
    build: () => chain({
      tempo: { enabled: true, ratio: 1.25 },
      pitch: { enabled: true, semitones: vinylSemitones(1.25) },
      eq: { enabled: true, high: { freq: 9000, gain_db: 2, q: 0.7 } },
      comp: { enabled: true, threshold_db: -16, ratio: 3, makeup_db: 2 },
      limiter: { enabled: true, threshold_db: -0.5 },
    }),
  },
  {
    id: "lofi",
    label: "Lo-fi",
    hint: "cassetta: banda stretta, calda, sporca",
    build: () => chain({
      tempo: { enabled: true, ratio: 0.92 },
      hp: { enabled: true, freq: 110 },
      lp: { enabled: true, freq: 4500 },
      distortion: { enabled: true, drive_db: 8 },
      comp: { enabled: true, threshold_db: -22, ratio: 4, attack_ms: 25, release_ms: 250, makeup_db: 4 },
      reverb: { enabled: true, room_size: 0.4, damping: 0.8, wet: 0.18, dry: 0.85 },
      stereo: { enabled: true, width: 0.7 },
      limiter: { enabled: true, threshold_db: -1.5 },
    }),
  },
  {
    id: "underwater",
    label: "Underwater",
    hint: "ovattata, lontana, sott'acqua",
    build: () => chain({
      lp: { enabled: true, freq: 650 },
      eq: { enabled: true, low: { freq: 120, gain_db: 3, q: 0.7 } },
      reverb: { enabled: true, room_size: 0.9, damping: 0.9, wet: 0.45, dry: 0.7, width: 1 },
      stereo: { enabled: true, width: 1.4 },
      limiter: { enabled: true, threshold_db: -1 },
    }),
  },
  {
    id: "radio",
    label: "Radio",
    hint: "vecchia radio/telefono, mono",
    build: () => chain({
      hp: { enabled: true, freq: 450 },
      lp: { enabled: true, freq: 3500 },
      eq: { enabled: true, mid: { freq: 1500, gain_db: 4, q: 1.2 } },
      distortion: { enabled: true, drive_db: 14 },
      comp: { enabled: true, threshold_db: -24, ratio: 8, attack_ms: 2, release_ms: 80, makeup_db: 6 },
      stereo: { enabled: true, width: 0 },
      limiter: { enabled: true, threshold_db: -2 },
    }),
  },
  {
    id: "stadium",
    label: "Stadium",
    hint: "enorme: spazio, eco a tempo, larghezza",
    build: (bpm) => chain({
      comp: { enabled: true, threshold_db: -18, ratio: 3, attack_ms: 15, release_ms: 150, makeup_db: 3 },
      delay: { enabled: true, time_ms: beatMs(bpm), feedback: 0.3, mix: 0.18 },
      reverb: { enabled: true, room_size: 0.97, damping: 0.35, wet: 0.4, dry: 0.75, width: 1 },
      stereo: { enabled: true, width: 1.6 },
      limiter: { enabled: true, threshold_db: -0.5 },
    }),
  },
  {
    id: "club",
    label: "Club",
    hint: "bassi pieni, punch, forte",
    build: (bpm) => chain({
      hp: { enabled: true, freq: 28 },
      eq: { enabled: true, low: { freq: 60, gain_db: 4, q: 0.8 }, mid: { freq: 350, gain_db: -2, q: 1 }, high: { freq: 10000, gain_db: 2, q: 0.7 } },
      comp: { enabled: true, threshold_db: -16, ratio: 5, attack_ms: 5, release_ms: 100, makeup_db: 4 },
      delay: { enabled: true, time_ms: beatMs(bpm, 1, 0.75), feedback: 0.2, mix: 0.08 },
      stereo: { enabled: true, width: 1.2 },
      limiter: { enabled: true, threshold_db: -0.3 },
    }),
  },
  {
    id: "vinyl",
    label: "Vinile '70",
    hint: "calda, morbida, d'epoca",
    build: () => chain({
      hp: { enabled: true, freq: 45 },
      lp: { enabled: true, freq: 10500 },
      eq: { enabled: true, low: { freq: 150, gain_db: 1.5, q: 0.7 }, mid: { freq: 800, gain_db: 1.5, q: 0.8 } },
      distortion: { enabled: true, drive_db: 4 },
      reverb: { enabled: true, room_size: 0.5, damping: 0.6, wet: 0.15, dry: 0.9 },
      stereo: { enabled: true, width: 0.85 },
    }),
  },
];
