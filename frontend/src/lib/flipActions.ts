// Flip actions that need the other stores (track, structure, stems).
import { api } from "./api";
import {
  SOURCE_STYLE, beatsBetween, chopAtTimes, chopEvery, clipEnd, newProject, sourceGrid, trackFor, uid,
} from "./flip";
import { findClip, ops, snapBeat, useFlipStore } from "./flipStore";
import { useStemsStore } from "./stemsStore";
import { useTrackStore } from "./store";
import { defaultClip, type FlipSource } from "./types";

const flip = () => useFlipStore.getState();

function grid(): number[] {
  const { track, analysis } = useTrackStore.getState();
  return sourceGrid(useStemsStore.getState().structure, analysis, track?.duration_sec ?? 0);
}

/** Open flip view, creating a project for the current song if needed. */
export function enterFlip() {
  const { track, analysis } = useTrackStore.getState();
  if (!track) return;
  const s = flip();
  if (!s.project || s.trackId !== track.track_id) {
    const { structure, job } = useStemsStore.getState();
    s.setProject(track.track_id, newProject(structure, analysis, job?.status === "done"));
  }
  s.setView("flip");
}

/** The selected slice of the original (region) → new clip at the playhead,
 * on the track for that source. The playhead moves to its end, so slices
 * added one after another line up. */
export function addFromRegion(source: FlipSource, region: { start: number; end: number }) {
  const s = flip();
  if (!s.project) return;
  const srcBeats = beatsBetween(region.start, region.end, grid());

  let target = trackFor(s.project, source);
  if (!target) {
    s.edit(ops.addTrack(SOURCE_STYLE[source].label, source !== "drums"));
    const tracks = flip().project!.tracks;
    target = tracks[tracks.length - 1];
  }
  const at = snapBeat(s.playhead, 1);
  const clip = defaultClip({
    id: uid(), source, src_start: region.start, src_end: region.end,
    src_beats: srcBeats, at_beat: at, length_beats: srcBeats,
  });
  flip().edit(ops.addClip(target.id, clip));
  flip().select({ kind: "clip", trackId: target.id, clipId: clip.id });
  flip().setPlayhead(clipEnd(clip));
}

/** Quick start: the chorus (first 8 bars of the most "ritornello" section),
 * voice + drums looped at the start of the project. */
export function starterFromChorus(): string | null {
  const { structure, job } = useStemsStore.getState();
  const s = flip();
  if (!s.project) return "Nessun progetto";
  if (!structure || structure.sections.length === 0) return "Struttura non ancora pronta";
  const sec = structure.sections.find((x) => x.name === "ritornello")
    ?? [...structure.sections].sort((a, b) => b.energy - a.energy)[0];
  const bars = Math.min(8, sec.bar_end - sec.bar_start);
  const db = structure.downbeats;
  const start = db[sec.bar_start - 1] ?? sec.start;
  const end = db[sec.bar_start - 1 + bars] ?? sec.end;
  const sources: FlipSource[] = job?.status === "done" ? ["vocals", "drums"] : ["mix"];

  s.setPlayhead(0);
  for (const src of sources) {
    addFromRegion(src, { start, end });
    const sel = flip().selection;
    if (sel?.kind === "clip") {
      const len = flip().project!.tracks.find((t) => t.id === sel.trackId)!.clips.find((c) => c.id === sel.clipId)!.src_beats;
      // Twice through, looped.
      flip().edit(ops.setClip(sel.trackId, sel.clipId, { at_beat: 0, loop: true, length_beats: len * 2 }));
    }
    flip().setPlayhead(0);
  }
  return null;
}

export type ChopMode = "bar" | "half" | "beat" | "eighth" | "onsets";

/** Replace the selected clip with its pieces. */
export async function chopSelected(mode: ChopMode): Promise<string | null> {
  const s = flip();
  const found = findClip(s.project, s.selection);
  const track = useTrackStore.getState().track;
  if (!found || !track) return null;
  const { clip } = found;
  const g = grid();
  let pieces;
  if (mode === "onsets") {
    try {
      const { times } = await api.flipOnsets(track.track_id, clip.source, clip.src_start, clip.src_end);
      if (times.length === 0) return "Nessun transiente trovato";
      pieces = chopAtTimes(clip, times, g);
    } catch (e) {
      return (e as Error).message;
    }
  } else {
    const bpb = s.project!.beats_per_bar;
    const every = { bar: bpb, half: bpb / 2, beat: 1, eighth: 0.5 }[mode];
    pieces = chopEvery(clip, every, g);
  }
  if (pieces.length <= 1) return "Clip troppo corta per questo taglio";
  flip().edit(ops.replaceClip(found.track.id, clip.id, pieces));
  flip().select({ kind: "clip", trackId: found.track.id, clipId: pieces[0].id });
  return null;
}
