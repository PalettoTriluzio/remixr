// A/B lane: the preview window drawn twice on one time axis.
//   top half    = original window (A)
//   bottom half = remix preview   (B)
// Same absolute scale for both (no normalisation): louder, quieter, longer,
// shorter, smoother or more compressed is visible at a glance. Click the top
// half to listen to A from there, the bottom half for B.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { columns, levels } from "../lib/peaks";
import { player } from "../lib/player";
import { useRemixStore } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";
import { formatDuration } from "../lib/format";
import { LaneLabel } from "./LaneLabel";

const COL_A = { peak: "rgba(92,212,255,0.35)", rms: "rgba(92,212,255,0.85)" };
const COL_B = { peak: "rgba(124,92,255,0.45)", rms: "rgba(170,140,255,1)" };
const DIM = { peak: "rgba(255,255,255,0.10)", rms: "rgba(255,255,255,0.25)" };
const BAR = 3; // px per column (2 bar + 1 gap), in CSS pixels

export function CompareLane() {
  const view = useRemixStore((s) => s.previewView);
  const status = useRemixStore((s) => s.previewStatus);
  const abMode = useRemixStore((s) => s.abMode);
  const original = useTrackStore((s) => s.originalBuffer);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const origDur = view ? view.end - view.start : 0;
  const remixDur = view ? view.buffer.duration : 0;
  const total = Math.max(origDur, remixDur);

  // Canvas size follows the element.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // Draw.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);

    const mid = size.h / 2;
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(0, mid, size.w, 1);
    if (!view || total <= 0) return;

    const half = mid - 2;
    const draw = (data: Float32Array, dir: 1 | -1, col: typeof COL_A) => {
      for (let i = 0; i < data.length / 2; i++) {
        const x = i * BAR;
        const p = data[i * 2] * half;
        const r = data[i * 2 + 1] * half;
        g.fillStyle = col.peak;
        g.fillRect(x, dir < 0 ? mid - p : mid + 1, BAR - 1, p);
        g.fillStyle = col.rms;
        g.fillRect(x, dir < 0 ? mid - r : mid + 1, BAR - 1, r);
      }
    };
    const cols = (dur: number) => Math.floor(((size.w * dur) / total) / BAR);
    const isB = abMode === "B";
    if (original) draw(columns(original, view.start, view.end, cols(origDur)), -1, isB ? DIM : COL_A);
    draw(columns(view.buffer, 0, remixDur, cols(remixDur)), 1, isB ? COL_B : DIM);
  }, [view, original, size, abMode, total, origDur, remixDur]);

  // Cursor: B time inside the preview, or A time when it falls in the window.
  useEffect(() => {
    if (!view || total <= 0) return;
    let raf = 0;
    const tick = () => {
      const el = cursorRef.current;
      if (el) {
        let t: number | null;
        if (useRemixStore.getState().abMode === "B") {
          t = player.remixTime();
        } else {
          const a = useTrackStore.getState().wavesurfer?.getCurrentTime() ?? 0;
          t = a >= view.start && a <= view.end ? a - view.start : null;
        }
        el.style.display = t === null ? "none" : "block";
        if (t !== null) el.style.left = `${Math.min(100, (t / total) * 100)}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view, total]);

  const stats = useMemo(() => {
    if (!view) return null;
    return {
      a: original ? levels(original, view.start, view.end) : null,
      b: levels(view.buffer),
    };
  }, [view, original]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!view) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * total;
    if (e.clientY - rect.top < rect.height / 2) {
      if (t <= origDur) player.seekA(view.start + t);
    } else if (t <= remixDur) {
      player.seekB(t);
    }
  };

  const isB = abMode === "B";
  return (
    <div className={clsx("h-28 relative border-t border-line transition-opacity duration-300", !isB && "opacity-60 hover:opacity-90")}>
      <LaneLabel active={isB} className="text-accent" text="B · REMIX  (sopra A · sotto B)" />

      {view && stats && (
        <div className="absolute top-1 right-4 z-10 flex gap-3 text-[10px] font-mono text-white/50 pointer-events-none">
          <Stat label="durata" a={origDur} b={remixDur} fmt={formatDuration} />
          {stats.a && <Stat label="peak" a={stats.a.peakDb} b={stats.b.peakDb} fmt={db} delta />}
          {stats.a && <Stat label="rms" a={stats.a.rmsDb} b={stats.b.rmsDb} fmt={db} delta />}
          <span className="text-white/30">
            finestra {formatDuration(view.start)}–{formatDuration(view.end)}
            {view.speed !== 1 && ` · ${view.speed.toFixed(2)}×`}
          </span>
        </div>
      )}

      <div className="absolute inset-0 px-4 pt-5 pb-2">
        <div className="relative w-full h-full cursor-pointer" onClick={onClick} title="Clic sopra = ascolta A da qui · sotto = ascolta B">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          <div ref={cursorRef} className="absolute inset-y-0 w-px bg-white pointer-events-none" style={{ display: "none" }} />
          {!view && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/30 gap-1.5">
              {status === "rendering"
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> rendering…</>
                : "Nessun effetto attivo: muovi un knob o chiedi all'AI per sentire e vedere il remix"}
            </div>
          )}
          {view && status === "rendering" && (
            <Loader2 className="absolute right-0 bottom-0 w-3.5 h-3.5 animate-spin text-accent" />
          )}
        </div>
      </div>
    </div>
  );
}

const db = (v: number) => (v <= -119 ? "-∞" : v.toFixed(1));

function Stat({ label, a, b, fmt, delta }: {
  label: string; a: number; b: number; fmt: (v: number) => string; delta?: boolean;
}) {
  const d = b - a;
  return (
    <span>
      {label} <span className="text-accent-cool/80">{fmt(a)}</span>
      <span className="text-white/30"> → </span>
      <span className="text-white/80">{fmt(b)}</span>
      {delta && Math.abs(d) >= 0.1 && (
        <span className={d > 0 ? "text-accent-hot" : "text-accent-cool"}> ({d > 0 ? "+" : ""}{d.toFixed(1)} dB)</span>
      )}
    </span>
  );
}
