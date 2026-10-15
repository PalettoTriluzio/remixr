// Flip helpers (pure): beat grid of the original, project factory, chopping.
import type { AnalyzeResponse, FlipClip, FlipProject, FlipSource, FlipTrack, StructureResponse } from "./types";
import { defaultChain } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const SOURCE_STYLE: Record<FlipSource, { label: string; color: string }> = {
  vocals: { label: "Voce", color: "#ff5c7c" },
  drums: { label: "Batteria", color: "#ffb35c" },
  bass: { label: "Basso", color: "#5cffa1" },
  other: { label: "Altro", color: "#5cd4ff" },
  mix: { label: "Mix", color: "#b9a6ff" },
};

// ---- beat grid of the original ----

/** Beat times of the original: from /structure, else a straight grid at the analysed BPM. */
export function sourceGrid(structure: StructureResponse | null, analysis: AnalyzeResponse | null, duration: number): number[] {
  if (structure && structure.beats.length > 1) return structure.beats;
  const bpm = structure?.bpm || analysis?.bpm || 120;
  const step = 60 / bpm;
  const out: number[] = [];
  for (let t = 0; t <= duration; t += step) out.push(t);
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0.5;
}

function interval(beats: number[]): number {
  return median(beats.slice(1).map((b, i) => b - beats[i])) || 0.5;
}

/** Fractional beat index of `t` (seconds) on the grid, extrapolated past the edges. */
export function beatPos(t: number, beats: number[]): number {
  if (beats.length < 2) return t / 0.5;
  const step = interval(beats);
  if (t <= beats[0]) return (t - beats[0]) / step;
  const last = beats.length - 1;
  if (t >= beats[last]) return last + (t - beats[last]) / step;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - beats[lo]) / (beats[lo + 1] - beats[lo]);
}

/** Inverse of beatPos. */
export function timeAt(pos: number, beats: number[]): number {
  if (beats.length < 2) return pos * 0.5;
  const step = interval(beats);
  const last = beats.length - 1;
  if (pos <= 0) return beats[0] + pos * step;
  if (pos >= last) return beats[last] + (pos - last) * step;
  const i = Math.floor(pos);
  return beats[i] + (pos - i) * (beats[i + 1] - beats[i]);
}

/** Beats of the original between two times; snapped to whole beats when close. */
export function beatsBetween(a: number, b: number, beats: number[]): number {
  const n = beatPos(b, beats) - beatPos(a, beats);
  const r = Math.round(n);
  return Math.max(0.25, Math.abs(n - r) < 0.15 && r > 0 ? r : Math.round(n * 4) / 4);
}

// ---- project ----

const track = (name: string, follow_key = true): FlipTrack => ({
  id: uid(), name, gain_db: 0, pan: 0, mute: false, solo: false, follow_key, chain: defaultChain(), clips: [],
});

export function newProject(structure: StructureResponse | null, analysis: AnalyzeResponse | null, hasStems: boolean): FlipProject {
  return {
    bpm: Math.round(structure?.bpm || analysis?.bpm || 120),
    bars: 16,
    beats_per_bar: structure?.beats_per_bar ?? 4,
    source_key: structure?.key || analysis?.key || "C major",
    transpose: 0,
    tracks: hasStems
      ? [track("Voce"), track("Batteria", false), track("Basso"), track("Altro")]
      : [track("Campione")],
  };
}

export function newTrack(name: string, followKey = true): FlipTrack {
  return track(name, followKey);
}

/** Track a new clip of `source` goes to: the one already holding that source, else by name. */
export function trackFor(project: FlipProject, source: FlipSource): FlipTrack | undefined {
  return project.tracks.find((t) => t.clips.some((c) => c.source === source))
    ?? project.tracks.find((t) => t.name === SOURCE_STYLE[source].label && t.clips.length === 0);
}

export const clipEnd = (c: FlipClip) => c.at_beat + c.length_beats;

export const projectBeats = (p: FlipProject) => p.bars * p.beats_per_bar;

/** Last beat used by any clip. */
export const contentEnd = (p: FlipProject) =>
  Math.max(0, ...p.tracks.flatMap((t) => t.clips.map(clipEnd)));

// ---- chopping ----

/** Split a clip at positions (in beats of the original, relative to the
 * slice start). Pieces keep their place on the timeline; a loop is
 * chopped over one cycle. */
function splitAt(clip: FlipClip, cuts: number[], beats: number[]): FlipClip[] {
  const p0 = beatPos(clip.src_start, beats);
  const span = clip.src_beats;
  const points = [0, ...cuts.filter((c) => c > 0.05 && c < span - 0.05).sort((a, b) => a - b), span];
  if (points.length <= 2) return [clip];
  const scale = clip.loop ? 1 : clip.length_beats / span;
  const pieces: FlipClip[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // Reversed: the end of the slice plays first.
    const at = clip.reverse ? clip.at_beat + (span - b) * scale : clip.at_beat + a * scale;
    pieces.push({
      ...clip,
      id: uid(),
      loop: false,
      src_start: i === 0 ? clip.src_start : timeAt(p0 + a, beats),
      src_end: i === points.length - 2 ? clip.src_end : timeAt(p0 + b, beats),
      src_beats: b - a,
      at_beat: at,
      length_beats: (b - a) * scale,
    });
  }
  return pieces.sort((x, y) => x.at_beat - y.at_beat);
}

/** Chop every `every` beats of the original (4 = bars, 1 = beats, 0.5 = eighths). */
export function chopEvery(clip: FlipClip, every: number, beats: number[]): FlipClip[] {
  const cuts: number[] = [];
  for (let c = every; c < clip.src_beats; c += every) cuts.push(c);
  return splitAt(clip, cuts, beats);
}

/** Chop at transients (seconds in the original). */
export function chopAtTimes(clip: FlipClip, times: number[], beats: number[]): FlipClip[] {
  const p0 = beatPos(clip.src_start, beats);
  return splitAt(clip, times.map((t) => beatPos(t, beats) - p0), beats);
}

// ---- display ----

export function barBeatLabel(beat: number, beatsPerBar: number): string {
  const bar = Math.floor(beat / beatsPerBar) + 1;
  const b = Math.floor(beat % beatsPerBar) + 1;
  return `${bar}.${b}`;
}
