// Left column in flip view: selected clip (sampler controls), its track
// (volume, pan, effect chain), master (= the remix rack, as heard).
import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Copy, Loader2, Mic2, Scissors, Trash2 } from "lucide-react";
import { setIn, type ControlDef } from "../lib/effects";
import { SOURCE_STYLE, uid } from "../lib/flip";
import { chopSelected, type ChopMode } from "../lib/flipActions";
import { findClip, findTrack, ops, useFlipStore } from "../lib/flipStore";
import { transposeKey } from "../lib/keys";
import { defaultChain, type FlipClip, type FlipTrack, type GateRate } from "../lib/types";
import { ChainRack } from "./ChainRack";
import { useRemixBinding } from "./EffectRack";
import { Knob } from "./Knob";

type Tab = "clip" | "track" | "master";

export function FlipSidebar() {
  const project = useFlipStore((s) => s.project);
  const selection = useFlipStore((s) => s.selection);
  const [tab, setTab] = useState<Tab>("clip");
  const found = findClip(project, selection);
  const track = findTrack(project, selection);

  // Follow the selection.
  useEffect(() => {
    if (selection?.kind === "clip") setTab("clip");
    else if (selection?.kind === "track") setTab("track");
  }, [selection]);

  return (
    <aside className="w-80 shrink-0 border-r border-line bg-bg flex flex-col min-h-0">
      <div className="h-9 shrink-0 border-b border-line bg-bg-panel flex text-xs font-mono">
        <TabButton active={tab === "clip"} onClick={() => setTab("clip")}>CLIP</TabButton>
        <TabButton active={tab === "track"} onClick={() => setTab("track")}>TRACCIA</TabButton>
        <TabButton active={tab === "master"} onClick={() => setTab("master")}>MASTER</TabButton>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tab === "clip" && (found ? <ClipInspector track={found.track} clip={found.clip} /> : <Hint>Seleziona una clip sulla timeline.</Hint>)}
        {tab === "track" && (track ? <TrackInspector track={track} /> : <Hint>Seleziona una traccia (clic sul nome o su uno spazio vuoto della corsia).</Hint>)}
        {tab === "master" && <MasterRack />}
      </div>
    </aside>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx("flex-1 tracking-wider", active ? "text-white border-b-2 border-accent-hot" : "text-white/40 hover:text-white")}
    >
      {children}
    </button>
  );
}

const Hint = ({ children }: { children: ReactNode }) => <p className="text-xs text-white/40 p-2">{children}</p>;

function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="bg-bg-card border border-line rounded-md">
      <div className="flex items-center px-2 h-7 text-xs font-medium text-white/70">
        <span className="flex-1">{title}</span>
        {right}
      </div>
      <div className="px-2 pb-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- clip

const K = {
  gain: { key: "gain_db", label: "Gain", min: -60, max: 12, step: 0.5, unit: "dB" },
  semis: { key: "semitones", label: "Pitch", min: -24, max: 24, step: 1, unit: "st" },
  hp: { key: "hp_freq", label: "HP", min: 20, max: 2000, step: 1, unit: "Hz", log: true },
  lp: { key: "lp_freq", label: "LP", min: 200, max: 20000, step: 1, unit: "Hz", log: true },
  fadeIn: { key: "fade_in_ms", label: "Fade in", min: 0, max: 2000, step: 1, unit: "ms" },
  fadeOut: { key: "fade_out_ms", label: "Fade out", min: 0, max: 4000, step: 1, unit: "ms" },
  duty: { key: "gate_duty", label: "Duty", min: 0.05, max: 0.95, step: 0.01 },
  tune: { key: "tune", label: "Intona", min: 0, max: 1, step: 0.01 },
} satisfies Record<string, ControlDef>;

const DEFAULT_CLIP: Partial<FlipClip> = {
  gain_db: 0, semitones: 0, hp_freq: 20, lp_freq: 20000, fade_in_ms: 5, fade_out_ms: 10, gate_duty: 0.5, tune: 0,
};

const GATES: GateRate[] = ["off", "1/4", "1/8", "1/16", "1/32"];
const HARMONIES: Array<[number, string]> = [
  [0, "nessuna"], [2, "terza sopra"], [3, "quarta sopra"], [4, "quinta sopra"], [7, "ottava sopra"],
  [-2, "terza sotto"], [-3, "quarta sotto"], [-4, "quinta sotto"], [-7, "ottava sotto"],
];
const CHOPS: Array<[ChopMode, string]> = [
  ["bar", "battute"], ["half", "½ battuta"], ["beat", "beat"], ["eighth", "1/8"], ["onsets", "transienti"],
];

function ClipInspector({ track, clip }: { track: FlipTrack; clip: FlipClip }) {
  const edit = useFlipStore((s) => s.edit);
  const select = useFlipStore((s) => s.select);
  const project = useFlipStore((s) => s.project)!;
  const [chopping, setChopping] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setMsg(null), [clip.id]);

  const set = (patch: Partial<FlipClip>, gesture?: string) => edit(ops.setClip(track.id, clip.id, patch), gesture);
  const knob = (c: ControlDef) => (
    <Knob
      key={c.key}
      def={c}
      value={clip[c.key as keyof FlipClip] as number}
      defaultValue={DEFAULT_CLIP[c.key as keyof FlipClip] as number}
      onChange={(v) => set({ [c.key]: v } as Partial<FlipClip>, `${c.key}-${clip.id}`)}
    />
  );
  const chop = async (mode: ChopMode) => {
    setChopping(true);
    setMsg(await chopSelected(mode));
    setChopping(false);
  };
  /** Backing vocal: a copy on a new track, a third above, tuned. */
  const addHarmony = () => {
    const name = `Armonia ${SOURCE_STYLE[clip.source].label}`;
    let target = project.tracks.find((t) => t.name === name);
    if (!target) {
      edit(ops.addTrack(name));
      const tracks = useFlipStore.getState().project!.tracks;
      target = tracks[tracks.length - 1];
      edit(ops.setTrack(target.id, { gain_db: -6, pan: 0.3 }));
    }
    const copy = { ...clip, id: uid(), harmony: 2, tune: Math.max(clip.tune, 0.8) };
    edit(ops.addClip(target.id, copy));
    select({ kind: "clip", trackId: target.id, clipId: copy.id });
  };

  const color = SOURCE_STYLE[clip.source].color;
  const bpb = project.beats_per_bar;

  return (
    <>
      <div className="flex items-center gap-2 px-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="text-sm font-medium">{SOURCE_STYLE[clip.source].label}</span>
        <span className="text-[10px] font-mono text-white/40 flex-1 truncate">
          {clip.src_start.toFixed(2)}–{clip.src_end.toFixed(2)} s · {track.name}
        </span>
        <IconBtn title="Duplica dopo di sé (Ctrl+D)" onClick={() => edit(ops.duplicateClip(track.id, clip.id))}><Copy className="w-3.5 h-3.5" /></IconBtn>
        <IconBtn title="Elimina (Canc)" onClick={() => { edit(ops.removeClip(track.id, clip.id)); select(null); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
      </div>

      <Card title="Taglia" right={chopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3 text-white/30" />}>
        <div className="flex flex-wrap gap-1">
          {CHOPS.map(([m, label]) => (
            <Chip key={m} onClick={() => void chop(m)} disabled={chopping}>{label}</Chip>
          ))}
        </div>
        <p className="text-[10px] text-white/35 mt-1">
          Divide la clip in pezzi che restano al loro posto: poi spostali, ripetili, girali.
        </p>
        {msg && <p className="text-[10px] text-accent-hot mt-1">{msg}</p>}
      </Card>

      <Card title="Tempo">
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-1">
            <Chip active={!clip.loop} onClick={() => set({ loop: false })} title="La clip si stira per riempire la lunghezza">stira</Chip>
            <Chip active={clip.loop} onClick={() => set({ loop: true })} title="La clip suona al tempo del progetto e si ripete">loop</Chip>
            <span className="w-2" />
            <Chip active={clip.stretch === "warp"} onClick={() => set({ stretch: "warp" })} title="Cambia il tempo, non l'intonazione">warp</Chip>
            <Chip active={clip.stretch === "repitch"} onClick={() => set({ stretch: "repitch" })} title="Come un giradischi: più veloce = più acuto">vinile</Chip>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/40 w-16">lunghezza</span>
            <Chip onClick={() => set({ length_beats: Math.max(0.25, clip.length_beats / 2) })}>÷2</Chip>
            <span className="w-16 text-center font-mono">{+clip.length_beats.toFixed(2)} beat</span>
            <Chip onClick={() => set({ length_beats: Math.min(1024, clip.length_beats * 2) })}>×2</Chip>
            <Chip onClick={() => set({ length_beats: clip.src_beats })} title="Lunghezza originale (stesso tempo del progetto)">1:1</Chip>
          </div>
          <div className="flex items-center gap-1">
            <Chip active={clip.reverse} onClick={() => set({ reverse: !clip.reverse })}>◀ reverse</Chip>
            <span className="text-[10px] font-mono text-white/35 ml-auto">
              origine {+clip.src_beats.toFixed(2)} beat · {(clip.src_beats / bpb).toFixed(2).replace(/\.00$/, "")} batt.
            </span>
          </div>
        </div>
      </Card>

      <Card title="Suono">
        <div className="flex flex-wrap gap-x-1 gap-y-2">
          {[K.gain, K.semis, K.hp, K.lp, K.fadeIn, K.fadeOut].map(knob)}
        </div>
      </Card>

      <Card title="Gate ritmico">
        <div className="flex items-center gap-1 flex-wrap">
          {GATES.map((g) => <Chip key={g} active={clip.gate === g} onClick={() => set({ gate: g })}>{g}</Chip>)}
          {clip.gate !== "off" && knob(K.duty)}
        </div>
      </Card>

      <Card title="Voce" right={<Mic2 className="w-3 h-3 text-white/30" />}>
        <div className="flex items-start gap-2">
          {knob(K.tune)}
          <div className="flex-1 space-y-1">
            <select
              value={clip.harmony}
              onChange={(e) => set({ harmony: Number(e.target.value) })}
              className="w-full bg-bg border border-line rounded px-1 h-6 text-xs"
              title="Sposta ogni nota di N gradi della scala (armonia vera, non un intervallo fisso)"
            >
              {HARMONIES.map(([v, label]) => <option key={v} value={v}>armonia: {label}</option>)}
            </select>
            <Chip onClick={addHarmony} title="Copia questa clip su una nuova traccia, una terza sopra e intonata">+ seconda voce</Chip>
          </div>
        </div>
        <p className="text-[10px] text-white/35 mt-1">
          Scala: {project.source_key} (originale){project.transpose !== 0 && ` → ${transposeKey(project.source_key, project.transpose)}`}.
          Intona = ogni nota verso la scala; il vibrato resta.
        </p>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- track / master

const TRACK_K = {
  gain: { key: "gain_db", label: "Volume", min: -60, max: 12, step: 0.5, unit: "dB" },
  pan: { key: "pan", label: "Pan", min: -1, max: 1, step: 0.05 },
} satisfies Record<string, ControlDef>;

function TrackInspector({ track }: { track: FlipTrack }) {
  const edit = useFlipStore((s) => s.edit);
  const set = (patch: Partial<FlipTrack>, gesture?: string) => edit(ops.setTrack(track.id, patch), gesture);

  return (
    <>
      <div className="flex items-center gap-2 px-1">
        <input
          value={track.name}
          onChange={(e) => set({ name: e.target.value.slice(0, 40) }, `name-${track.id}`)}
          className="flex-1 bg-bg-card border border-line rounded px-2 h-7 text-sm"
        />
        <Chip active={track.follow_key} onClick={() => set({ follow_key: !track.follow_key })} title="Trasposta con la tonalità del progetto">♪ tonalità</Chip>
      </div>
      <div className="flex gap-2 px-1">
        <Knob def={TRACK_K.gain} value={track.gain_db} defaultValue={0} onChange={(v) => set({ gain_db: v }, `g-${track.id}`)} />
        <Knob def={TRACK_K.pan} value={track.pan} defaultValue={0} onChange={(v) => set({ pan: v }, `p-${track.id}`)} />
      </div>
      <p className="text-[10px] font-mono tracking-wider text-white/40 px-1 pt-1">EFFETTI DELLA TRACCIA</p>
      <ChainRack
        noTempo
        binding={{
          chain: track.chain,
          onSet: (path, v) => set({ chain: setIn(track.chain, path, v) }, `fx-${track.id}-${path}`),
          onReset: (id) => set({ chain: { ...track.chain, [id]: defaultChain()[id] } }),
        }}
      />
    </>
  );
}

function MasterRack() {
  const binding = useRemixBinding();
  return (
    <>
      <p className="text-[10px] text-white/40 px-1">
        Il master è il rack del remix: look, preset, AI e intensità valgono anche qui.
      </p>
      <ChainRack binding={binding} />
    </>
  );
}

// ---------------------------------------------------------------- bits

function Chip(props: { active?: boolean; onClick: () => void; disabled?: boolean; title?: string; children: ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={clsx(
        "px-2 h-6 rounded text-[11px] font-mono disabled:opacity-40",
        props.active ? "bg-accent-hot/30 text-white" : "bg-bg-hover text-white/60 hover:text-white",
      )}
    >
      {props.children}
    </button>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-bg-hover">
      {children}
    </button>
  );
}
