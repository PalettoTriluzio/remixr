import { Play, Pause, Repeat, Volume2, X, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTrackStore } from "../lib/store";
import { useRemixStore } from "../lib/remixStore";
import { player } from "../lib/player";
import { formatDuration } from "../lib/format";

export function TransportBar() {
  const { track, wavesurfer, isPlaying, currentTime } = useTrackStore();
  const { abMode, loop, region, setRegion, previewStatus, previewError } = useRemixStore();
  const [volume, setVolume] = useState(80);

  const disabled = !wavesurfer;
  const canB = previewStatus === "ready" || player.hasPreview();

  useEffect(() => {
    player.setVolume(volume / 100);
  }, [wavesurfer, volume]);

  return (
    <footer className="h-12 shrink-0 border-t border-line bg-bg-panel flex items-center px-4 gap-3">
      <button
        disabled={disabled}
        onClick={() => player.togglePlay()}
        className="w-9 h-9 rounded-full bg-accent hover:brightness-110 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
      </button>
      <button
        disabled={disabled}
        onClick={() => player.setLoop(!loop)}
        title="Loop sulla regione (o sulla finestra di preview)"
        className={clsx(
          "w-8 h-8 rounded hover:bg-bg-hover flex items-center justify-center disabled:opacity-40",
          loop ? "text-accent" : "text-white/60",
        )}
      >
        <Repeat className="w-4 h-4" />
      </button>

      {/* A/B: original vs remix preview */}
      <div className="flex rounded overflow-hidden border border-line text-xs font-mono">
        <button
          disabled={disabled}
          onClick={() => player.setMode("A")}
          title="A = originale"
          className={clsx("px-2.5 h-7 disabled:opacity-40", abMode === "A" ? "bg-accent-cool/20 text-accent-cool" : "text-white/50 hover:bg-bg-hover")}
        >
          A
        </button>
        <button
          disabled={disabled || !canB}
          onClick={() => player.setMode("B")}
          title={canB ? "B = remix" : "Nessun effetto attivo: B = A"}
          className={clsx("px-2.5 h-7 disabled:opacity-40", abMode === "B" ? "bg-accent/30 text-white" : "text-white/50 hover:bg-bg-hover")}
        >
          B
        </button>
      </div>

      <span className="text-xs font-mono text-white/40 flex items-center gap-1.5 min-w-0">
        {previewStatus === "rendering" && <><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> rendering…</>}
        {previewStatus === "error" && (
          <span className="text-accent-hot flex items-center gap-1 truncate" title={previewError ?? ""}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {previewError}
          </span>
        )}
        {previewStatus !== "error" && track && (
          region ? (
            <span className="flex items-center gap-1">
              region {formatDuration(region.start)}–{formatDuration(region.end)}
              <button onClick={() => setRegion(null)} title="Rimuovi regione" className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ) : (
            previewStatus !== "rendering" && <span className="text-white/25">trascina sulla waveform per una regione (max 30 s)</span>
          )
        )}
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-white/50" />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24"
          disabled={disabled}
        />
      </div>
      <span className="text-xs font-mono text-white/40 w-24 text-right">
        {formatDuration(currentTime)} / {formatDuration(track?.duration_sec ?? 0)}
      </span>
    </footer>
  );
}
