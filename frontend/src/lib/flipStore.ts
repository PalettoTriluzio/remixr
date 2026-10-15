// Flip mode state: the arrangement project, selection, timeline view, undo.
// The project belongs to one song (clips are slices of it): it is saved in the
// session with its track_id and dropped when another song is loaded.
import { create } from "zustand";
import { clipEnd, newTrack, projectBeats, uid } from "./flip";
import type { FlipClip, FlipProject, FlipTrack } from "./types";

export type View = "remix" | "flip";
export type Selection =
  | { kind: "clip"; trackId: string; clipId: string }
  | { kind: "track"; trackId: string }
  | null;
export type FlipStatus = "idle" | "rendering" | "ready" | "error";

/** Snap of moves/resizes on the timeline, in beats. */
export const SNAPS = [
  { label: "battuta", beats: 0 }, // 0 = beats_per_bar
  { label: "1/4", beats: 1 },
  { label: "1/8", beats: 0.5 },
  { label: "1/16", beats: 0.25 },
  { label: "libero", beats: -1 },
] as const;

interface FlipState {
  view: View;
  trackId: string | null;
  project: FlipProject | null;
  selection: Selection;
  past: FlipProject[];
  future: FlipProject[];

  /** px per beat */
  zoom: number;
  snap: number; // index in SNAPS
  playhead: number; // beats
  loop: { start: number; end: number } | null; // beats
  loopOn: boolean;
  status: FlipStatus;
  error: string | null;

  setView: (v: View) => void;
  setProject: (trackId: string, p: FlipProject) => void;
  clear: () => void;
  /** Every project edit goes through here (undo). Same `gesture` key within
   * 800 ms = one undo step (drags, knob turns). */
  edit: (fn: (p: FlipProject) => FlipProject, gesture?: string) => void;
  undo: () => void;
  redo: () => void;

  select: (s: Selection) => void;
  setZoom: (z: number) => void;
  setSnap: (i: number) => void;
  setPlayhead: (b: number) => void;
  setLoop: (l: { start: number; end: number } | null) => void;
  setLoopOn: (v: boolean) => void;
  setStatus: (s: FlipStatus, error?: string | null) => void;
}

const HISTORY_MAX = 100;
const COALESCE_MS = 800;
let lastGesture = { key: "", at: 0 };

export const useFlipStore = create<FlipState>((set) => ({
  view: "remix",
  trackId: null,
  project: null,
  selection: null,
  past: [],
  future: [],
  zoom: 28,
  snap: 1,
  playhead: 0,
  loop: null,
  loopOn: false,
  status: "idle",
  error: null,

  setView: (view) => set({ view }),
  setProject: (trackId, project) =>
    set({ trackId, project, selection: null, past: [], future: [], playhead: 0, loop: null, loopOn: false }),
  clear: () => set({ trackId: null, project: null, selection: null, past: [], future: [], status: "idle", error: null }),

  edit: (fn, gesture) =>
    set((s) => {
      if (!s.project) return {};
      const next = fn(s.project);
      if (next === s.project) return {};
      const now = Date.now();
      const same = !!gesture && lastGesture.key === gesture && now - lastGesture.at < COALESCE_MS;
      lastGesture = { key: gesture ?? "", at: now };
      return {
        project: next,
        past: same ? s.past : [...s.past, s.project].slice(-HISTORY_MAX),
        future: [],
      };
    }),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev || !s.project) return {};
      lastGesture = { key: "", at: 0 };
      return { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future] };
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !s.project) return {};
      lastGesture = { key: "", at: 0 };
      return { project: next, past: [...s.past, s.project].slice(-HISTORY_MAX), future: s.future.slice(1) };
    }),

  select: (selection) => set({ selection }),
  setZoom: (zoom) => set({ zoom: Math.min(160, Math.max(6, zoom)) }),
  setSnap: (snap) => set({ snap }),
  setPlayhead: (playhead) => set({ playhead: Math.max(0, playhead) }),
  setLoop: (loop) => set({ loop, loopOn: !!loop }),
  setLoopOn: (loopOn) => set({ loopOn }),
  setStatus: (status, error = null) => set({ status, error }),
}));

// ---- project edits (pure: FlipProject → FlipProject) ----

const mapTrack = (p: FlipProject, trackId: string, fn: (t: FlipTrack) => FlipTrack): FlipProject => ({
  ...p,
  tracks: p.tracks.map((t) => (t.id === trackId ? fn(t) : t)),
});

/** Grow the project so `beat` fits (whole bars). */
const fit = (p: FlipProject, beat: number): FlipProject =>
  beat > projectBeats(p) ? { ...p, bars: Math.min(256, Math.ceil(beat / p.beats_per_bar)) } : p;

export const ops = {
  setProjectField: <K extends keyof FlipProject>(k: K, v: FlipProject[K]) => (p: FlipProject): FlipProject => ({ ...p, [k]: v }),

  addTrack: (name: string, followKey = true) => (p: FlipProject): FlipProject =>
    p.tracks.length >= 16 ? p : { ...p, tracks: [...p.tracks, newTrack(name, followKey)] },

  removeTrack: (trackId: string) => (p: FlipProject): FlipProject => ({ ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }),

  setTrack: (trackId: string, patch: Partial<FlipTrack>) => (p: FlipProject) => mapTrack(p, trackId, (t) => ({ ...t, ...patch })),

  addClip: (trackId: string, clip: FlipClip) => (p: FlipProject) =>
    fit(mapTrack(p, trackId, (t) => ({ ...t, clips: [...t.clips, clip] })), clipEnd(clip)),

  setClip: (trackId: string, clipId: string, patch: Partial<FlipClip>) => (p: FlipProject) => {
    let end = 0;
    const out = mapTrack(p, trackId, (t) => ({
      ...t,
      clips: t.clips.map((c) => {
        if (c.id !== clipId) return c;
        const n = { ...c, ...patch };
        end = clipEnd(n);
        return n;
      }),
    }));
    return fit(out, end);
  },

  removeClip: (trackId: string, clipId: string) => (p: FlipProject) =>
    mapTrack(p, trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),

  /** Move a clip to another track (and position). */
  moveClip: (fromTrack: string, clipId: string, toTrack: string, atBeat: number) => (p: FlipProject) => {
    const clip = p.tracks.find((t) => t.id === fromTrack)?.clips.find((c) => c.id === clipId);
    if (!clip) return p;
    const moved = { ...clip, at_beat: Math.max(0, atBeat) };
    if (fromTrack === toTrack) return ops.setClip(fromTrack, clipId, { at_beat: moved.at_beat })(p);
    return ops.addClip(toTrack, moved)(ops.removeClip(fromTrack, clipId)(p));
  },

  /** Copy right after itself. */
  duplicateClip: (trackId: string, clipId: string) => (p: FlipProject) => {
    const clip = p.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
    if (!clip) return p;
    return ops.addClip(trackId, { ...clip, id: uid(), at_beat: clipEnd(clip) })(p);
  },

  replaceClip: (trackId: string, clipId: string, pieces: FlipClip[]) => (p: FlipProject) =>
    mapTrack(p, trackId, (t) => ({ ...t, clips: t.clips.flatMap((c) => (c.id === clipId ? pieces : [c])) })),
};

export function findClip(p: FlipProject | null, sel: Selection): { track: FlipTrack; clip: FlipClip } | null {
  if (!p || sel?.kind !== "clip") return null;
  const track = p.tracks.find((t) => t.id === sel.trackId);
  const clip = track?.clips.find((c) => c.id === sel.clipId);
  return track && clip ? { track, clip } : null;
}

export function findTrack(p: FlipProject | null, sel: Selection): FlipTrack | null {
  if (!p || !sel) return null;
  return p.tracks.find((t) => t.id === sel.trackId) ?? null;
}

/** Snap step in beats for the current setting (-1 = free). */
export function snapStep(p: FlipProject, snapIndex: number): number {
  const s = SNAPS[snapIndex]?.beats ?? 1;
  return s === 0 ? p.beats_per_bar : s;
}

export function snapBeat(beat: number, step: number): number {
  return step <= 0 ? Math.round(beat * 100) / 100 : Math.round(beat / step) * step;
}
