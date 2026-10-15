// Flip view, under the original's waveform: the selected slice (region) and
// one button per source to drop it on the timeline at the playhead.
import { Play, Scissors } from "lucide-react";
import { SOURCE_STYLE, barBeatLabel, beatsBetween, sourceGrid } from "../lib/flip";
import { addFromRegion } from "../lib/flipActions";
import { flipPlayer } from "../lib/flipPlayer";
import { useFlipStore } from "../lib/flipStore";
import { formatDuration } from "../lib/format";
import { player } from "../lib/player";
import { useRemixStore } from "../lib/remixStore";
import { barOf, useStemsStore } from "../lib/stemsStore";
import { useTrackStore } from "../lib/store";
import { STEM_NAMES, type FlipSource } from "../lib/types";

export function SourceBar() {
  const region = useRemixStore((s) => s.region);
  const track = useTrackStore((s) => s.track);
  const analysis = useTrackStore((s) => s.analysis);
  const structure = useStemsStore((s) => s.structure);
  const job = useStemsStore((s) => s.job);
  const startStems = useStemsStore((s) => s.start);
  const playhead = useFlipStore((s) => s.playhead);
  const bpb = useFlipStore((s) => s.project?.beats_per_bar ?? 4);

  const stems = job?.status === "done";
  const sources: FlipSource[] = stems ? [...STEM_NAMES, "mix"] : ["mix"];

  const listen = () => {
    if (!region) return;
    flipPlayer.pause();
    player.seekA(region.start);
    if (!useTrackStore.getState().isPlaying) player.togglePlay();
  };

  return (
    <div className="h-10 border-t border-line/60 px-4 flex items-center gap-2 text-xs font-mono">
      <Scissors className="w-3.5 h-3.5 text-accent-hot shrink-0" />
      {!region ? (
        <span className="text-white/35">
          scegli un pezzo: trascina sulla waveform A o clicca una sezione · poi mandalo sulla timeline
        </span>
      ) : (
        <>
          <span className="text-white/70 shrink-0">
            {formatDuration(region.start)}–{formatDuration(region.end)}
            {structure && structure.downbeats.length > 0 &&
              ` · battute ${Math.max(1, barOf(region.start, structure.downbeats))}–${Math.max(1, barOf(region.end - 0.05, structure.downbeats))}`}
            {track && ` · ${beatsBetween(region.start, region.end, sourceGrid(structure, analysis, track.duration_sec))} beat`}
          </span>
          <button onClick={listen} title="Ascolta il pezzo nell'originale" className="w-6 h-6 rounded hover:bg-bg-hover flex items-center justify-center text-accent-cool">
            <Play className="w-3.5 h-3.5" fill="currentColor" />
          </button>
          <span className="text-white/30">→ timeline a {barBeatLabel(playhead, bpb)}:</span>
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => addFromRegion(s, region)}
              className="px-2 h-6 rounded border text-white/85 hover:text-white"
              style={{ borderColor: `${SOURCE_STYLE[s].color}99`, background: `${SOURCE_STYLE[s].color}22` }}
            >
              {SOURCE_STYLE[s].label}
            </button>
          ))}
          {!stems && (
            job?.status === "pending" || job?.status === "running" ? (
              <span className="text-white/35">separazione stems {Math.round((job.progress ?? 0) * 100)}%…</span>
            ) : (
              <button onClick={() => void startStems()} className="text-white/40 hover:text-white underline underline-offset-2">
                separa gli stems per usare voce, batteria, basso
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}
