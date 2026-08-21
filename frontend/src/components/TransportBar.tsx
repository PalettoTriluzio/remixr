import { Play, Pause, Repeat, GitCompare, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTrackStore } from "../lib/store";
import { formatDuration } from "../lib/format";

export function TransportBar() {
  const { track, wavesurfer, isPlaying, currentTime, togglePlay } = useTrackStore();
  const [volume, setVolume] = useState(80);

  const disabled = !wavesurfer;

  useEffect(() => {
    if (wavesurfer) wavesurfer.setVolume(volume / 100);
  }, [wavesurfer, volume]);

  return (
    <footer className="h-12 shrink-0 border-t border-line bg-bg-panel flex items-center px-4 gap-3">
      <button
        disabled={disabled}
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-accent hover:brightness-110 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
      </button>
      <button disabled className="w-8 h-8 rounded hover:bg-bg-hover flex items-center justify-center disabled:opacity-40">
        <Repeat className="w-4 h-4" />
      </button>
      <button disabled className="w-8 h-8 rounded hover:bg-bg-hover flex items-center justify-center text-xs disabled:opacity-40">
        <GitCompare className="w-4 h-4" />
      </button>
      <span className="text-xs font-mono text-white/40 ml-2">A/B compare (F3)</span>

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
