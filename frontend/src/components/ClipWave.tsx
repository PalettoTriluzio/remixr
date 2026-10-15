// Mini waveform inside a flip clip: the slice of the original (wavesurfer's
// 8 kHz decode of the mix — stems are not decoded in the browser), laid out
// as it plays: one cycle per src_beats when looped, stretched otherwise,
// mirrored when reversed.
import { useEffect, useRef } from "react";
import type { FlipClip } from "../lib/types";

export function ClipWave({ buffer, clip, zoom, color }: { buffer: AudioBuffer; clip: FlipClip; zoom: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.max(4, Math.round(clip.length_beats * zoom));
  const cycle = Math.max(2, Math.round((clip.loop ? clip.src_beats : clip.length_beats) * zoom));

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const h = c.clientHeight || 48;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, h);

    const data = buffer.getChannelData(0);
    const a = Math.max(0, Math.floor(clip.src_start * buffer.sampleRate));
    const b = Math.min(data.length, Math.ceil(clip.src_end * buffer.sampleRate));
    if (b <= a) return;
    // Peak per column of one cycle.
    const peaks = new Float32Array(cycle);
    const per = (b - a) / cycle;
    let max = 1e-6;
    for (let x = 0; x < cycle; x++) {
      const i0 = a + Math.floor(x * per);
      const i1 = Math.min(b, a + Math.floor((x + 1) * per) + 1);
      let p = 0;
      for (let i = i0; i < i1; i++) {
        const v = Math.abs(data[i]);
        if (v > p) p = v;
      }
      peaks[clip.reverse ? cycle - 1 - x : x] = p;
      if (p > max) max = p;
    }
    g.fillStyle = color;
    g.globalAlpha = 0.55;
    const mid = h / 2 + 5;
    const amp = (h - 12) / 2;
    for (let x = 0; x < width; x++) {
      const v = (peaks[x % cycle] / max) * amp;
      g.fillRect(x, mid - v, 1, Math.max(1, v * 2));
    }
    // Cycle boundaries of a loop.
    if (clip.loop) {
      g.globalAlpha = 0.35;
      g.fillStyle = "#ffffff";
      for (let x = cycle; x < width; x += cycle) g.fillRect(x, 0, 1, h);
    }
  }, [buffer, clip.src_start, clip.src_end, clip.reverse, clip.loop, width, cycle, color]);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
