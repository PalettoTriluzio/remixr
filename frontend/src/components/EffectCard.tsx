import { Power } from "lucide-react";

interface Props { label: string; }

export function EffectCard({ label }: Props) {
  return (
    <div className="bg-bg-card border border-line rounded-md p-3 hover:border-white/20 transition">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <button className="text-white/30 hover:text-accent">
          <Power className="w-4 h-4" />
        </button>
      </div>
      <div className="text-xs text-white/30 italic">params UI in F3</div>
    </div>
  );
}
