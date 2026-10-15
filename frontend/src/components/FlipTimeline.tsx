// Arrangement timeline: tracks × beats. Clips are slices of the original.
//   drag a clip = move (also to another track) · Alt+drag = copy
//   drag its right edge = length · click the ruler = playhead · drag the ruler = loop range
//   Ctrl+wheel = zoom
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject, type WheelEvent } from "react";
import clsx from "clsx";
import {
  AlertCircle, Loader2, Minus, Music, Plus, Repeat, Sparkles, Trash2, ZoomIn, ZoomOut,
} from "lucide-react";
import { KIND_STYLE, SOURCE_STYLE, projectBeats, uid } from "../lib/flip";
import { starterFromChorus } from "../lib/flipActions";
import { flipPlayer } from "../lib/flipPlayer";
import { SNAPS, ops, snapBeat, snapStep, useFlipStore } from "../lib/flipStore";
import { useTrackStore } from "../lib/store";
import { transposeChord, transposeKey } from "../lib/keys";
import { DRUM_VOICES, type FlipClip, type FlipProject, type FlipTrack, type PatternClip } from "../lib/types";
import { ClipWave } from "./ClipWave";
import { GenerateButton } from "./GeneratePanel";
import { PatternEditor } from "./PatternEditor";

const HEADER = 176; // px, track header column
const ROW_H = 64;
const RULER_H = 24;
const CHORD_H = 18;

export function FlipTimeline() {
  const project = useFlipStore((s) => s.project);
  const zoom = useFlipStore((s) => s.zoom);
  const setZoom = useFlipStore((s) => s.setZoom);
  const editing = useFlipStore((s) => s.selection?.kind === "pattern");
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!project) return <section className="flex-1 bg-bg" />;

  const total = projectBeats(project);
  const empty = project.tracks.every((t) => t.clips.length === 0 && t.patterns.length === 0);
  const headH = RULER_H + (project.chords.length ? CHORD_H : 0);

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  return (
    <section className="flex-1 flex flex-col bg-bg min-w-0">
      <Toolbar project={project} />
      <div ref={scrollRef} className="flex-1 overflow-auto relative" onWheel={onWheel}>
        <div className="relative" style={{ width: HEADER + total * zoom, minWidth: "100%" }}>
          <Ruler project={project} />
          {project.tracks.map((t, i) => <TrackRow key={t.id} project={project} track={t} index={i} />)}
          <LoopShade project={project} headH={headH} />
          <Playhead scrollRef={scrollRef} height={headH + project.tracks.length * ROW_H} />
          {empty && <EmptyHint top={headH} />}
        </div>
      </div>
      {editing && <PatternEditor />}
    </section>
  );
}

// ---------------------------------------------------------------- toolbar

function Toolbar({ project }: { project: FlipProject }) {
  const edit = useFlipStore((s) => s.edit);
  const zoom = useFlipStore((s) => s.zoom);
  const setZoom = useFlipStore((s) => s.setZoom);
  const snap = useFlipStore((s) => s.snap);
  const setSnap = useFlipStore((s) => s.setSnap);
  const status = useFlipStore((s) => s.status);
  const error = useFlipStore((s) => s.error);

  return (
    <div className="h-9 shrink-0 border-b border-line bg-bg-panel px-3 flex items-center gap-3 text-xs font-mono">
      <span className="tracking-wider text-accent-hot">FLIP</span>

      <NumberField
        label="BPM" value={project.bpm} min={40} max={240} step={1}
        onChange={(v) => edit(ops.setProjectField("bpm", v), "bpm")}
        title="Tempo del progetto: le clip in warp lo seguono senza cambiare intonazione"
      />
      <label className="flex items-center gap-1" title="Trasposizione in semitoni delle tracce con ♪ attivo">
        <span className="text-white/40">TONALITÀ</span>
        <button className="w-5 h-5 rounded hover:bg-bg-hover" onClick={() => edit(ops.setProjectField("transpose", Math.max(-12, project.transpose - 1)))}><Minus className="w-3 h-3 mx-auto" /></button>
        <span className="w-24 text-center text-white/80">
          {transposeKey(project.source_key, project.transpose)}
          {project.transpose !== 0 && <span className="text-accent"> {project.transpose > 0 ? "+" : ""}{project.transpose}</span>}
        </span>
        <button className="w-5 h-5 rounded hover:bg-bg-hover" onClick={() => edit(ops.setProjectField("transpose", Math.min(12, project.transpose + 1)))}><Plus className="w-3 h-3 mx-auto" /></button>
      </label>
      <NumberField
        label="BATTUTE" value={project.bars} min={1} max={256} step={1}
        onChange={(v) => edit(ops.setProjectField("bars", v), "bars")}
      />
      <label className="flex items-center gap-1" title="Griglia per spostare e allungare le clip">
        <span className="text-white/40">GRIGLIA</span>
        <select
          value={snap}
          onChange={(e) => setSnap(Number(e.target.value))}
          className="bg-bg-card border border-line rounded px-1 h-6"
        >
          {SNAPS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
        </select>
      </label>
      <div className="flex items-center">
        <button onClick={() => setZoom(zoom / 1.3)} className="w-6 h-6 rounded hover:bg-bg-hover" title="Zoom − (Ctrl+rotella)"><ZoomOut className="w-3.5 h-3.5 mx-auto" /></button>
        <button onClick={() => setZoom(zoom * 1.3)} className="w-6 h-6 rounded hover:bg-bg-hover" title="Zoom +"><ZoomIn className="w-3.5 h-3.5 mx-auto" /></button>
      </div>
      <button
        onClick={() => edit(ops.addTrack(`Traccia ${project.tracks.length + 1}`))}
        disabled={project.tracks.length >= 16}
        className="flex items-center gap-1 px-2 h-6 rounded bg-bg-card hover:bg-bg-hover disabled:opacity-30"
      >
        <Plus className="w-3 h-3" /> traccia
      </button>
      <GenerateButton />

      <div className="flex-1" />
      {status === "rendering" && <span className="flex items-center gap-1 text-white/40"><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> rendering…</span>}
      {status === "error" && (
        <span className="flex items-center gap-1 text-accent-hot truncate max-w-[40%]" title={error ?? ""}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </span>
      )}
    </div>
  );
}

function NumberField(props: {
  label: string; value: number; min: number; max: number; step: number; title?: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v)) props.onChange(Math.min(props.max, Math.max(props.min, v)));
    else setText(String(props.value));
  };
  return (
    <label className="flex items-center gap-1" title={props.title}>
      <span className="text-white/40">{props.label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-12 h-6 bg-bg-card border border-line rounded px-1 text-center"
      />
    </label>
  );
}

// ---------------------------------------------------------------- ruler

function Ruler({ project }: { project: FlipProject }) {
  const zoom = useFlipStore((s) => s.zoom);
  const setLoop = useFlipStore((s) => s.setLoop);
  const bpb = project.beats_per_bar;
  const every = zoom * bpb < 28 ? 4 : 1;

  const beatAt = (e: { clientX: number }, el: HTMLElement) =>
    Math.max(0, (e.clientX - el.getBoundingClientRect().left) / zoom);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const from = beatAt(e, el);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const to = beatAt(ev, el);
      if (Math.abs(to - from) * zoom < 4) return;
      moved = true;
      const a = Math.floor(Math.min(from, to) / bpb) * bpb;
      const b = Math.ceil(Math.max(from, to) / bpb) * bpb;
      setLoop({ start: a, end: Math.max(b, a + bpb) });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      if (!moved) flipPlayer.seek(snapBeat(from, 1));
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <div className="sticky top-0 z-20 bg-bg-panel border-b border-line">
      <div className="flex" style={{ height: RULER_H }}>
        <div className="sticky left-0 z-10 shrink-0 bg-bg-panel border-r border-line text-[9px] font-mono text-white/30 flex items-center px-2" style={{ width: HEADER }}>
          clic = posizione · trascina = loop
        </div>
        <div className="relative flex-1 cursor-pointer" onPointerDown={onPointerDown}>
          {Array.from({ length: project.bars }, (_, i) => i).filter((i) => i % every === 0).map((i) => (
            <span key={i} className="absolute top-0 bottom-0 border-l border-white/15 pl-1 text-[10px] font-mono text-white/45 leading-6" style={{ left: i * bpb * zoom }}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
      {project.chords.length > 0 && (
        <div className="flex border-t border-line/60" style={{ height: CHORD_H }}>
          <div className="sticky left-0 z-10 shrink-0 bg-bg-panel border-r border-line text-[9px] font-mono text-white/30 flex items-center px-2" style={{ width: HEADER }}>
            ACCORDI {project.transpose !== 0 && `(${project.transpose > 0 ? "+" : ""}${project.transpose})`}
          </div>
          <div className="relative flex-1">
            {project.chords.map((c, i) => (
              <span
                key={i}
                className="absolute top-0 bottom-0 border-l border-accent/40 pl-1 text-[10px] font-mono text-accent/90 overflow-hidden whitespace-nowrap"
                style={{ left: c.start * zoom, width: (c.end - c.start) * zoom, lineHeight: `${CHORD_H}px` }}
              >
                {transposeChord(c.name, project.transpose)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoopShade({ project, headH }: { project: FlipProject; headH: number }) {
  const loop = useFlipStore((s) => s.loop);
  const loopOn = useFlipStore((s) => s.loopOn);
  const zoom = useFlipStore((s) => s.zoom);
  if (!loop) return null;
  return (
    <div
      className={clsx("absolute top-0 pointer-events-none border-x", loopOn ? "bg-accent/10 border-accent/60" : "bg-white/[0.03] border-white/20")}
      style={{ left: HEADER + loop.start * zoom, width: (loop.end - loop.start) * zoom, height: headH + project.tracks.length * ROW_H }}
    >
      <Repeat className={clsx("w-3 h-3 m-1", loopOn ? "text-accent" : "text-white/30")} />
    </div>
  );
}

function Playhead({ scrollRef, height }: { scrollRef: RefObject<HTMLDivElement>; height: number }) {
  const playhead = useFlipStore((s) => s.playhead);
  const zoom = useFlipStore((s) => s.zoom);
  const x = HEADER + playhead * zoom;

  // Follow while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !flipPlayer.isPlaying()) return;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEADER) el.scrollLeft = x - HEADER - 40;
  }, [x, scrollRef]);

  return (
    <div
      className="absolute top-0 w-px bg-white z-30 pointer-events-none shadow-[0_0_6px_rgba(255,255,255,0.6)]"
      style={{ left: x, height }}
    />
  );
}

function EmptyHint({ top }: { top: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: top + 24, paddingLeft: HEADER }}>
      <div className="pointer-events-auto max-w-md text-center bg-bg-panel/95 border border-line rounded-lg px-5 py-4 space-y-2">
        <p className="text-sm text-white/80">Costruisci il flip con pezzi della canzone</p>
        <p className="text-xs text-white/45">
          Seleziona una parte sulla waveform in alto (trascina, o clicca una sezione) e premi
          <b className="text-white/70"> Voce / Batteria / Basso / Altro / Mix</b>: diventa una clip qui, al tempo del progetto.
        </p>
        <button
          onClick={() => setMsg(starterFromChorus())}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded bg-accent/25 hover:bg-accent/40 text-sm"
        >
          <Sparkles className="w-3.5 h-3.5" /> Parti dal ritornello
        </button>
        {msg && <p className="text-xs text-accent-hot">{msg}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tracks

function TrackRow({ project, track, index }: { project: FlipProject; track: FlipTrack; index: number }) {
  const zoom = useFlipStore((s) => s.zoom);
  const selection = useFlipStore((s) => s.selection);
  const select = useFlipStore((s) => s.select);
  const total = projectBeats(project);
  const bar = project.beats_per_bar * zoom;
  const trackSelected = selection?.trackId === track.id;

  return (
    <div className="flex border-b border-line/70" style={{ height: ROW_H }}>
      <TrackHeader track={track} selected={trackSelected} />
      <div
        className="relative shrink-0"
        style={{
          width: total * zoom,
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.09) 1px, transparent 1px)," +
            "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: `${bar}px 100%, ${zoom}px 100%`,
        }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) select({ kind: "track", trackId: track.id }); }}
      >
        {track.kind === "audio"
          ? track.clips.map((c) => <ClipBlock key={c.id} project={project} track={track} index={index} clip={c} />)
          : track.patterns.map((c) => <PatternBlock key={c.id} project={project} track={track} index={index} clip={c} />)}
      </div>
    </div>
  );
}

function TrackHeader({ track, selected }: { track: FlipTrack; selected: boolean }) {
  const edit = useFlipStore((s) => s.edit);
  const select = useFlipStore((s) => s.select);
  const set = (patch: Partial<FlipTrack>, gesture?: string) => edit(ops.setTrack(track.id, patch), gesture);

  return (
    <div
      className={clsx(
        "sticky left-0 z-10 shrink-0 border-r border-line px-2 py-1 flex flex-col gap-1",
        selected ? "bg-bg-hover" : "bg-bg-panel",
      )}
      style={{ width: HEADER }}
      onPointerDown={() => select({ kind: "track", trackId: track.id })}
    >
      <div className="flex items-center gap-1">
        {track.kind !== "audio" && (
          <span className="w-1.5 h-4 rounded-sm shrink-0" style={{ background: KIND_STYLE[track.kind].color }} title={`Generata: ${KIND_STYLE[track.kind].label}`} />
        )}
        <input
          value={track.name}
          onChange={(e) => set({ name: e.target.value.slice(0, 40) }, `name-${track.id}`)}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium focus:bg-bg-card rounded px-1"
        />
        <Small on={track.mute} onClick={() => set({ mute: !track.mute })} title="Muto" cls="bg-accent-hot/70">M</Small>
        <Small on={track.solo} onClick={() => set({ solo: !track.solo })} title="Solo" cls="bg-yellow-500/70">S</Small>
        <button
          onClick={() => set({ follow_key: !track.follow_key })}
          title={track.follow_key ? "Segue la tonalità del progetto" : "Non trasposta (es. batteria)"}
          className={clsx("w-5 h-5 rounded flex items-center justify-center", track.follow_key ? "text-accent" : "text-white/25 hover:text-white")}
        >
          <Music className="w-3 h-3" />
        </button>
        <button
          onClick={() => edit(ops.removeTrack(track.id))}
          title="Elimina traccia (Ctrl+Z per annullare)"
          className="w-5 h-5 rounded flex items-center justify-center text-white/25 hover:text-accent-hot"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <label className="flex items-center gap-1 text-[9px] font-mono text-white/40" title="Volume (doppio clic = 0 dB)">
        VOL
        <input
          type="range" min={-60} max={12} step={0.5} value={track.gain_db}
          onChange={(e) => set({ gain_db: Number(e.target.value) }, `gain-${track.id}`)}
          onDoubleClick={() => set({ gain_db: 0 })}
          className="flex-1 min-w-0 h-1 accent-[#7c5cff]"
        />
        <span className="w-8 text-right">{track.gain_db <= -60 ? "-∞" : track.gain_db.toFixed(1)}</span>
      </label>
      <label className="flex items-center gap-1 text-[9px] font-mono text-white/40" title="Panorama (doppio clic = centro)">
        PAN
        <input
          type="range" min={-1} max={1} step={0.05} value={track.pan}
          onChange={(e) => set({ pan: Number(e.target.value) }, `pan-${track.id}`)}
          onDoubleClick={() => set({ pan: 0 })}
          className="flex-1 min-w-0 h-1 accent-[#7c5cff]"
        />
        <span className="w-8 text-right">{track.pan === 0 ? "C" : `${track.pan < 0 ? "L" : "R"}${Math.round(Math.abs(track.pan) * 100)}`}</span>
      </label>
    </div>
  );
}

function Small(props: { on: boolean; onClick: () => void; title: string; cls: string; children: string }) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      className={clsx(
        "w-5 h-5 rounded text-[10px] font-mono font-semibold",
        props.on ? clsx(props.cls, "text-white") : "bg-bg-hover text-white/40 hover:text-white",
      )}
    >
      {props.children}
    </button>
  );
}

// ---------------------------------------------------------------- clips

/** Pointer drag in beats/rows from the press point. */
function beginDrag(e: RPointerEvent<HTMLElement>, zoom: number, onMove: (dBeats: number, dRows: number) => void) {
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  const x0 = e.clientX;
  const y0 = e.clientY;
  const move = (ev: PointerEvent) => onMove((ev.clientX - x0) / zoom, Math.round((ev.clientY - y0) / ROW_H));
  const up = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
}

/** Row index → track, only if it has the given kind; otherwise stay. */
function targetTrack(p: FlipProject, index: number, dRows: number, current: string, kind: FlipTrack["kind"]): string {
  const t = p.tracks[Math.min(p.tracks.length - 1, Math.max(0, index + dRows))];
  return t && t.kind === kind ? t.id : current;
}

function ClipBlock({ project, track, index, clip }: { project: FlipProject; track: FlipTrack; index: number; clip: FlipClip }) {
  const zoom = useFlipStore((s) => s.zoom);
  const snap = useFlipStore((s) => s.snap);
  const selection = useFlipStore((s) => s.selection);
  const buffer = useTrackStore((s) => s.originalBuffer);
  const selected = selection?.kind === "clip" && selection.clipId === clip.id;
  const color = SOURCE_STYLE[clip.source].color;
  const width = Math.max(4, clip.length_beats * zoom);

  const start = (e: RPointerEvent<HTMLDivElement>, mode: "move" | "resize") => {
    e.stopPropagation();
    const s = useFlipStore.getState();
    s.select({ kind: "clip", trackId: track.id, clipId: clip.id });
    if (mode === "move" && e.altKey) s.edit(ops.addClip(track.id, { ...clip, id: uid() }));
    const step = snapStep(project, snap);
    let current = track.id;
    const gesture = `${mode}-${clip.id}-${Date.now()}`;
    beginDrag(e, zoom, (dBeats, dRows) => {
      const st = useFlipStore.getState();
      if (!st.project) return;
      if (mode === "resize") {
        const min = step > 0 ? step : 0.25;
        st.edit(ops.setClip(current, clip.id, { length_beats: Math.max(min, snapBeat(clip.length_beats + dBeats, step)) }), gesture);
        return;
      }
      const to = targetTrack(st.project, index, dRows, current, "audio");
      st.edit(ops.moveClip(current, clip.id, to, Math.max(0, snapBeat(clip.at_beat + dBeats, step))), gesture);
      if (to !== current) {
        current = to;
        st.select({ kind: "clip", trackId: to, clipId: clip.id });
      }
    });
  };

  const flags = [
    clip.loop && "↻",
    clip.reverse && "◀",
    clip.semitones !== 0 && `${clip.semitones > 0 ? "+" : ""}${clip.semitones}st`,
    clip.stretch === "repitch" && "vinile",
    clip.gate !== "off" && `gate ${clip.gate}`,
    clip.tune > 0 && "intonata",
    clip.harmony !== 0 && `armonia ${clip.harmony > 0 ? "+" : ""}${clip.harmony}`,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={clsx(
        "absolute top-1 bottom-1 rounded-sm border overflow-hidden cursor-grab active:cursor-grabbing select-none",
        selected ? "ring-1 ring-white z-10" : "",
      )}
      style={{ left: clip.at_beat * zoom, width, background: `${color}26`, borderColor: `${color}${selected ? "ff" : "99"}` }}
      onPointerDown={(e) => start(e, "move")}
      title={`${SOURCE_STYLE[clip.source].label} · ${clip.src_start.toFixed(2)}–${clip.src_end.toFixed(2)} s · ${clip.length_beats} beat\nAlt+trascina = copia`}
    >
      {buffer && <ClipWave buffer={buffer} clip={clip} zoom={zoom} color={color} />}
      <div className="absolute top-0 left-0 right-2 px-1 text-[9px] font-mono whitespace-nowrap overflow-hidden text-white/85 pointer-events-none">
        <span style={{ color }}>{SOURCE_STYLE[clip.source].label}</span> {flags}
      </div>
      <div
        className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/30"
        onPointerDown={(e) => start(e, "resize")}
        title="Trascina = lunghezza"
      />
    </div>
  );
}

function PatternBlock({ project, track, index, clip }: { project: FlipProject; track: FlipTrack; index: number; clip: PatternClip }) {
  const zoom = useFlipStore((s) => s.zoom);
  const snap = useFlipStore((s) => s.snap);
  const selection = useFlipStore((s) => s.selection);
  const selected = selection?.kind === "pattern" && selection.clipId === clip.id;
  const color = KIND_STYLE[track.kind].color;

  const start = (e: RPointerEvent<HTMLDivElement>, mode: "move" | "resize") => {
    e.stopPropagation();
    const s = useFlipStore.getState();
    s.select({ kind: "pattern", trackId: track.id, clipId: clip.id });
    if (mode === "move" && e.altKey) s.edit(ops.addPattern(track.id, { ...clip, id: uid() }));
    const step = snapStep(project, snap);
    let current = track.id;
    const gesture = `${mode}-${clip.id}-${Date.now()}`;
    beginDrag(e, zoom, (dBeats, dRows) => {
      const st = useFlipStore.getState();
      if (!st.project) return;
      if (mode === "resize") {
        const min = step > 0 ? step : 0.25;
        st.edit(ops.setPattern(current, clip.id, { length_beats: Math.max(min, snapBeat(clip.length_beats + dBeats, step)) }), gesture);
        return;
      }
      const to = targetTrack(st.project, index, dRows, current, track.kind);
      st.edit(ops.movePattern(current, clip.id, to, Math.max(0, snapBeat(clip.at_beat + dBeats, step))), gesture);
      if (to !== current) {
        current = to;
        st.select({ kind: "pattern", trackId: to, clipId: clip.id });
      }
    });
  };

  return (
    <div
      className={clsx(
        "absolute top-1 bottom-1 rounded-sm border overflow-hidden cursor-grab active:cursor-grabbing select-none",
        selected ? "ring-1 ring-white z-10" : "",
      )}
      style={{ left: clip.at_beat * zoom, width: Math.max(4, clip.length_beats * zoom), background: `${color}1f`, borderColor: `${color}${selected ? "ff" : "88"}` }}
      onPointerDown={(e) => start(e, "move")}
      title={`${track.name} · ciclo di ${clip.pattern_beats} beat · selezionala per l'editor sotto\nAlt+trascina = copia`}
    >
      <PatternThumb clip={clip} kind={track.kind} zoom={zoom} color={color} />
      <div className="absolute top-0 left-0 right-2 px-1 text-[9px] font-mono whitespace-nowrap overflow-hidden pointer-events-none" style={{ color }}>
        {track.name}
      </div>
      <div
        className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/30"
        onPointerDown={(e) => start(e, "resize")}
        title="Trascina = lunghezza (il pattern si ripete)"
      />
    </div>
  );
}

/** Drums: one dot per hit (kick low … hats high). Notes: mini piano roll. */
function PatternThumb({ clip, kind, zoom, color }: { clip: PatternClip; kind: FlipTrack["kind"]; zoom: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.max(4, Math.round(clip.length_beats * zoom));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const h = c.clientHeight || 48;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, h);
    g.fillStyle = color;
    const top = 12;
    const area = h - top - 2;
    const cycles = Math.ceil(clip.length_beats / clip.pattern_beats);
    if (kind === "drums") {
      const rows = DRUM_VOICES.filter((v) => clip.lanes[v]?.some((x) => x > 0));
      rows.forEach((v, r) => {
        const y = top + area - ((r + 0.5) / rows.length) * area;
        for (let k = 0; k < cycles; k++) {
          clip.lanes[v]!.forEach((vel, s) => {
            if (vel <= 0) return;
            const x = (k * clip.pattern_beats + s / clip.steps_per_beat) * zoom;
            if (x >= width) return;
            g.globalAlpha = 0.35 + 0.6 * vel;
            g.fillRect(x, y - 1.5, Math.max(1.5, zoom / clip.steps_per_beat - 1), 3);
          });
        }
      });
    } else if (clip.notes.length) {
      const lo = Math.min(...clip.notes.map((n) => n.pitch));
      const hi = Math.max(...clip.notes.map((n) => n.pitch));
      const span = Math.max(12, hi - lo + 1);
      for (let k = 0; k < cycles; k++) {
        for (const n of clip.notes) {
          const x = (k * clip.pattern_beats + n.start) * zoom;
          if (x >= width) continue;
          const y = top + area - ((n.pitch - lo + 1) / span) * area;
          g.globalAlpha = 0.4 + 0.5 * n.vel;
          g.fillRect(x, y, Math.max(1.5, n.length * zoom - 1), Math.max(2, area / span));
        }
      }
    }
    g.globalAlpha = 0.3;
    g.fillStyle = "#ffffff";
    for (let x = clip.pattern_beats * zoom; x < width; x += clip.pattern_beats * zoom) g.fillRect(x, 0, 1, h);
  }, [clip, kind, zoom, color, width]);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
