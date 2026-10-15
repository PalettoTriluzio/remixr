import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Disc3, Download, FolderOpen, Loader2, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { morphParams } from "../lib/morph";
import { useRemixStore } from "../lib/remixStore";
import { activeStemMix, useStemsStore } from "../lib/stemsStore";
import { useFlipStore } from "../lib/flipStore";
import { enterFlip } from "../lib/flipActions";
import { useTrackStore } from "../lib/store";
import type { Preset } from "../lib/types";

export function TopBar() {
  const flip = useFlipStore((s) => s.view === "flip");
  const remixUndo = useRemixStore((s) => s.undo);
  const remixRedo = useRemixStore((s) => s.redo);
  const remixCanUndo = useRemixStore((s) => s.past.length > 0);
  const remixCanRedo = useRemixStore((s) => s.future.length > 0);
  const flipUndo = useFlipStore((s) => s.undo);
  const flipRedo = useFlipStore((s) => s.redo);
  const flipCanUndo = useFlipStore((s) => s.past.length > 0);
  const flipCanRedo = useFlipStore((s) => s.future.length > 0);
  const undo = flip ? flipUndo : remixUndo;
  const redo = flip ? flipRedo : remixRedo;
  const canUndo = flip ? flipCanUndo : remixCanUndo;
  const canRedo = flip ? flipCanRedo : remixCanRedo;

  return (
    <header className="h-12 shrink-0 border-b border-line bg-bg-panel flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <Disc3 className="w-5 h-5 text-accent" />
        <span className="font-mono text-sm tracking-wider">REMIXR</span>
        <span className="text-xs text-white/40 font-mono">v0.3.0</span>
      </div>
      <ViewSwitch />
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <IconButton onClick={undo} disabled={!canUndo} title="Annulla (Ctrl+Z)"><Undo2 className="w-3.5 h-3.5" /></IconButton>
        <IconButton onClick={redo} disabled={!canRedo} title="Ripeti (Ctrl+Shift+Z)"><Redo2 className="w-3.5 h-3.5" /></IconButton>
        <div className="w-2" />
        <PresetMenu />
        <ExportButton />
      </div>
    </header>
  );
}

/** REMIX = effects on the whole song · FLIP = rebuild it from its pieces. */
function ViewSwitch() {
  const flip = useFlipStore((s) => s.view === "flip");
  const setView = useFlipStore((s) => s.setView);
  const hasTrack = useTrackStore((s) => !!s.track);
  return (
    <div className="flex rounded overflow-hidden border border-line text-xs font-mono ml-4">
      <button
        onClick={() => setView("remix")}
        className={clsx("px-3 h-7", !flip ? "bg-accent/30 text-white font-semibold" : "text-white/50 hover:bg-bg-hover")}
        title="Effetti sulla canzone intera"
      >
        REMIX
      </button>
      <button
        onClick={enterFlip}
        disabled={!hasTrack}
        className={clsx("px-3 h-7 disabled:opacity-30", flip ? "bg-accent-hot/30 text-white font-semibold" : "text-white/50 hover:bg-bg-hover")}
        title="Ricostruisci la canzone dai suoi pezzi: timeline, campionatore, nuovo tempo e tonalità"
      >
        FLIP
      </button>
    </div>
  );
}

function IconButton(props: { onClick: () => void; disabled?: boolean; title: string; children: ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className="w-8 h-8 rounded bg-bg-card hover:bg-bg-hover flex items-center justify-center disabled:opacity-30"
    >
      {props.children}
    </button>
  );
}

// ---------------------------------------------------------------- presets

function PresetMenu() {
  const applyParams = useRemixStore((s) => s.applyParams);
  const setAmount = useRemixStore((s) => s.setAmount);
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Preset[]>([]);
  const [genres, setGenres] = useState<Preset[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    try {
      const [p, g] = await Promise.all([api.listPresets(), api.listGenreTemplates()]);
      setMine(p);
      setGenres(g);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const load = (p: Preset) => {
    applyParams({ ...p.params, per_stem: null }, []);
    setAmount(100);
    setOpen(false);
  };

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      // What you hear (Intensità applied), so loading it sounds the same at 100 %.
      const { params, amount } = useRemixStore.getState();
      await api.createPreset({ name: n, params: morphParams(params, amount), genre: null, created_at: "" });
      setName("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (p: Preset) => {
    try {
      await api.deletePreset(p.name);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx("px-3 h-8 rounded text-xs flex items-center gap-1.5", open ? "bg-bg-hover" : "bg-bg-card hover:bg-bg-hover")}
      >
        <FolderOpen className="w-3.5 h-3.5" /> Preset
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-72 z-50 bg-bg-panel border border-line rounded-md shadow-xl text-xs">
          <Section title="Generi">
            {genres.map((p) => (
              <Row key={p.name} onClick={() => load(p)}>{p.name}</Row>
            ))}
          </Section>
          <Section title="I miei preset">
            {mine.length === 0 && <div className="px-3 py-1.5 text-white/30 italic">nessuno salvato</div>}
            {mine.map((p) => (
              <Row key={p.name} onClick={() => load(p)}>
                <span className="flex-1 truncate">{p.name}</span>
                <span
                  role="button"
                  title="Elimina"
                  onClick={(e) => { e.stopPropagation(); void remove(p); }}
                  className="text-white/30 hover:text-accent-hot"
                >
                  <Trash2 className="w-3 h-3" />
                </span>
              </Row>
            ))}
          </Section>
          <div className="flex gap-1.5 p-2 border-t border-line">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
              placeholder="Nome del preset corrente"
              maxLength={64}
              className="flex-1 min-w-0 bg-bg-card border border-line rounded px-2 h-7 focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => void save()}
              disabled={!name.trim()}
              className="px-2 h-7 rounded bg-accent hover:brightness-110 disabled:opacity-40 flex items-center gap-1"
            >
              <Save className="w-3 h-3" /> Salva
            </button>
          </div>
          {error && <div className="px-3 pb-2 text-accent-hot break-words">{error}</div>}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-1 border-b border-line last:border-b-0 max-h-56 overflow-y-auto">
      <div className="px-3 py-1 text-[10px] font-mono tracking-wider text-white/40">{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Row({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex items-center gap-2">
      {children}
    </button>
  );
}

// ----------------------------------------------------------------- export

function ExportButton() {
  const track = useTrackStore((s) => s.track);
  const [format, setFormat] = useState<"wav" | "mp3">("wav");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!track || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Whole track, current params (the region only limits the preview).
      const { params, amount } = useRemixStore.getState();
      const { view, project } = useFlipStore.getState();
      const isFlip = view === "flip" && !!project;
      const res = isFlip
        ? await api.flipExport({
            track_id: track.track_id,
            project: project!,
            master: morphParams(params, amount).global_chain,
            format,
          })
        : await api.renderExport({
            track_id: track.track_id,
            params: morphParams(params, amount),
            stem_mix: activeStemMix(useStemsStore.getState()),
            format,
          });
      const a = document.createElement("a");
      a.href = api.renderFileUrl(res.render_id);
      a.download = `${track.filename.replace(/\.[^.]+$/, "")}_${isFlip ? "flip" : "remix"}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center ml-2" title={error ?? "Renderizza l'intera traccia con i parametri correnti"}>
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as "wav" | "mp3")}
        disabled={busy}
        className="h-8 bg-bg-card border border-line border-r-0 rounded-l text-xs px-1.5"
      >
        <option value="wav">WAV 24</option>
        <option value="mp3">MP3</option>
      </select>
      <button
        onClick={() => void run()}
        disabled={!track || busy}
        className={clsx(
          "px-3 h-8 rounded-r text-xs flex items-center gap-1.5 hover:brightness-110 disabled:opacity-40",
          error ? "bg-accent-hot" : "bg-accent",
        )}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {busy ? "Export…" : error ? "Errore — riprova" : "Export"}
      </button>
    </div>
  );
}
