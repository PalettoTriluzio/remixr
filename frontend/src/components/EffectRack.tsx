import { RotateCcw } from "lucide-react";
import { useRemixStore } from "../lib/remixStore";
import { ChainRack } from "./ChainRack";
import type { ChainBinding } from "./EffectCard";
import { StemsPanel } from "./StemsPanel";

/** The remix chain (params.global_chain) as a rack binding. */
export function useRemixBinding(): ChainBinding {
  const chain = useRemixStore((s) => s.params.global_chain);
  const highlighted = useRemixStore((s) => s.highlighted);
  const setParam = useRemixStore((s) => s.setParam);
  const resetEffect = useRemixStore((s) => s.resetEffect);
  return {
    chain,
    onSet: setParam,
    onReset: resetEffect,
    isHighlighted: (p) => highlighted.has(`global_chain.${p}`),
  };
}

/** The remix rack. In flip mode the same chain is the master bus. */
export function EffectRack({ title = "EFFECT RACK", stems = true }: { title?: string; stems?: boolean }) {
  const resetAll = useRemixStore((s) => s.resetAll);
  const binding = useRemixBinding();

  return (
    <aside className="w-80 shrink-0 border-r border-line bg-bg overflow-y-auto">
      <div className="sticky top-0 z-10 bg-bg-panel/95 backdrop-blur border-b border-line px-3 h-9 flex items-center justify-between">
        <span className="text-xs font-mono tracking-wider text-white/60">{title}</span>
        <button
          onClick={resetAll}
          className="text-xs text-white/40 hover:text-white flex items-center gap-1"
          title="Tutti gli effetti ai default"
        >
          <RotateCcw className="w-3 h-3" /> reset all
        </button>
      </div>
      <div className="p-2 space-y-2">
        {stems && <StemsPanel />}
        <ChainRack binding={binding} />
      </div>
    </aside>
  );
}
