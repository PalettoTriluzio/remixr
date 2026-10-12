import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Sparkles, Send, Undo2, AlertCircle, Mic2, Play, Wand2, Layers } from "lucide-react";
import { api } from "../lib/api";
import { controlForPath, formatValue, getIn } from "../lib/effects";
import { LOOKS } from "../lib/looks";
import { useRemixStore, type ChatMessage } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";
import type { LLMStatus } from "../lib/types";

const GENRES = ["house", "lofi", "rock", "trap", "pop", "techno", "ambient"];

export function PromptPanel() {
  const { messages, thinking, pushMessage, setThinking, applyParams, setAmount } = useRemixStore();
  const analysis = useTrackStore((s) => s.analysis);
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("");
  const [artist, setArtist] = useState("");
  const [variants, setVariants] = useState(false);
  const artists = useKnownArtists();
  const { status, refresh } = useLLMStatus();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  const ask = async (text: string, shown: string, opts: { style?: string; variants?: number } = {}) => {
    if (!text || useRemixStore.getState().thinking) return;
    const n = opts.variants ?? 1;
    pushMessage({ role: "user", text: shown });
    setThinking(true);
    // Snapshot: the user may keep turning knobs while the model thinks. All
    // variants start from the same state, so each one is a real alternative.
    const before = useRemixStore.getState().params;
    try {
      for (let k = 1; k <= n; k++) {
        try {
          const res = await api.interpret({
            prompt: text,
            current_params: before,
            genre: genre || null,
            bpm: analysis?.bpm ?? null,
            key: analysis?.key ?? null,
            reference_artist: opts.style || null,
            variation: n > 1 ? k : null,
          });
          // First answer plays right away; the others wait for a click.
          if (k === 1) {
            applyParams(res.params, res.changed_fields);
            setAmount(100);
          }
          pushMessage({
            role: "assistant",
            text: res.explanation,
            before,
            after: res.params,
            changed: res.changed_fields,
            variant: n > 1 ? k : undefined,
          });
        } catch (e) {
          pushMessage({ role: "error", text: (e as Error).message });
          if (k === 1) break; // model down: no point asking again
        }
      }
    } finally {
      setThinking(false);
    }
  };

  const send = () => {
    const style = artist.trim();
    const text = prompt.trim() || (style ? `Fammela come la farebbe ${style}` : "");
    if (!text) return;
    setPrompt("");
    void ask(text, style ? `[stile: ${style}] ${text}` : text, { style, variants: variants ? 3 : 1 });
  };

  const surprise = () =>
    void ask(
      "Sorprendimi: inventa un remix creativo e musicale per questa traccia, coerente con BPM e tonalità. " +
        "Dagli un nome evocativo all'inizio della spiegazione.",
      "✨ Sorprendimi",
      { variants: variants ? 3 : 1 },
    );

  return (
    <section className="flex-1 flex flex-col bg-bg min-w-0">
      <div className="h-9 border-b border-line bg-bg-panel/95 backdrop-blur px-3 flex items-center justify-between">
        <span className="text-xs font-mono tracking-wider text-white/60 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-accent" /> AI REMIX
        </span>
        <StatusBadge status={status} onSwitched={refresh} />
      </div>

      <LooksBar />

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !thinking && (
          <div className="text-white/30 text-sm italic">
            Descrivi il remix che vuoi, per esempio:
            <br />· "versione lo-fi chillhop, più calda e più lenta"
            <br />· "fammela come la farebbe Billie Eilish" (o scegli l'artista in "Stile di")
            <br />· "portala a 128 BPM con un delay a tempo"
            <br /><br />Le modifiche compaiono qui (vecchio → nuovo) e in rosa nel rack.
            Ascolta con <b>B</b>, confronta con <b>A</b>: le onde sotto mostrano la differenza.
          </div>
        )}
        {messages.map((m) => <Message key={m.id} m={m} />)}
        {thinking && (
          <div className="flex items-center gap-1.5 text-sm text-white/50">
            <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />
            Thinking
            <span className="flex gap-0.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-line p-3 bg-bg-panel">
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Descrivi il remix… (Invio = invia, Shift+Invio = a capo)"
            maxLength={2000}
            className="flex-1 bg-bg-card border border-line rounded-md px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={thinking || (!prompt.trim() && !artist.trim())}
            className="bg-accent hover:brightness-110 disabled:opacity-40 rounded-md px-4 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button
            onClick={surprise}
            disabled={thinking}
            title="L'AI inventa un remix creativo per questa traccia"
            className="text-xs px-2 py-1 rounded bg-accent/20 hover:bg-accent/35 text-white/80 flex items-center gap-1 disabled:opacity-40"
          >
            <Wand2 className="w-3 h-3" /> Sorprendimi
          </button>
          <button
            onClick={() => setVariants(!variants)}
            title="Chiedi 3 versioni diverse e scegli quella che ti piace (ci mette circa 3 volte di più)"
            className={clsx(
              "text-xs px-2 py-1 rounded border flex items-center gap-1",
              variants ? "border-accent text-accent bg-accent/10" : "border-line text-white/40 hover:text-white/70",
            )}
          >
            <Layers className="w-3 h-3" /> 3 varianti
          </button>
          <span className="text-xs text-white/40">Genre:</span>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="bg-bg-card border border-line rounded text-xs px-2 py-1"
          >
            <option value="">none</option>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <span className="text-xs text-white/40 ml-2 flex items-center gap-1" title="Imita il sound (produzione/mix) di un artista">
            <Mic2 className="w-3 h-3" /> Stile di:
          </span>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            list="remixr-artists"
            placeholder="artista (opzionale)"
            maxLength={100}
            className="bg-bg-card border border-line rounded text-xs px-2 py-1 w-40 focus:outline-none focus:border-accent"
          />
          <datalist id="remixr-artists">
            {artists.map((a) => <option key={a} value={a} />)}
          </datalist>
          {analysis && (
            <span className="text-xs text-white/30 font-mono ml-auto">
              contesto: {analysis.bpm.toFixed(0)} BPM · {analysis.key}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Message({ m }: { m: ChatMessage }) {
  const applyParams = useRemixStore((s) => s.applyParams);
  const setAmount = useRemixStore((s) => s.setAmount);
  const live = useRemixStore((s) => m.after !== undefined && s.params === m.after);

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-accent/20 border border-accent/30 rounded-md px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap">
          {m.text}
        </div>
      </div>
    );
  }
  if (m.role === "error") {
    return (
      <div className="flex items-start gap-2 text-sm text-accent-hot">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span className="break-words min-w-0">{m.text}</span>
      </div>
    );
  }
  return (
    <div className={clsx("bg-bg-card border rounded-md px-3 py-2 text-sm space-y-2 transition-colors", live ? "border-accent/70" : "border-line")}>
      {(m.variant || live) && (
        <div className="flex items-center gap-2 text-[10px] font-mono tracking-wider">
          {m.variant && <span className="text-white/50">VARIANTE {m.variant}</span>}
          {live && <span className="text-accent">● IN ASCOLTO</span>}
        </div>
      )}
      <div className="whitespace-pre-wrap">{m.text}</div>
      {m.changed && m.changed.length > 0 && (
        <table className="w-full text-xs font-mono">
          <tbody>
            {m.changed.map((path) => (
              <DiffRow key={path} path={path} before={getIn(m.before, path)} after={getIn(m.after, path)} />
            ))}
          </tbody>
        </table>
      )}
      {m.before && m.after && m.changed && m.changed.length > 0 && (
        <div className="flex items-center gap-3">
          {!live && (
            <button
              onClick={() => { applyParams(m.after!, m.changed!); setAmount(100); }}
              className="text-xs text-accent hover:text-white flex items-center gap-1"
              title="Applica questa versione e ascoltala"
            >
              <Play className="w-3 h-3" /> ascolta questa
            </button>
          )}
          <button
            onClick={() => applyParams(m.before!, [])}
            className="text-xs text-white/40 hover:text-white flex items-center gap-1"
            title="Ripristina i parametri di prima di questa risposta"
          >
            <Undo2 className="w-3 h-3" /> annulla
          </button>
        </div>
      )}
    </div>
  );
}

/** One-tap looks: instant, no AI. Then dose them with "Intensità". */
function LooksBar() {
  const applyParams = useRemixStore((s) => s.applyParams);
  const setAmount = useRemixStore((s) => s.setAmount);
  const bpm = useTrackStore((s) => s.analysis?.bpm ?? null);

  return (
    <div className="border-b border-line px-3 py-2 flex flex-wrap gap-1.5 items-center">
      <span className="text-[10px] font-mono tracking-wider text-white/40 mr-1">LOOK</span>
      {LOOKS.map((l) => (
        <button
          key={l.id}
          onClick={() => {
            applyParams({ global_chain: l.build(bpm), per_stem: null }, []);
            setAmount(100);
          }}
          title={`${l.hint} — poi dosalo con Intensità`}
          className="text-xs px-2 py-0.5 rounded-full border border-line hover:border-accent hover:text-white text-white/60 transition-colors"
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function DiffRow({ path, before, after }: { path: string; before: unknown; after: unknown }) {
  const def = controlForPath(path);
  const fmt = (v: unknown) =>
    typeof v === "boolean" ? (v ? "on" : "off")
    : typeof v === "number" ? (def ? formatValue(v, def) : String(Number(v.toFixed(3))))
    : String(v);
  const label = path.replace(/^global_chain\./, "");
  return (
    <tr>
      <td className="text-white/50 pr-2 py-0.5">{label}</td>
      <td className="text-white/40 text-right">{fmt(before)}</td>
      <td className="text-white/30 px-1.5">→</td>
      <td className={clsx("text-right", typeof after === "boolean" && !after ? "text-white/50" : "text-accent-hot")}>
        {fmt(after)}
      </td>
    </tr>
  );
}

function StatusBadge({ status, onSwitched }: { status: LLMStatus | null; onSwitched: () => void }) {
  if (!status) return <span className="text-xs text-white/30">LLM: backend offline</span>;
  const model = status.model ?? "";
  const dot = {
    idle: "bg-white/30",
    loading: "bg-yellow-400 animate-pulse",
    ready: "bg-green-400",
    error: "bg-accent-hot",
  }[status.state];
  const label = {
    idle: "non caricato",
    loading: "caricamento…",
    ready: status.gpu_offload ? "GPU" : "CPU",
    error: "errore",
  }[status.state];
  const available = status.available ?? [];
  const pretty = (m: string) => m.replace(/\.gguf$/i, "");

  const pick = async (m: string) => {
    try {
      await api.selectModel(m);
    } finally {
      onSwitched();
    }
  };

  return (
    <span className="text-xs text-white/40 flex items-center gap-1.5 min-w-0" title={status.error ?? model}>
      <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      {available.length > 1 ? (
        <select
          value={model}
          onChange={(e) => void pick(e.target.value)}
          disabled={status.state === "loading"}
          className="bg-transparent text-white/60 max-w-[240px] truncate focus:outline-none"
          title="Cambia modello (si ricarica sulla GPU)"
        >
          {available.map((m) => <option key={m} value={m} className="bg-bg-panel">{pretty(m)}</option>)}
        </select>
      ) : (
        <span className="truncate max-w-[220px]">{model ? pretty(model) : "nessun modello"}</span>
      )}
      <span className="text-white/25">· {label}</span>
    </span>
  );
}

/** Poll /llm/status while the model is loading, then stop. */
function useLLMStatus(): { status: LLMStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [kick, setKick] = useState(0);
  const thinking = useRemixStore((s) => s.thinking);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const s = await api.llmStatus();
        if (!alive) return;
        setStatus(s);
        if (s.state === "loading" || s.state === "idle") timer = setTimeout(poll, 1500);
      } catch {
        if (!alive) return;
        setStatus(null);
        timer = setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [thinking, kick]); // re-check after each request (first one may have loaded the model) and after a model switch

  return { status, refresh: () => setKick((k) => k + 1) };
}

/** Artists with curated traits on the backend (suggestions only: any name works). */
function useKnownArtists(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    api.llmStyles().then(setNames).catch(() => setNames([]));
  }, []);
  return names;
}
