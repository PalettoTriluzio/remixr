// The effect cards of one chain, in signal-flow order (fixed in the backend,
// CLAUDE.md §DSP chain). Used by the remix/master rack and by flip tracks.
import { EFFECTS, INPUT_GAIN } from "../lib/effects";
import { defaultChain } from "../lib/types";
import { EffectCard, type ChainBinding } from "./EffectCard";
import { Knob } from "./Knob";

const TIME_PITCH = EFFECTS.filter((e) => e.id === "tempo" || e.id === "pitch");
const COLOUR = EFFECTS.filter((e) => e.id !== "tempo" && e.id !== "pitch");

export function ChainRack({ binding, noTempo = false }: { binding: ChainBinding; noTempo?: boolean }) {
  const { chain, onSet, isHighlighted = () => false } = binding;
  return (
    <>
      {TIME_PITCH.filter((e) => !(noTempo && e.id === "tempo")).map((e) => <EffectCard key={e.id} def={e} binding={binding} />)}

      <div className="bg-bg-card border border-line rounded-md px-2 py-1.5 flex items-center gap-3">
        <span className="flex-1 text-sm font-medium">Input</span>
        <Knob
          def={INPUT_GAIN}
          value={chain.input_gain_db}
          defaultValue={defaultChain().input_gain_db}
          onChange={(v) => onSet(INPUT_GAIN.key, v)}
          highlight={isHighlighted(INPUT_GAIN.key)}
        />
      </div>

      {COLOUR.map((e) => <EffectCard key={e.id} def={e} binding={binding} />)}
    </>
  );
}
