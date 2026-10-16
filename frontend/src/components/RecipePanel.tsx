// AI FLIP (F11): a sentence →
//   "nuovo flip": a recipe (sections, samples, effects, generated parts) → a whole project
//   "modifica":   operations on the current project (sections, parts, effects, automation…)
// Every answer can be listened to again (variants) and edited by hand afterwards.
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Dice5, Play, Send, Sparkles, X } from "lucide-react";
import { SOURCE_STYLE } from "../lib/flip";
import { applyAi, askAi, rebuildRecipe, type AiMode } from "../lib/flipActions";
import { useFlipStore, type RecipeMessage } from "../lib/flipStore";
import { useStemsStore } from "../lib/stemsStore";
import type { FlipRecipe, RecipeFx } from "../lib/types";

const EXAMPLES: Record<AiMode, string[]> = {
  recipe: [
    "rifalla drill a 142, tieni solo il ritornello, intro con voce filtrata",
    "versione lo-fi notturna, voce lontana e accordi jazz",
    "afro solare a 105 con la strofa in loop di 2 battute",
    "house a 124, ritornello tagliato a stutter sul drop",
  ],
  edit: [
    "aggiungi un break di 4 battute dopo il ritornello",
    "togli l'arpeggio e fai pompare gli accordi sulla cassa",
    "voce un'ottava sopra nell'outro",
    "filtro che si apre nell'intro e fade out alla fine",
  ],
};
const STYLE_LABEL: Record<FlipRecipe["style"], string> = {
  trap: "Trap", drill: "Drill", boombap: "Boom bap", lofi: "Lo-fi", house: "House", reggaeton: "Reggaeton", afro: "Afro", pop: "Pop",
};
const MOOD_LABEL: Record<FlipRecipe["mood"], string> = { dark: "scuro", sad: "malinconico", epic: "epico", happy: "solare", dreamy: "sognante" };
const FX_LABEL: Record<RecipeFx, string> = {
  none: "", filtered: "filtrata", telephone: "telefono", reversed: "al contrario", stutter: "stutter",
  octave_up: "+8va", octave_down: "−8va", harmony: "armonia", tuned: "intonata",
};
const PART_LABEL = { drums: "beat", bass: "basso", chords: "accordi", arp: "arpeggio" } as const;
const ENERGY_DOTS = { low: "●○○", mid: "●●○", high: "●●●" } as const;

export function RecipePanel() {
  const recipes = useFlipStore((s) => s.recipes);
  const thinking = useFlipStore((s) => s.thinking);
  const setAiOpen = useFlipStore((s) => s.setAiOpen);
  const hasStems = useStemsStore((s) => s.job?.status === "done");
  const hasContent = useFlipStore((s) => !!s.project?.tracks.some((t) => t.clips.length > 0 || t.patterns.length > 0));
  const [prompt, setPrompt] = useState("");
  const [variants, setVariants] = useState(false);
  const [picked, setPicked] = useState<AiMode | null>(null);
  // Default: change what is there; an empty project can only be built.
  const mode: AiMode = !hasContent ? "recipe" : picked ?? "edit";
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [recipes.length, thinking]);

  const send = (text = prompt.trim()) => {
    if (!text || thinking) return;
    setPrompt("");
    void askAi(text, variants ? 3 : 1, mode);
  };

  return (
    <aside className="w-96 shrink-0 border-l border-line bg-bg flex flex-col min-h-0">
      <div className="h-9 shrink-0 border-b border-line bg-bg-panel px-3 flex items-center justify-between">
        <span className="text-xs font-mono tracking-wider text-white/60 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-accent-hot" /> AI FLIP
        </span>
        <button onClick={() => setAiOpen(false)} className="w-6 h-6 rounded hover:bg-bg-hover flex items-center justify-center text-white/40" title="Nascondi">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {recipes.length === 0 && !thinking && (
          <div className="text-white/35 text-xs space-y-2">
            {mode === "recipe" ? (
              <>
                <p>Descrivi il flip: l'AI scrive una ricetta (sezioni, pezzi dell'originale, effetti, strumentale) e la costruisce sulla timeline. Poi puoi cambiare tutto a mano.</p>
                <p className="text-white/50">Il progetto attuale viene sostituito (Ctrl+Z per tornare indietro).</p>
              </>
            ) : (
              <p>Chiedi una modifica al flip che hai: sezioni nuove o tolte, parti, effetti sulla voce, automazioni, sidechain, tempo. Il resto, compresi i tuoi ritocchi a mano, resta com'è.</p>
            )}
            {!hasStems && <p className="text-accent-hot/80">Stems non separati: l'AI potrà usare solo il mix intero. Separali dalla vista REMIX per tenere solo la voce.</p>}
            <div className="space-y-1 pt-1">
              {EXAMPLES[mode].map((e) => (
                <button key={e} onClick={() => send(e)} className="block w-full text-left px-2 py-1.5 rounded bg-bg-card hover:bg-bg-hover text-white/60">
                  “{e}”
                </button>
              ))}
            </div>
          </div>
        )}
        {recipes.map((m) => <Answer key={m.id} m={m} />)}
        {thinking && (
          <div className="flex items-center gap-1.5 text-xs text-white/50">
            <Sparkles className="w-3.5 h-3.5 text-accent-hot animate-pulse" /> Scrivo la ricetta…
          </div>
        )}
      </div>

      <div className="border-t border-line p-2 space-y-2 bg-bg-panel">
        <div className="flex rounded bg-bg-card p-0.5 text-[11px] font-mono">
          {(["edit", "recipe"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setPicked(m)}
              disabled={m === "edit" && !hasContent}
              className={clsx("flex-1 h-6 rounded disabled:opacity-30", mode === m ? "bg-accent-hot/40 text-white" : "text-white/50 hover:text-white")}
              title={m === "edit" ? "Cambia il flip attuale, il resto resta" : "Costruisce un flip nuovo da zero (sostituisce il progetto)"}
            >
              {m === "edit" ? "modifica questo flip" : "nuovo flip"}
            </button>
          ))}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={3}
          placeholder={`es. ${EXAMPLES[mode][0]}`}
          className="w-full resize-none bg-bg-card border border-line rounded px-2 py-1.5 text-sm placeholder:text-white/25"
        />
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-white/55" title="Tre ricette diverse dalla stessa frase">
            <input type="checkbox" checked={variants} onChange={(e) => setVariants(e.target.checked)} /> 3 varianti
          </label>
          <div className="flex-1" />
          <button
            onClick={() => send()}
            disabled={thinking || !prompt.trim()}
            className="flex items-center gap-1.5 px-3 h-7 rounded bg-accent-hot/70 hover:bg-accent-hot text-white disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" /> {mode === "edit" ? "Modifica" : "Flippa"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Answer({ m }: { m: RecipeMessage }) {
  const active = useFlipStore((s) => s.activeRecipe === m.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!m.res) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-white/50">“{m.prompt}”</p>
        <p className="text-xs text-accent-hot">{m.error}</p>
      </div>
    );
  }
  const res = m.res;
  const r = res.recipe;

  const rebuild = async () => {
    setBusy(true);
    setErr(null);
    try {
      await rebuildRecipe(m.id);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className={clsx("rounded-lg border p-2.5 space-y-2 text-xs", active ? "border-accent-hot/60 bg-accent-hot/[0.06]" : "border-line bg-bg-panel")}>
      <p className="text-white/45">“{m.prompt}”{m.variant ? ` · variante ${m.variant}` : ""}</p>
      <p className="text-white/85 text-[13px] leading-snug">{res.explanation}</p>
      {res.applied && (
        <div className="space-y-0.5 font-mono text-[11px] text-white/65">
          {res.applied.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
      {r && <RecipeSummary r={r} />}
      {res.notes.length > 0 && <p className="text-white/40">Nota: {res.notes.join("; ")}.</p>}
      <div className="flex items-center gap-1.5 pt-0.5">
        {!active && (
          <button onClick={() => applyAi(m)} className="flex items-center gap-1 px-2 h-6 rounded bg-accent-hot/30 hover:bg-accent-hot/50 text-white">
            <Play className="w-3 h-3" /> ascolta questa
          </button>
        )}
        {active && <span className="text-accent-hot font-mono text-[10px]">● SULLA TIMELINE</span>}
        {r && (
          <button
            onClick={() => void rebuild()}
            disabled={busy}
            className="flex items-center gap-1 px-2 h-6 rounded bg-bg-card hover:bg-bg-hover text-white/70 disabled:opacity-40"
            title="Stessa ricetta, altro strumentale (niente AI, istantaneo)"
          >
            <Dice5 className="w-3 h-3" /> altro strumentale
          </button>
        )}
      </div>
      {err && <p className="text-accent-hot">{err}</p>}
    </div>
  );
}

function RecipeSummary({ r }: { r: FlipRecipe }) {
  const bars = r.sections.reduce((a, s) => a + s.bars, 0);
  return (
    <>
      <p className="font-mono text-[11px] text-white/55">
        {STYLE_LABEL[r.style]} · {r.bpm} BPM · {MOOD_LABEL[r.mood]} · armonia {r.harmony === "song" ? "dalla canzone" : "nuova"}
        {r.transpose !== 0 && ` · ${r.transpose > 0 ? "+" : ""}${r.transpose} st`} · {bars} battute
      </p>
      <div className="space-y-0.5">
        {r.sections.map((s, i) => (
          <div key={i} className="flex items-baseline gap-2 font-mono text-[11px]">
            <span className="w-20 shrink-0 truncate text-white/80" title={s.name}>{s.name}</span>
            <span className="w-8 shrink-0 text-white/40">{s.bars}b</span>
            <span className="w-8 shrink-0 text-accent-hot/70" title="energia">{ENERGY_DOTS[s.energy]}</span>
            <span className="text-white/55 min-w-0">
              {s.keep.length > 0 && s.sample !== "none" ? (
                <>
                  {s.keep.map((k) => <span key={k} style={{ color: SOURCE_STYLE[k].color }}>{SOURCE_STYLE[k].label.toLowerCase()} </span>)}
                  <span className="text-white/35">da {s.sample === "auto" ? "hook" : s.sample} ({s.sample_bars}b)</span>
                  {s.fx.length > 0 && <span className="text-white/45"> {s.fx.map((f) => FX_LABEL[f]).join(", ")}</span>}
                </>
              ) : <span className="text-white/30">niente originale</span>}
              {s.parts.length > 0 && <span className="text-white/40"> + {s.parts.map((p) => PART_LABEL[p]).join(", ")}</span>}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
