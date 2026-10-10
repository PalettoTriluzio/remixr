import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Power, RotateCcw } from "lucide-react";
import { getIn, type EffectDef } from "../lib/effects";
import { useRemixStore } from "../lib/remixStore";
import { defaultChain } from "../lib/types";
import { Knob } from "./Knob";

const DEFAULTS = defaultChain();

export function EffectCard({ def }: { def: EffectDef }) {
  const effect = useRemixStore((s) => s.params.global_chain[def.id]);
  const highlighted = useRemixStore((s) => s.highlighted);
  const setParam = useRemixStore((s) => s.setParam);
  const resetEffect = useRemixStore((s) => s.resetEffect);
  // null = follow the bypass state (open when enabled); set by the chevron.
  const [open, setOpen] = useState<boolean | null>(null);

  const enabled = effect.enabled;
  const expanded = open ?? enabled;
  useEffect(() => setOpen(null), [enabled]);
  const touched = [...highlighted].some((p) => p.startsWith(`global_chain.${def.id}.`));

  return (
    <div
      className={clsx(
        "bg-bg-card border rounded-md transition",
        touched ? "border-accent-hot/70" : enabled ? "border-accent/50" : "border-line hover:border-white/20",
      )}
    >
      <div className="flex items-center gap-1.5 px-2 h-8">
        <button
          onClick={() => setOpen(!expanded)}
          className="flex-1 flex items-center gap-1 text-left text-sm font-medium"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-white/40" /> : <ChevronRight className="w-3.5 h-3.5 text-white/40" />}
          <span className={enabled ? "text-white" : "text-white/50"}>{def.label}</span>
          {touched && <span className="ml-1 text-[9px] font-mono text-accent-hot">AI</span>}
        </button>
        <button
          onClick={() => resetEffect(def.id)}
          title="Reset ai default"
          className="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white hover:bg-bg-hover"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
        <button
          onClick={() => setParam(`${def.id}.enabled`, !enabled)}
          title={enabled ? "Bypass" : "Attiva"}
          className={clsx(
            "w-6 h-6 rounded flex items-center justify-center hover:bg-bg-hover",
            enabled ? "text-accent" : "text-white/30 hover:text-white",
          )}
        >
          <Power className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-x-1 gap-y-2 px-2 pb-2">
          {def.controls.map((c) => (
            <Knob
              key={c.key}
              def={c}
              value={getIn(effect, c.key) as number}
              defaultValue={getIn(DEFAULTS[def.id], c.key) as number}
              onChange={(v) => setParam(`${def.id}.${c.key}`, v)}
              dim={!enabled}
              highlight={highlighted.has(`global_chain.${def.id}.${c.key}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
