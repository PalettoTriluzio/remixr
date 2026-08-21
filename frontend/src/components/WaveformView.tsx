import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { X } from "lucide-react";
import { audioUrl, useTrackStore } from "../lib/store";
import { formatDuration } from "../lib/format";
import { Dropzone } from "./Dropzone";

export function WaveformView() {
  const { track, analysis, reset, setWavesurfer, setPlaying, setCurrentTime } = useTrackStore();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!track || !containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#5cd4ff",
      progressColor: "#7c5cff",
      cursorColor: "#ffffff",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      height: 120,
      normalize: true,
      url: audioUrl(track.track_id),
    });

    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));
    ws.on("timeupdate", (t) => setCurrentTime(t));
    setWavesurfer(ws);

    return () => {
      setWavesurfer(null);
      ws.destroy();
    };
  }, [track?.track_id, setWavesurfer, setPlaying, setCurrentTime]);

  if (!track) {
    return (
      <div className="h-40 shrink-0 border-b border-line bg-bg-panel">
        <Dropzone />
      </div>
    );
  }

  return (
    <div className="h-40 shrink-0 border-b border-line bg-bg-panel relative">
      <div ref={containerRef} className="absolute inset-0 px-4 py-3" />

      <div className="absolute top-2 left-3 flex items-center gap-3 text-xs font-mono text-white/60 pointer-events-none">
        <span className="truncate max-w-[280px]" title={track.filename}>
          {track.filename}
        </span>
      </div>

      <div className="absolute top-2 right-3 flex items-center gap-3 text-xs font-mono">
        <Metric label="BPM" value={analysis ? analysis.bpm.toFixed(1) : "…"} />
        <Metric label="KEY" value={analysis?.key ?? "…"} />
        <Metric label="DUR" value={formatDuration(track.duration_sec)} />
        <Metric label="SR" value={`${track.sample_rate}Hz`} />
        <button
          onClick={reset}
          className="ml-1 w-5 h-5 rounded hover:bg-bg-hover flex items-center justify-center text-white/50 hover:text-white pointer-events-auto"
          title="Remove track"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-white/30">{label}:</span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}
