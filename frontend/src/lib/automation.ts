// Track automation: display metadata and helpers. Values are 0..1, mapped by
// the backend (app/flip/automation.py) — keep the formulas in sync.
import type { AutoParam, AutoPoint } from "./types";

const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`);

export const AUTO_META: Record<AutoParam, { label: string; short: string; neutral: number; color: string; format: (v: number) => string }> = {
  volume: {
    label: "Volume", short: "VOL", neutral: 1, color: "#ffd25c",
    format: (v) => (v <= 0.001 ? "-∞ dB" : `${(40 * Math.log10(v)).toFixed(1)} dB`),
  },
  lowpass: {
    label: "Filtro passa-basso", short: "LP", neutral: 1, color: "#5cd4ff",
    format: (v) => (v >= 0.999 ? "aperto" : hz(60 * (20000 / 60) ** v)),
  },
  highpass: {
    label: "Filtro passa-alto", short: "HP", neutral: 0, color: "#ff8a5c",
    format: (v) => (v <= 0.001 ? "aperto" : hz(20 * (4000 / 20) ** v)),
  },
};

export const AUTO_ORDER: AutoParam[] = ["volume", "lowpass", "highpass"];

/** Value at a beat: linear between points, held at the ends; neutral if empty. */
export function valueAt(points: AutoPoint[] | undefined, param: AutoParam, beat: number): number {
  if (!points || points.length === 0) return AUTO_META[param].neutral;
  const pts = [...points].sort((a, b) => a.beat - b.beat);
  if (beat <= pts[0].beat) return pts[0].value;
  for (let i = 1; i < pts.length; i++) {
    if (beat <= pts[i].beat) {
      const a = pts[i - 1];
      const b = pts[i];
      return b.beat === a.beat ? b.value : a.value + ((beat - a.beat) / (b.beat - a.beat)) * (b.value - a.value);
    }
  }
  return pts[pts.length - 1].value;
}
