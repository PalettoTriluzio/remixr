import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import { X } from "lucide-react";
import { audioUrl, useTrackStore } from "../lib/store";
import { bindWavesurfer } from "../lib/player";
import { useRemixStore } from "../lib/remixStore";
import { formatDuration } from "../lib/format";
import { Dropzone } from "./Dropzone";

const PREVIEW_MAX_SEC = 30;

export function WaveformView() {
  const { track, analysis, reset, setWavesurfer } = useTrackStore();
  const region = useRemixStore((s) => s.region);
  const setRegion = useRemixStore((s) => s.setRegion);
  const containerRef = useRef<HTMLDivElement>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);

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

    // One region at a time = the preview / loop window (max 30 s, the
    // backend's preview cap).
    const regions = ws.registerPlugin(RegionsPlugin.create());
    regions.enableDragSelection({ color: "rgba(124, 92, 255, 0.18)" });
    const commit = (r: Region) => {
      if (r.end - r.start > PREVIEW_MAX_SEC) r.setOptions({ end: r.start + PREVIEW_MAX_SEC });
      setRegion({ start: r.start, end: r.end });
    };
    regions.on("region-created", (r) => {
      regions.getRegions().forEach((o) => { if (o !== r) o.remove(); });
      commit(r);
    });
    regions.on("region-updated", commit);
    regionsRef.current = regions;

    bindWavesurfer(ws);
    setWavesurfer(ws);

    return () => {
      regionsRef.current = null;
      setWavesurfer(null);
      ws.destroy();
    };
  }, [track?.track_id, setWavesurfer, setRegion]);

  // Region cleared from the transport bar.
  useEffect(() => {
    if (!region) regionsRef.current?.clearRegions();
  }, [region]);

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
