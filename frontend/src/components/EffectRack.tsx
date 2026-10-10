import { RotateCcw } from "lucide-react";
import { EFFECTS, INPUT_GAIN } from "../lib/effects";
import { useRemixStore } from "../lib/remixStore";
import { defaultChain } from "../lib/types";
import { EffectCard } from "./EffectCard";
import { Knob } from "./Knob";

// Chain order is fixed in the backend (CLAUDE.md §DSP chain): cards follow it,
// no reordering.
const TIME_PITCH = EFFECTS.filter((e) => e.id === "tempo" || e.id === "pitch");
const COLOUR = EFFECTS.filter((e) => e.id !== "tempo" && e.id !== "pitch");

export function EffectRack() {
  const gain = useRemixStore((s) => s.params.global_chain.input_gain_db);
  const gainHighlighted = useRemixStore((s) => s.highlighted.has("global_chain.input_gain_db"));
  const setParam = useRemixStore((s) => s.setParam);
  const resetAll = useRemixStore((s) => s.resetAll);

  return (
    <aside className="w-80 shrink-0 border-r border-line bg-bg overflow-y-auto">
      <div className="sticky top-0 z-10 bg-bg-panel/95 backdrop-blur border-b border-line px-3 h-9 flex items-center justify-between">
        <span className="text-xs font-mono tracking-wider text-white/60">EFFECT RACK</span>
        <button
          onClick={resetAll}
          className="text-xs text-white/40 hover:text-white flex items-center gap-1"
          title="Tutti gli effetti ai default"
        >
          <RotateCcw className="w-3 h-3" /> reset all
        </button>
      </div>
      <div className="p-2 space-y-2">
        {TIME_PITCH.map((e) => <EffectCard key={e.id} def={e} />)}

        <div className="bg-bg-card border border-line rounded-md px-2 py-1.5 flex items-center gap-3">
          <span className="flex-1 text-sm font-medium">Input</span>
          <Knob
            def={INPUT_GAIN}
            value={gain}
            defaultValue={defaultChain().input_gain_db}
            onChange={(v) => setParam(INPUT_GAIN.key, v)}
            highlight={gainHighlighted}
          />
        </div>

        {COLOUR.map((e) => <EffectCard key={e.id} def={e} />)}
      </div>
    </aside>
  );
}
