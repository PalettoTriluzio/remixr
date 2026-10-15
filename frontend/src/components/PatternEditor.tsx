// Editor under the timeline for the selected generated clip (one cycle).
//   drums: step grid — click = on/off · Shift+click = velocity · right click = roll
//   notes: piano roll — click empty = add note · click note = remove
import { useMemo, useState, type MouseEvent } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { KIND_STYLE, noteName } from "../lib/flip";
import { findPattern, ops, useFlipStore } from "../lib/flipStore";
import { DRUM_VOICES, type DrumVoice, type FlipTrack, type Note, type PatternClip } from "../lib/types";

const VOICE_LABEL: Record<DrumVoice, string> = {
  kick: "Cassa", snare: "Rullante", clap: "Clap", hat: "Hi-hat", open_hat: "Open hat", rim: "Rim", perc: "Perc",
};
const VELS = [0.85, 0.5, 0.25, 1.0];
const ROLLS = [1, 2, 3, 4, 6];

export function PatternEditor() {
  const project = useFlipStore((s) => s.project);
  const selection = useFlipStore((s) => s.selection);
  const select = useFlipStore((s) => s.select);
  const found = findPattern(project, selection);
  if (!found || !project) return null;
  const { track, clip } = found;

  return (
    <div className="h-64 shrink-0 border-t border-line bg-bg-panel flex flex-col">
      <div className="h-8 shrink-0 px-3 flex items-center gap-3 text-xs font-mono border-b border-line">
        <span className="w-2 h-2 rounded-full" style={{ background: KIND_STYLE[track.kind].color }} />
        <span className="text-white/80">{track.name}</span>
        <span className="text-white/35">
          ciclo di {clip.pattern_beats} beat ({+(clip.pattern_beats / project.beats_per_bar).toFixed(2)} battute), ripetuto per {clip.length_beats} beat
        </span>
        <CycleControls track={track} clip={clip} bpb={project.beats_per_bar} />
        <div className="flex-1" />
        <span className="text-white/30">
          {track.kind === "drums" ? "clic = on/off · Shift+clic = intensità · tasto destro = roll" : "clic su vuoto = nota · clic su nota = toglie"}
        </span>
        <button onClick={() => select({ kind: "track", trackId: track.id })} className="w-6 h-6 rounded hover:bg-bg-hover flex items-center justify-center text-white/40" title="Chiudi editor">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {track.kind === "drums"
          ? <DrumGrid track={track} clip={clip} bpb={project.beats_per_bar} />
          : <PianoRoll track={track} clip={clip} bpb={project.beats_per_bar} />}
      </div>
    </div>
  );
}

/** Cycle length: halve (drop the second half) or double (repeat it). */
function CycleControls({ track, clip, bpb }: { track: FlipTrack; clip: PatternClip; bpb: number }) {
  const edit = useFlipStore((s) => s.edit);
  const resize = (beats: number) => {
    if (beats < 1 || beats > 256) return;
    const steps = Math.round(beats * clip.steps_per_beat);
    const fitLane = (xs: number[] = []) => Array.from({ length: steps }, (_, i) => xs.length ? xs[i % xs.length] ?? 0 : 0);
    const lanes = Object.fromEntries(Object.entries(clip.lanes).map(([v, xs]) => [v, fitLane(xs)]));
    const rolls = Object.fromEntries(Object.entries(clip.rolls).map(([v, xs]) => [v, fitLane(xs)]));
    const notes = beats > clip.pattern_beats
      ? [...clip.notes, ...clip.notes.map((n) => ({ ...n, start: n.start + clip.pattern_beats }))].filter((n) => n.start < beats)
      : clip.notes.filter((n) => n.start < beats);
    edit(ops.setPattern(track.id, clip.id, { pattern_beats: beats, lanes, rolls, notes }));
  };
  return (
    <span className="flex items-center gap-1">
      <button onClick={() => resize(clip.pattern_beats / 2)} className="px-1.5 h-5 rounded bg-bg-card hover:bg-bg-hover text-white/60" title="Ciclo a metà">÷2</button>
      <button onClick={() => resize(clip.pattern_beats * 2)} className="px-1.5 h-5 rounded bg-bg-card hover:bg-bg-hover text-white/60" title="Ciclo doppio (copiato), per variare la seconda metà">×2</button>
      {clip.pattern_beats < bpb && <span className="text-white/30">(meno di una battuta)</span>}
    </span>
  );
}

// ---------------------------------------------------------------- drums

function DrumGrid({ track, clip, bpb }: { track: FlipTrack; clip: PatternClip; bpb: number }) {
  const edit = useFlipStore((s) => s.edit);
  const steps = Math.round(clip.pattern_beats * clip.steps_per_beat);
  const cell = clip.steps_per_beat > 4 ? 12 : 18;

  const lane = (v: DrumVoice) => Array.from({ length: steps }, (_, i) => clip.lanes[v]?.[i] ?? 0);
  const roll = (v: DrumVoice) => Array.from({ length: steps }, (_, i) => clip.rolls[v]?.[i] ?? 0);

  const setStep = (v: DrumVoice, i: number, e: MouseEvent) => {
    e.preventDefault();
    const vel = lane(v);
    const rl = roll(v);
    if (e.type === "contextmenu") {
      if (vel[i] <= 0) return;
      const next = ROLLS[(ROLLS.indexOf(rl[i] > 1 ? rl[i] : 1) + 1) % ROLLS.length];
      rl[i] = next;
      edit(ops.setPattern(track.id, clip.id, { rolls: { ...clip.rolls, [v]: rl } }));
      return;
    }
    if (e.shiftKey && vel[i] > 0) {
      const k = VELS.findIndex((x) => Math.abs(x - vel[i]) < 0.08);
      vel[i] = VELS[(k + 1) % VELS.length];
    } else {
      vel[i] = vel[i] > 0 ? 0 : 0.85;
      if (vel[i] === 0) rl[i] = 0;
    }
    edit(ops.setPattern(track.id, clip.id, { lanes: { ...clip.lanes, [v]: vel }, rolls: { ...clip.rolls, [v]: rl } }));
  };

  return (
    <div className="p-2 inline-block min-w-full">
      {DRUM_VOICES.map((v) => {
        const vel = lane(v);
        const rl = roll(v);
        return (
          <div key={v} className="flex items-center h-6">
            <span className="w-20 shrink-0 text-[10px] font-mono text-white/50 sticky left-0 bg-bg-panel z-10">{VOICE_LABEL[v]}</span>
            {vel.map((x, i) => {
              const beatStart = i % clip.steps_per_beat === 0;
              const barStart = i % (clip.steps_per_beat * bpb) === 0;
              return (
                <button
                  key={i}
                  onClick={(e) => setStep(v, i, e)}
                  onContextMenu={(e) => setStep(v, i, e)}
                  className={clsx(
                    "h-5 shrink-0 rounded-[2px] text-[8px] font-mono leading-5 text-black/70",
                    barStart ? "ml-1.5" : beatStart ? "ml-1" : "ml-px",
                    x > 0 ? "" : Math.floor(i / clip.steps_per_beat) % 2 ? "bg-white/[0.06] hover:bg-white/20" : "bg-white/[0.11] hover:bg-white/25",
                  )}
                  style={{ width: cell, ...(x > 0 ? { background: KIND_STYLE.drums.color, opacity: 0.3 + 0.7 * x } : {}) }}
                  title={x > 0 ? `intensità ${Math.round(x * 100)}%${rl[i] > 1 ? ` · roll ×${rl[i]}` : ""}` : undefined}
                >
                  {x > 0 && rl[i] > 1 ? rl[i] : ""}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- notes

const ROW = 10;
const COL = 14; // px per 1/4 beat
const LENGTHS: Array<[number, string]> = [[0.25, "1/16"], [0.5, "1/8"], [1, "1/4"], [2, "1/2"], [4, "1"]];

function PianoRoll({ track, clip, bpb }: { track: FlipTrack; clip: PatternClip; bpb: number }) {
  const edit = useFlipStore((s) => s.edit);
  const [len, setLen] = useState(track.kind === "bass" ? 1 : 2);
  const [lo, hi] = useMemo(() => {
    if (!clip.notes.length) return track.kind === "bass" ? [24, 52] : [52, 84];
    const ps = clip.notes.map((n) => n.pitch);
    const a = Math.max(12, Math.min(...ps) - 5);
    const b = Math.min(115, Math.max(...ps) + 5);
    return b - a < 24 ? [a, a + 24] : [a, b];
  }, [clip.notes, track.kind]);
  const pitches = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
  const cols = Math.round(clip.pattern_beats * 4);
  const width = cols * COL;

  const add = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const start = Math.floor((e.clientX - r.left) / COL) / 4;
    const pitch = hi - Math.floor((e.clientY - r.top) / ROW);
    if (start >= clip.pattern_beats || pitch < lo || pitch > hi) return;
    const note: Note = { start, length: Math.min(len, clip.pattern_beats - start), pitch, vel: 0.8 };
    edit(ops.setPattern(track.id, clip.id, { notes: [...clip.notes, note] }));
  };
  const remove = (i: number) => edit(ops.setPattern(track.id, clip.id, { notes: clip.notes.filter((_, k) => k !== i) }));

  return (
    <div className="flex">
      <div className="sticky left-0 z-10 bg-bg-panel shrink-0 w-14">
        <div className="h-6 flex items-center gap-0.5 px-1">
          <select value={len} onChange={(e) => setLen(Number(e.target.value))} className="w-full bg-bg-card border border-line rounded text-[10px] h-5" title="Lunghezza delle note nuove">
            {LENGTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {pitches.map((p) => (
          <div key={p} className={clsx("text-[8px] font-mono pl-1 border-b border-black/30", [1, 3, 6, 8, 10].includes(p % 12) ? "bg-black/40 text-white/30" : "bg-white/[0.06] text-white/50")} style={{ height: ROW, lineHeight: `${ROW}px` }}>
            {p % 12 === 0 ? noteName(p) : ""}
          </div>
        ))}
      </div>
      <div>
        <div className="h-6" />
        <div
          className="relative cursor-crosshair"
          style={{
            width, height: pitches.length * ROW,
            backgroundImage:
              `linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px),` +
              `linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),` +
              `linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)`,
            backgroundSize: `${COL * 4 * bpb}px 100%, ${COL * 4}px 100%, 100% ${ROW}px`,
          }}
          onClick={add}
        >
          {clip.notes.map((n, i) => (
            n.start < clip.pattern_beats && n.pitch >= lo && n.pitch <= hi && (
              <div
                key={i}
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                className="absolute rounded-[2px] border border-black/40 hover:brightness-125 cursor-pointer"
                style={{
                  left: n.start * 4 * COL,
                  top: (hi - n.pitch) * ROW,
                  width: Math.max(4, n.length * 4 * COL - 1),
                  height: ROW - 1,
                  background: KIND_STYLE[track.kind].color,
                  opacity: 0.45 + 0.55 * n.vel,
                }}
                title={`${noteName(n.pitch)} · ${n.length} beat`}
              />
            )
          ))}
        </div>
      </div>
    </div>
  );
}
