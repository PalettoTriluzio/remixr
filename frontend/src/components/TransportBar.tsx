import { Play, Pause, Repeat, Volume2, X, Loader2, AlertCircle, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTrackStore } from "../lib/store";
import { useRemixStore } from "../lib/remixStore";
import { player } from "../lib/player";
import { formatDuration } from "../lib/format";

export function TransportBar() {
  const { track, wavesurfer, isPlaying, currentTime } = useTrackStore();
  const { abMode, loop, region, setRegion, previewStatus, previewError, amount, setAmount, levelMatch, setLevelMatch } = useRemixStore();
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
        title="Play/pausa (Spazio)"
        className={clsx(
          "w-9 h-9 rounded-full hover:brightness-110 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-300",
          abMode === "B" ? "bg-accent" : "bg-accent-cool text-bg",
        )}
      >
        {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
      </button>
      <button
        disabled={disabled}
        onClick={() => player.setLoop(!loop)}
        title="Loop sulla regione o sulla finestra di preview (L)"
        className={clsx(
          "w-8 h-8 rounded hover:bg-bg-hover flex items-center justify-center disabled:opacity-40",
          loop ? "text-accent" : "text-white/60",
        )}
      >
        <Repeat className="w-4 h-4" />
      </button>

      {/* A/B: original vs remix preview */}
      <div className="flex rounded overflow-hidden border border-line text-xs font-mono" title="Cambia A/B (B)">
        <button
          disabled={disabled}
          onClick={() => player.setMode("A")}
          title="A = originale (B per cambiare)"
          className={clsx(
            "px-3 h-7 disabled:opacity-40 transition-colors",
            abMode === "A" ? "bg-accent-cool/25 text-accent-cool font-semibold" : "text-white/50 hover:bg-bg-hover",
          )}
        >
          A · originale
        </button>
        <button
          disabled={disabled || !canB}
          onClick={() => player.setMode("B")}
          title={canB ? "B = remix (B per cambiare)" : "Nessun effetto attivo: B = A"}
          className={clsx(
            "px-3 h-7 disabled:opacity-40 transition-colors",
            abMode === "B" ? "bg-accent/40 text-white font-semibold" : "text-white/50 hover:bg-bg-hover",
          )}
        >
          B · remix
        </button>
      </div>

      <button
        disabled={disabled}
        onClick={() => setLevelMatch(!levelMatch)}
        title={"Volume pari: A e B suonano allo stesso volume medio, così confronti il carattere e non il volume" +
          " (il più forte sembra sempre migliore). Agisce solo sull'ascolto, non sull'export."}
        className={clsx(
          "w-8 h-8 rounded hover:bg-bg-hover flex items-center justify-center disabled:opacity-40",
          levelMatch ? "text-accent" : "text-white/40",
        )}
      >
        <Scale className="w-4 h-4" />
      </button>

      {/* Intensità: one macro over the whole remix */}
      <label
        className="flex items-center gap-2 text-xs font-mono"
        title="Intensità del remix: 0% = originale, 100% = come nel rack, 150% = spinto. Doppio clic = 100%."
        onDoubleClick={() => setAmount(100)}
      >
        <span className="text-white/40">INTENSITÀ</span>
        <input
          type="range"
          min={0}
          max={150}
          step={1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-32 accent-[#7c5cff]"
        />
        <span className={clsx("w-10 text-right", amount === 100 ? "text-white/60" : "text-accent")}>{amount}%</span>
      </label>

      <span className="text-xs font-mono text-white/40 flex items-center gap-1.5 min-w-0 truncate">
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
              <button onClick={() => setRegion(null)} title="Rimuovi regione (Esc)" className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ) : (
            previewStatus !== "rendering" && <span className="text-white/25">trascina sulla waveform A per scegliere la regione (max 30 s) · Spazio play · B cambia A/B</span>
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
