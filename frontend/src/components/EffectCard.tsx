import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Power, RotateCcw } from "lucide-react";
import { getIn, type EffectDef, type EffectId } from "../lib/effects";
import { defaultChain, type EffectChain } from "../lib/types";
import { Knob } from "./Knob";

const DEFAULTS = defaultChain();

export interface ChainBinding {
  chain: EffectChain;
  /** `path` is inside the chain, e.g. "reverb.wet". */
  onSet: (path: string, value: unknown) => void;
  onReset: (id: EffectId) => void;
  /** Touched by the AI (pink) — paths inside the chain. */
  isHighlighted?: (path: string) => boolean;
}

export function EffectCard({ def, binding }: { def: EffectDef; binding: ChainBinding }) {
  const { chain, onSet, onReset, isHighlighted = () => false } = binding;
  const effect = chain[def.id];
  // null = follow the bypass state (open when enabled); set by the chevron.
  const [open, setOpen] = useState<boolean | null>(null);

  const enabled = effect.enabled;
  const expanded = open ?? enabled;
  useEffect(() => setOpen(null), [enabled]);
  const touched = def.controls.some((c) => isHighlighted(`${def.id}.${c.key}`)) || isHighlighted(`${def.id}.enabled`);

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
          onClick={() => onReset(def.id)}
          title="Reset ai default"
          className="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white hover:bg-bg-hover"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
        <button
          onClick={() => onSet(`${def.id}.enabled`, !enabled)}
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
              onChange={(v) => onSet(`${def.id}.${c.key}`, v)}
              dim={!enabled}
              highlight={isHighlighted(`${def.id}.${c.key}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
