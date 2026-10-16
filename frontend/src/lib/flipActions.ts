// Flip actions that need the other stores (track, structure, stems).
import { api } from "./api";
import {
  SOURCE_STYLE, beatsBetween, chopAtTimes, chopEvery, clipEnd, newProject, normalizeProject, sourceGrid, trackFor, uid,
} from "./flip";
import { findClip, findPattern, ops, snapBeat, useFlipStore, type RecipeMessage } from "./flipStore";
import { useStemsStore } from "./stemsStore";
import { useTrackStore } from "./store";
import {
  defaultClip, type AiResult, type EditResponse, type FlipSource, type FlipTrack, type GenPart, type RecipeResponse,
} from "./types";

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

// ---- F10: generated instrumental ----

function requestParts(startBar: number, bars: number, parts: GenPart[], seed: number) {
  const s = flip();
  const track = useTrackStore.getState().track;
  if (!s.project || !track) throw new Error("Nessun progetto");
  const g = s.gen;
  return api.flipGenerate({
    track_id: track.track_id, project: s.project, style: g.style, harmony: g.harmony, mood: g.mood,
    parts, start_bar: startBar, bars, seed,
  });
}

/** Generate tracks with the panel's settings over [startBar, startBar+bars). */
export async function generateParts(startBar: number, bars: number): Promise<string> {
  const g = flip().gen;
  const res = await requestParts(startBar, bars, g.parts, g.seed);
  flip().edit(ops.mergeGenerated(res.tracks, res.chords));

  // The new beat replaces the original's drums / bass, if asked.
  if (g.muteOriginal) {
    for (const t of flip().project!.tracks) {
      if (t.kind !== "audio" || t.clips.length === 0 || t.mute) continue;
      const only = (src: FlipSource) => t.clips.every((c) => c.source === src);
      if ((g.parts.includes("drums") && only("drums")) || (g.parts.includes("bass") && only("bass"))) {
        flip().edit(ops.setTrack(t.id, { mute: true }));
      }
    }
  }
  return res.explanation;
}

export function partOf(track: FlipTrack): GenPart | null {
  if (track.kind === "drums") return "drums";
  if (track.kind === "bass") return "bass";
  if (track.kind === "keys") return track.name === "Arpeggio" ? "arp" : "chords";
  return null;
}

/** New take of the selected pattern only (next seed): same place, same
 * length, same sound; the rest of the track is untouched. */
export async function regenerateSelected(): Promise<string> {
  const s = flip();
  const found = findPattern(s.project, s.selection);
  if (!found || !s.project) throw new Error("Seleziona una clip generata");
  const part = partOf(found.track);
  if (!part) throw new Error("Traccia non generata");
  const bpb = s.project.beats_per_bar;
  const seed = s.gen.seed + 1;
  s.setGen({ seed });
  const startBar = Math.floor(found.clip.at_beat / bpb) + 1;
  const bars = Math.max(1, Math.ceil(found.clip.length_beats / bpb));
  const res = await requestParts(startBar, bars, [part], seed);
  const fresh = res.tracks[0]?.patterns[0];
  if (!fresh) throw new Error("Niente da generare");
  const { lanes, rolls, notes, pattern_beats, steps_per_beat, swing } = fresh;
  flip().edit(ops.setPattern(found.track.id, found.clip.id, { lanes, rolls, notes, pattern_beats, steps_per_beat, swing }));
  return res.explanation;
}

// ---- F11: AI FLIP (new recipe or edit of the current flip) ----

const fromRecipe = (r: RecipeResponse): AiResult => ({
  kind: "recipe", project: r.project, explanation: r.explanation, notes: r.notes, recipe: r.recipe,
  style: r.recipe.style, mood: r.recipe.mood, harmony: r.recipe.harmony,
});

const fromEdit = (r: EditResponse): AiResult => ({
  kind: "edit", project: r.project, explanation: r.explanation, notes: r.notes, applied: r.applied,
  style: r.style, mood: r.mood, harmony: r.harmony,
});

/** Put an answer's project on the timeline (one undo step). */
export function applyAi(m: RecipeMessage) {
  if (!m.res) return;
  const s = flip();
  const project = normalizeProject(m.res.project);
  s.edit(() => project);
  if (m.res.kind === "recipe") {
    s.select(null);
    s.setLoop(null);
    s.setPlayhead(0);
  }
  s.setActiveRecipe(m.id);
  // "Genera strumentale" / "rigenera" / the next edit continue in the same style.
  s.setGen({ style: m.res.style, harmony: m.res.harmony, mood: m.res.mood });
}

export type AiMode = "edit" | "recipe";

/** Prompt → answer(s). With variants, all start from the same project; the
 * first one is applied, the others wait for "ascolta questa". */
export async function askAi(prompt: string, variants: number, mode: AiMode) {
  const track = useTrackStore.getState().track;
  const s = flip();
  if (!track || !s.project || s.thinking) return;
  const before = s.project;
  const g = s.gen;
  s.setThinking(true);
  try {
    for (let k = 1; k <= variants; k++) {
      const seed = Math.floor(Math.random() * 1e6) + 1;
      const id = uid();
      const variation = variants > 1 ? k : null;
      try {
        const res = mode === "recipe"
          ? fromRecipe(await api.flipRecipe({ track_id: track.track_id, prompt, variation, seed }))
          : fromEdit(await api.flipEdit({
              track_id: track.track_id, project: before, prompt, style: g.style, mood: g.mood, harmony: g.harmony, variation, seed,
            }));
        const m: RecipeMessage = { id, prompt, res, seed, variant: variation ?? undefined };
        flip().pushRecipe(m);
        if (k === 1) applyAi(m);
      } catch (e) {
        flip().pushRecipe({ id, prompt, res: null, error: (e as Error).message, seed });
        break; // model down or bad answer: no point asking again
      }
    }
  } finally {
    flip().setThinking(false);
  }
}

/** Same recipe, next seed: another instrumental, same structure. No LLM. */
export async function rebuildRecipe(id: string) {
  const track = useTrackStore.getState().track;
  const m = flip().recipes.find((x) => x.id === id);
  if (!track || !m?.res?.recipe) return;
  const seed = m.seed + 1;
  const res = fromRecipe(await api.flipRecipeBuild({ track_id: track.track_id, recipe: m.res.recipe, seed, explanation: m.res.explanation }));
  flip().updateRecipe(id, { res, seed });
  applyAi({ ...m, res, seed });
}
