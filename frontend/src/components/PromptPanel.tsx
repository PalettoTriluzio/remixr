import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Sparkles, Send, Undo2, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import { controlForPath, formatValue, getIn } from "../lib/effects";
import { useRemixStore, type ChatMessage } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";
import type { LLMStatus } from "../lib/types";

const GENRES = ["house", "lofi", "rock", "trap", "pop", "techno", "ambient"];

export function PromptPanel() {
  const { messages, thinking, pushMessage, setThinking, applyParams } = useRemixStore();
  const analysis = useTrackStore((s) => s.analysis);
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("");
  const status = useLLMStatus();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  const send = async () => {
    const text = prompt.trim();
    if (!text || thinking) return;
    setPrompt("");
    pushMessage({ role: "user", text });
    setThinking(true);
    // Snapshot: the user may keep turning knobs while the model thinks.
    const before = useRemixStore.getState().params;
    try {
      const res = await api.interpret({
        prompt: text,
        current_params: before,
        genre: genre || null,
        bpm: analysis?.bpm ?? null,
        key: analysis?.key ?? null,
      });
      applyParams(res.params, res.changed_fields);
      pushMessage({
        role: "assistant",
        text: res.explanation,
        before,
        after: res.params,
        changed: res.changed_fields,
      });
    } catch (e) {
      pushMessage({ role: "error", text: (e as Error).message });
    } finally {
      setThinking(false);
    }
  };

  return (
    <section className="flex-1 flex flex-col bg-bg min-w-0">
      <div className="h-9 border-b border-line bg-bg-panel/95 backdrop-blur px-3 flex items-center justify-between">
        <span className="text-xs font-mono tracking-wider text-white/60 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-accent" /> AI REMIX
        </span>
        <StatusBadge status={status} />
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !thinking && (
          <div className="text-white/30 text-sm italic">
            Descrivi il remix che vuoi (es. "versione lo-fi chillhop, più calda e più lenta").
            <br />Le modifiche ai parametri compaiono qui e sono evidenziate nel rack.
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
                void send();
              }
            }}
            placeholder="Descrivi il remix… (Invio = invia, Shift+Invio = a capo)"
            maxLength={2000}
            className="flex-1 bg-bg-card border border-line rounded-md px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => void send()}
            disabled={thinking || !prompt.trim()}
            className="bg-accent hover:brightness-110 disabled:opacity-40 rounded-md px-4 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-white/40">Genre:</span>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="bg-bg-card border border-line rounded text-xs px-2 py-1"
          >
            <option value="">none</option>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
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
    <div className="bg-bg-card border border-line rounded-md px-3 py-2 text-sm space-y-2">
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
      {m.before && m.changed && m.changed.length > 0 && (
        <button
          onClick={() => applyParams(m.before!, [])}
          className="text-xs text-white/40 hover:text-white flex items-center gap-1"
          title="Ripristina i parametri di prima di questa risposta"
        >
          <Undo2 className="w-3 h-3" /> annulla
        </button>
      )}
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

function StatusBadge({ status }: { status: LLMStatus | null }) {
  if (!status) return <span className="text-xs text-white/30">LLM: backend offline</span>;
  const model = status.model?.replace(/\.gguf$/i, "") ?? "nessun modello";
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
  return (
    <span className="text-xs text-white/40 flex items-center gap-1.5 min-w-0" title={status.error ?? model}>
      <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      <span className="truncate max-w-[220px]">{model}</span>
      <span className="text-white/25">· {label}</span>
    </span>
  );
}

/** Poll /llm/status while the model is loading, then stop. */
function useLLMStatus(): LLMStatus | null {
  const [status, setStatus] = useState<LLMStatus | null>(null);
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
  }, [thinking]); // re-check after each request (first one may have loaded the model)

  return status;
}
