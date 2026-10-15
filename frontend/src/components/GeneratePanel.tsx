// "Genera strumentale": style, harmony (the song's chords or a new
// progression), parts, range → new drums/bass/chords/arp tracks.
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Dice5, Loader2, Wand2 } from "lucide-react";
import { contentEnd } from "../lib/flip";
import { generateParts } from "../lib/flipActions";
import { ops, useFlipStore } from "../lib/flipStore";
import type { GenPart, GenStyle, Mood } from "../lib/types";

const STYLES: Array<[GenStyle, string, number]> = [
  ["trap", "Trap", 140], ["drill", "Drill", 142], ["boombap", "Boom bap", 90], ["lofi", "Lo-fi", 80],
  ["house", "House", 124], ["reggaeton", "Reggaeton", 95], ["afro", "Afro", 105], ["pop", "Pop", 118],
];
const MOODS: Array<[Mood, string]> = [["dark", "scuro"], ["sad", "malinconico"], ["epic", "epico"], ["happy", "solare"], ["dreamy", "sognante"]];
const PARTS: Array<[GenPart, string]> = [["drums", "batteria"], ["bass", "basso"], ["chords", "accordi"], ["arp", "arpeggio"]];

export function GenerateButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx("flex items-center gap-1 px-2 h-6 rounded", open ? "bg-accent-hot/40" : "bg-accent-hot/20 hover:bg-accent-hot/35")}
        title="Batteria, basso, accordi e arpeggio nuovi, che seguono la canzone"
      >
        <Wand2 className="w-3 h-3" /> genera strumentale
      </button>
      {open && <GeneratePanel />}
    </div>
  );
}

function GeneratePanel() {
  const project = useFlipStore((s) => s.project)!;
  const gen = useFlipStore((s) => s.gen);
  const setGen = useFlipStore((s) => s.setGen);
  const edit = useFlipStore((s) => s.edit);
  const bpb = project.beats_per_bar;
  const usedBars = Math.ceil(contentEnd(project) / bpb);
  const [startBar, setStartBar] = useState(1);
  const [bars, setBars] = useState(Math.max(4, Math.min(project.bars, usedBars || project.bars)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const typical = STYLES.find(([s]) => s === gen.style)![2];

  const togglePart = (p: GenPart) =>
    setGen({ parts: gen.parts.includes(p) ? gen.parts.filter((x) => x !== p) : [...gen.parts, p] });

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await generateParts(startBar, bars) });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  };

  return (
    <div className="absolute right-0 top-8 z-50 w-[26rem] bg-bg-panel border border-line rounded-lg shadow-2xl p-3 space-y-3 font-sans text-xs">
      <Row label="Stile">
        {STYLES.map(([s, label]) => <Chip key={s} on={gen.style === s} onClick={() => setGen({ style: s })}>{label}</Chip>)}
      </Row>
      {Math.abs(project.bpm - typical) > 25 && !(["trap", "drill"].includes(gen.style) && Math.abs(project.bpm * 2 - typical) <= 25) && (
        <p className="text-white/45">
          Il progetto è a {project.bpm} BPM, lo stile di solito sta sui {typical}.{" "}
          <button className="underline text-white/70 hover:text-white" onClick={() => edit(ops.setProjectField("bpm", typical))}>
            Usa {typical} BPM
          </button>
        </p>
      )}
      <Row label="Armonia">
        <Chip on={gen.harmony === "song"} onClick={() => setGen({ harmony: "song" })} title="Gli accordi originali sotto le clip che hai messo: il beat sta bene con la voce">dalla canzone</Chip>
        <Chip on={gen.harmony === "new"} onClick={() => setGen({ harmony: "new" })} title="Una progressione nuova nella tonalità della canzone">nuova</Chip>
      </Row>
      {gen.harmony === "new" && (
        <Row label="Mood">
          {MOODS.map(([m, label]) => <Chip key={m} on={gen.mood === m} onClick={() => setGen({ mood: m })}>{label}</Chip>)}
        </Row>
      )}
      <Row label="Parti">
        {PARTS.map(([p, label]) => <Chip key={p} on={gen.parts.includes(p)} onClick={() => togglePart(p)}>{label}</Chip>)}
      </Row>
      <Row label="Battute">
        <span className="text-white/50">dalla</span>
        <input type="number" min={1} max={project.bars} value={startBar} onChange={(e) => setStartBar(Math.max(1, Number(e.target.value) || 1))} className="w-12 h-6 bg-bg-card border border-line rounded px-1" />
        <span className="text-white/50">per</span>
        <input type="number" min={1} max={256} value={bars} onChange={(e) => setBars(Math.max(1, Number(e.target.value) || 1))} className="w-12 h-6 bg-bg-card border border-line rounded px-1" />
      </Row>
      <label className="flex items-center gap-2 text-white/60">
        <input type="checkbox" checked={gen.muteOriginal} onChange={(e) => setGen({ muteOriginal: e.target.checked })} />
        silenzia batteria e basso originali
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setGen({ seed: Math.floor(Math.random() * 1e6) + 1 })}
          className="flex items-center gap-1 px-2 h-8 rounded bg-bg-card hover:bg-bg-hover text-white/70"
          title="Un'altra variante (stesse impostazioni, scelte diverse)"
        >
          <Dice5 className="w-3.5 h-3.5" /> variante {gen.seed}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => void run()}
          disabled={busy || gen.parts.length === 0}
          className="flex items-center gap-1.5 px-4 h-8 rounded bg-accent-hot/70 hover:bg-accent-hot text-white font-medium disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Genera
        </button>
      </div>
      {msg && <p className={msg.ok ? "text-white/60" : "text-accent-hot"}>{msg.text}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 pt-1 text-white/40 font-mono text-[10px] uppercase">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx("px-2 h-6 rounded", on ? "bg-accent-hot/35 text-white" : "bg-bg-card text-white/55 hover:text-white")}
    >
      {children}
    </button>
  );
}
