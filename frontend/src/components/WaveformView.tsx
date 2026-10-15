import { useEffect, useRef } from "react";
import clsx from "clsx";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import { X } from "lucide-react";
import { audioUrl, useTrackStore } from "../lib/store";
import { bindWavesurfer } from "../lib/player";
import { registerMedia, unregisterMedia } from "../lib/analyser";
import { VIEW_SAMPLE_RATE } from "../lib/peaks";
import { useRemixStore } from "../lib/remixStore";
import { formatDuration } from "../lib/format";
import { Dropzone } from "./Dropzone";
import { CompareLane } from "./CompareLane";
import { SpectrumView } from "./SpectrumView";
import { LaneLabel } from "./LaneLabel";
import { GridOverlay, StructureLane } from "./StructureLane";
import { snapToBar, useStemsStore } from "../lib/stemsStore";
import { useFlipStore } from "../lib/flipStore";
import { SourceBar } from "./SourceBar";

const PREVIEW_MAX_SEC = 30;

// A lane colours: full colour while A is playing, greyed out on B.
const A_ACTIVE = { waveColor: "#5cd4ff", progressColor: "#2b8fb3" };
const A_IDLE = { waveColor: "#3a4250", progressColor: "#2a313d" };

export function WaveformView() {
  const { track, analysis, reset, setWavesurfer, setOriginalBuffer, wavesurfer } = useTrackStore();
  const region = useRemixStore((s) => s.region);
  const setRegion = useRemixStore((s) => s.setRegion);
  const abMode = useRemixStore((s) => s.abMode);
  const view = useRemixStore((s) => s.previewView);
  const flipView = useFlipStore((s) => s.view === "flip");
  const containerRef = useRef<HTMLDivElement>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);

  useEffect(() => {
    if (!track || !containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      ...(useRemixStore.getState().abMode === "A" ? A_ACTIVE : A_IDLE),
      cursorColor: "#ffffff",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      height: "auto",
      normalize: true,
      sampleRate: VIEW_SAMPLE_RATE,
      url: audioUrl(track.track_id),
    });

    // One region at a time = the preview / loop window (max 30 s, the
    // backend's preview cap).
    const regions = ws.registerPlugin(RegionsPlugin.create());
    regions.enableDragSelection({ color: "rgba(124, 92, 255, 0.18)" });
    const commit = (r: Region) => {
      let { start, end } = r;
      const { snap, structure } = useStemsStore.getState();
      const bars = snap ? structure?.downbeats ?? [] : [];
      if (bars.length > 1) {
        // Whole bars: start on the nearest bar line, end on the nearest one
        // after it, within the 30 s cap.
        start = snapToBar(start, bars);
        const ends = bars.filter((b) => b > start + 0.05 && b - start <= PREVIEW_MAX_SEC);
        if (ends.length) end = snapToBar(end, ends);
      }
      if (end - start > PREVIEW_MAX_SEC) end = start + PREVIEW_MAX_SEC;
      if (Math.abs(start - r.start) > 1e-3 || Math.abs(end - r.end) > 1e-3) r.setOptions({ start, end });
      setRegion({ start, end });
    };
    regions.on("region-created", (r) => {
      regions.getRegions().forEach((o) => { if (o !== r) o.remove(); });
      commit(r);
    });
    regions.on("region-updated", commit);
    regionsRef.current = regions;

    ws.on("decode", () => setOriginalBuffer(ws.getDecodedData()));
    const media = ws.getMediaElement();
    registerMedia(media);

    bindWavesurfer(ws);
    setWavesurfer(ws);

    return () => {
      regionsRef.current = null;
      unregisterMedia(media);
      setWavesurfer(null);
      ws.destroy();
    };
  }, [track?.track_id, setWavesurfer, setOriginalBuffer, setRegion]);

  // Region cleared from the transport bar, or set from outside (click on a
  // section): mirror it on the waveform.
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions) return;
    if (!region) {
      regions.clearRegions();
      return;
    }
    const shown = regions.getRegions()[0];
    if (shown && Math.abs(shown.start - region.start) < 1e-3 && Math.abs(shown.end - region.end) < 1e-3) return;
    regions.clearRegions();
    regions.addRegion({ start: region.start, end: region.end, color: "rgba(124, 92, 255, 0.18)" });
  }, [region, wavesurfer]);

  useEffect(() => {
    wavesurfer?.setOptions(abMode === "A" ? A_ACTIVE : A_IDLE);
  }, [abMode, wavesurfer]);

  if (!track) {
    return (
      <div className="h-56 shrink-0 border-b border-line bg-bg-panel">
        <Dropzone />
      </div>
    );
  }

  const isB = abMode === "B";
  // Preview window on the original, shown when there is no region to show it.
  const win = !region && view && track.duration_sec > 0
    ? { left: (view.start / track.duration_sec) * 100, width: ((view.end - view.start) / track.duration_sec) * 100 }
    : null;

  return (
    <div className="shrink-0 border-b border-line bg-bg-panel flex relative">
      {/* mode strip: cyan = original, violet = remix */}
      <div className={clsx("absolute inset-x-0 top-0 h-0.5 z-10 transition-colors duration-300", isB ? "bg-accent" : "bg-accent-cool")} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* A lane: whole original track */}
        <div className={clsx("h-28 relative transition-opacity duration-300", isB && "opacity-50 hover:opacity-80")}>
          <LaneLabel active={!isB} className="text-accent-cool" text="A · ORIGINALE" />
          <div className="absolute inset-0 px-4 pt-5 pb-2">
            <div className="relative w-full h-full">
              <div ref={containerRef} className="absolute inset-0" />
              <GridOverlay />
              {win && (
                <div
                  className="absolute inset-y-0 border border-dashed border-accent/60 bg-accent/5 rounded-sm pointer-events-none"
                  style={{ left: `${win.left}%`, width: `${win.width}%` }}
                  title="Finestra della preview B"
                />
              )}
            </div>
          </div>
        </div>
        <StructureLane />
        {flipView ? <SourceBar /> : <CompareLane />}
      </div>

      <aside className="w-64 shrink-0 border-l border-line flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 h-8 border-b border-line">
          <span className="flex-1 truncate text-xs font-mono text-white/60" title={track.filename}>
            {track.filename}
          </span>
          <button
            onClick={reset}
            className="w-5 h-5 rounded hover:bg-bg-hover flex items-center justify-center text-white/50 hover:text-white"
            title="Rimuovi traccia"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs font-mono border-b border-line">
          <Metric label="BPM" value={analysis ? analysis.bpm.toFixed(1) : "…"} />
          <Metric label="KEY" value={analysis?.key ?? "…"} />
          <Metric label="DUR" value={formatDuration(track.duration_sec)} />
          <Metric label="SR" value={`${track.sample_rate}Hz`} />
        </div>
        <div
          className={clsx(
            "mx-3 mt-2 rounded px-2 py-1 text-xs font-mono font-semibold tracking-widest text-center transition-colors duration-300",
            isB ? "bg-accent/25 text-white shadow-[0_0_12px_rgba(124,92,255,0.45)]" : "bg-accent-cool/15 text-accent-cool",
          )}
        >
          {isB ? "▶ B · REMIX" : "▶ A · ORIGINALE"}
        </div>
        <SpectrumView />
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-white/30">{label}</span>
      <span className="text-white/80 truncate">{value}</span>
    </div>
  );
}
