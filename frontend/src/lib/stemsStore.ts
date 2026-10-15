// Track-bound "flip" state: stem separation job, stem mixer, structure
// (beat grid, sections, chords). Unlike the remix params it does not survive
// a track change: stems and bars belong to one song.
import { create } from "zustand";
import { api } from "./api";
import {
  defaultStemLevel, defaultStemMix,
  type StemLevel, type StemMix, type StemName, type StemsJobResponse, type StructureResponse,
} from "./types";

interface StemsState {
  trackId: string | null;
  job: StemsJobResponse | null;
  mix: StemMix;
  structure: StructureResponse | null;
  structureLoading: boolean;
  structureError: string | null;
  /** Region edges snap to bar lines. */
  snap: boolean;

  setTrack: (trackId: string | null) => void;
  setJob: (job: StemsJobResponse) => void;
  start: () => Promise<void>;
  setLevel: (stem: StemName, patch: Partial<StemLevel>) => void;
  setMix: (mix: StemMix) => void;
  loadStructure: () => Promise<void>;
  setSnap: (v: boolean) => void;
}

export const useStemsStore = create<StemsState>((set, get) => ({
  trackId: null,
  job: null,
  mix: defaultStemMix(),
  structure: null,
  structureLoading: false,
  structureError: null,
  snap: true,

  setTrack: (trackId) =>
    set({ trackId, job: null, mix: defaultStemMix(), structure: null, structureLoading: false, structureError: null }),

  setJob: (job) => { if (job.job_id === get().trackId) set({ job }); },

  start: async () => {
    const id = get().trackId;
    if (!id) return;
    try {
      get().setJob(await api.startStems(id));
    } catch (e) {
      get().setJob({ job_id: id, status: "error", progress: 0, error: (e as Error).message });
    }
  },

  setLevel: (stem, patch) => set((s) => ({ mix: { ...s.mix, [stem]: { ...s.mix[stem], ...patch } } })),
  setMix: (mix) => set({ mix }),

  loadStructure: async () => {
    const id = get().trackId;
    if (!id) return;
    set({ structureLoading: true, structureError: null });
    try {
      const structure = await api.structure(id);
      if (get().trackId === id) set({ structure, structureLoading: false });
    } catch (e) {
      if (get().trackId === id) set({ structureLoading: false, structureError: (e as Error).message });
    }
  },

  setSnap: (snap) => set({ snap }),
}));

const isDefault = (l: StemLevel) => {
  const d = defaultStemLevel();
  return Math.abs(l.gain_db - d.gain_db) < 1e-6 && l.mute === d.mute && l.solo === d.solo;
};

/** Stem levels to send with a render, or null = render the original file
 * (no stems yet, or the mixer is untouched: stems summed ≈ original). */
export function activeStemMix(s: Pick<StemsState, "job" | "mix">): StemMix | null {
  if (s.job?.status !== "done") return null;
  return Object.values(s.mix).every(isDefault) ? null : s.mix;
}

/** Nearest bar line to `t` (seconds), or `t` when there is no grid. */
export function snapToBar(t: number, downbeats: number[]): number {
  let best = t;
  let dist = Infinity;
  for (const d of downbeats) {
    const k = Math.abs(d - t);
    if (k < dist) { dist = k; best = d; }
  }
  return best;
}

/** 1-based bar containing `t` (0 = pickup before the first downbeat). */
export function barOf(t: number, downbeats: number[]): number {
  let lo = 0;
  let hi = downbeats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (downbeats[mid] <= t + 1e-3) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** "bar.beat" at `t`, e.g. "17.3". */
export function barBeat(t: number, beats: number[], downbeats: number[], beatsPerBar: number): string {
  const bar = barOf(t, downbeats);
  if (bar === 0) return "0";
  const start = downbeats[bar - 1];
  const beat = beats.filter((b) => b >= start - 1e-3 && b <= t + 1e-3).length;
  return `${bar}.${Math.min(Math.max(beat, 1), beatsPerBar)}`;
}
