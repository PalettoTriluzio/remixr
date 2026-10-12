// Live spectrum of whatever is playing (A or B), coloured by side.
// Before the first play / while paused it falls back to the track's average
// spectrum from /analyze.
import { useEffect, useRef } from "react";
import { audioSampleRate, getAnalyser } from "../lib/analyser";
import { useRemixStore } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";

const BARS = 40;
const F_MIN = 30;
const F_MAX = 16000;
const DB_FLOOR = -90;
const DB_RANGE = 70;

// Typed via inference: TS >= 5.7 wants Float32Array<ArrayBuffer> for
// getFloatFrequencyData, older versions have no generic.
const makeFft = (n: number) => new Float32Array(n);

const EDGES = Array.from({ length: BARS + 1 }, (_, i) => F_MIN * Math.pow(F_MAX / F_MIN, i / BARS));

export function SpectrumView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    const bars = new Float32Array(BARS);
    let fft: ReturnType<typeof makeFft> | null = null;
    let raf = 0;

    const fallback = (i: number): number => {
      const spec = useTrackStore.getState().analysis?.spectrum;
      if (!spec?.length) return 0;
      // Mel bands are roughly log-spaced too: index proportionally.
      return spec[Math.min(spec.length - 1, Math.floor((i / BARS) * spec.length))] * 0.6;
    };

    const tick = () => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const an = getAnalyser();
      const playing = useTrackStore.getState().isPlaying;
      const live = !!an && playing;
      if (an && live) {
        if (!fft || fft.length !== an.frequencyBinCount) fft = makeFft(an.frequencyBinCount);
        an.getFloatFrequencyData(fft);
      }
      const binHz = audioSampleRate() / 2 / (fft?.length || 1);

      for (let i = 0; i < BARS; i++) {
        let target: number;
        if (live && fft) {
          const lo = Math.max(1, Math.floor(EDGES[i] / binHz));
          const hi = Math.max(lo + 1, Math.ceil(EDGES[i + 1] / binHz));
          let max = -Infinity;
          for (let k = lo; k < hi && k < fft.length; k++) max = Math.max(max, fft[k]);
          target = Math.min(1, Math.max(0, (max - DB_FLOOR) / DB_RANGE));
        } else {
          target = fallback(i);
        }
        // Fast attack, slow release.
        bars[i] = target > bars[i] ? target : bars[i] * 0.92 + target * 0.08;
      }

      const isB = useRemixStore.getState().abMode === "B";
      const grad = g.createLinearGradient(0, h, 0, 0);
      if (isB) {
        grad.addColorStop(0, "#7c5cff");
        grad.addColorStop(1, "#ff5c7c");
      } else {
        grad.addColorStop(0, "#2b8fb3");
        grad.addColorStop(1, "#5cd4ff");
      }
      g.fillStyle = grad;
      g.globalAlpha = live ? 1 : 0.35;
      const bw = w / BARS;
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(1, bars[i] * (h - 2));
        g.fillRect(i * bw + 0.5, h - bh, Math.max(1, bw - 1.5), bh);
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex-1 min-h-0 px-3 pt-2 pb-2 flex flex-col">
      <canvas ref={canvasRef} className="flex-1 min-h-0 w-full" />
      <div className="flex justify-between text-[9px] font-mono text-white/25 mt-0.5">
        <span>30</span><span>250</span><span>2k</span><span>16k Hz</span>
      </div>
    </div>
  );
}
