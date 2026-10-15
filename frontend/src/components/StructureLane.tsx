// Song structure on the original's time axis (same horizontal space as the
// A waveform): bar lines over the waveform, then a lane with the sections
// (click = select it as region) and the chords.
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useRemixStore } from "../lib/remixStore";
import { useStemsStore } from "../lib/stemsStore";
import { useTrackStore } from "../lib/store";

const PREVIEW_MAX_SEC = 30;

// One colour per letter: same letter = same material.
const SECTION_COLORS = ["#7c5cff", "#ff5c7c", "#5cd4ff", "#ffb35c", "#5cffa1", "#e05cff", "#c8ff5c", "#5c7cff"];
export const sectionColor = (label: string) =>
  SECTION_COLORS[(label.charCodeAt(0) - 65 + SECTION_COLORS.length) % SECTION_COLORS.length];

const pct = (t: number, duration: number) => `${(t / duration) * 100}%`;

/** Bar lines over the A waveform. Section starts are brighter. */
export function GridOverlay() {
  const structure = useStemsStore((s) => s.structure);
  const duration = useTrackStore((s) => s.track?.duration_sec ?? 0);
  if (!structure || duration <= 0 || structure.downbeats.length === 0) return null;

  const bars = structure.downbeats.length;
  const every = bars > 160 ? 16 : bars > 80 ? 8 : 4;
  const sectionStarts = new Set(structure.sections.map((s) => s.bar_start - 1));

  return (
    <div className="absolute inset-0 pointer-events-none">
      {structure.downbeats.map((t, i) => (
        <div
          key={i}
          className={clsx("absolute inset-y-0 w-px", sectionStarts.has(i) ? "bg-white/40" : i % every === 0 ? "bg-white/20" : "bg-white/[0.07]")}
          style={{ left: pct(t, duration) }}
        >
          {i % every === 0 && (
            <span className="absolute -top-3.5 left-0.5 text-[9px] font-mono text-white/35">{i + 1}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Sections + chords lane, under the A waveform. */
export function StructureLane() {
  const structure = useStemsStore((s) => s.structure);
  const loading = useStemsStore((s) => s.structureLoading);
  const error = useStemsStore((s) => s.structureError);
  const duration = useTrackStore((s) => s.track?.duration_sec ?? 0);
  const region = useRemixStore((s) => s.region);
  const setRegion = useRemixStore((s) => s.setRegion);

  if (!structure) {
    return (
      <div className="h-6 px-4 flex items-center gap-2 text-[10px] font-mono text-white/30 border-t border-line/60">
        {loading && <><Loader2 className="w-3 h-3 animate-spin" /> analisi struttura (battute, sezioni, accordi)…</>}
        {!loading && error && <span className="text-accent-hot truncate" title={error}>struttura: {error}</span>}
      </div>
    );
  }

  const chords = structure.chords.filter((c) => c.chord !== "N");

  return (
    <div className="px-4 border-t border-line/60 relative">
      {loading && (
        <Loader2 className="absolute right-1 top-1 w-3 h-3 animate-spin text-white/30" />
      )}
      {/* sections */}
      <div className="relative h-6 mt-1">
        {structure.sections.map((s, i) => {
          const selected = region && Math.abs(region.start - s.start) < 0.05;
          return (
            <button
              key={i}
              onClick={() => setRegion({ start: s.start, end: Math.min(s.end, s.start + PREVIEW_MAX_SEC) })}
              title={`${s.label} · ${s.name} — battute ${s.bar_start}–${s.bar_end - 1}` +
                ` · energia ${Math.round(s.energy * 100)}%\nClic = usala come regione (max 30 s)`}
              className={clsx(
                "absolute inset-y-0 rounded-sm border text-left px-1 overflow-hidden whitespace-nowrap text-[10px] font-mono transition",
                selected ? "text-white" : "text-white/70 hover:text-white",
              )}
              style={{
                left: pct(s.start, duration),
                width: `calc(${pct(s.end - s.start, duration)} - 2px)`,
                background: `${sectionColor(s.label)}${selected ? "66" : "2e"}`,
                borderColor: `${sectionColor(s.label)}${selected ? "ff" : "66"}`,
              }}
            >
              <span className="font-semibold">{s.label}</span> {s.name}
            </button>
          );
        })}
      </div>
      {/* chords */}
      <div className="relative h-5 my-1">
        {chords.map((c, i) => (
          <div
            key={i}
            title={`${c.chord} (${c.start.toFixed(1)}–${c.end.toFixed(1)} s)`}
            className="absolute inset-y-0 border-l border-white/15 pl-0.5 overflow-hidden whitespace-nowrap text-[10px] font-mono text-white/55 leading-5"
            style={{ left: pct(c.start, duration), width: pct(c.end - c.start, duration) }}
          >
            {c.chord}
          </div>
        ))}
        <span className="absolute right-0 -top-0.5 text-[9px] font-mono text-white/25 pointer-events-none bg-bg-panel/80 px-1">
          {structure.bpm.toFixed(1)} BPM · {structure.key} · {structure.source === "stems" ? "da stems" : "dal mix"}
        </span>
      </div>
    </div>
  );
}
