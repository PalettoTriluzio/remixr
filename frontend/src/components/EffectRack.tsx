import { EffectCard } from "./EffectCard";

const EFFECTS = [
  { id: "hp", label: "High Pass" },
  { id: "eq", label: "EQ 3-Band" },
  { id: "comp", label: "Compressor" },
  { id: "distortion", label: "Distortion" },
  { id: "lp", label: "Low Pass" },
  { id: "delay", label: "Delay" },
  { id: "reverb", label: "Reverb" },
  { id: "stereo", label: "Stereo Width" },
  { id: "pitch", label: "Pitch" },
  { id: "tempo", label: "Tempo" },
  { id: "limiter", label: "Limiter" },
];

export function EffectRack() {
  return (
    <aside className="w-80 shrink-0 border-r border-line bg-bg overflow-y-auto">
      <div className="sticky top-0 bg-bg-panel/95 backdrop-blur border-b border-line px-3 h-9 flex items-center justify-between">
        <span className="text-xs font-mono tracking-wider text-white/60">EFFECT RACK</span>
        <span className="text-xs text-white/30">global chain</span>
      </div>
      <div className="p-2 space-y-2">
        {EFFECTS.map((e) => (
          <EffectCard key={e.id} label={e.label} />
        ))}
      </div>
    </aside>
  );
}
