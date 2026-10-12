// Waveform data for the A/B lane. Both sides are decoded at wavesurfer's rate
// (8 kHz) so their levels compare like for like.
export const VIEW_SAMPLE_RATE = 8000;

export async function decodeForView(blob: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, VIEW_SAMPLE_RATE);
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

const range = (buf: AudioBuffer, from: number, to: number): [number, number] => [
  Math.max(0, Math.floor(from * buf.sampleRate)),
  Math.min(buf.length, Math.ceil(to * buf.sampleRate)),
];

export const toDb = (v: number) => (v > 1e-6 ? 20 * Math.log10(v) : -120);

export interface Levels { peakDb: number; rmsDb: number; }

export function levels(buf: AudioBuffer, from = 0, to = buf.duration): Levels {
  const [a, b] = range(buf, from, to);
  let peak = 0;
  let sum = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = a; i < b; i++) {
      const v = d[i];
      const abs = v < 0 ? -v : v;
      if (abs > peak) peak = abs;
      sum += v * v;
    }
  }
  const n = Math.max(1, (b - a) * buf.numberOfChannels);
  return { peakDb: toDb(peak), rmsDb: toDb(Math.sqrt(sum / n)) };
}

/** Per-column [peak, rms] (0..1, all channels) of `buf` between from..to seconds. */
export function columns(buf: AudioBuffer, from: number, to: number, n: number): Float32Array {
  const out = new Float32Array(Math.max(0, n) * 2);
  if (n <= 0) return out;
  const [a, b] = range(buf, from, to);
  const per = (b - a) / n;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let col = 0; col < n; col++) {
    const s = a + Math.floor(col * per);
    const e = Math.max(s + 1, Math.min(b, a + Math.floor((col + 1) * per)));
    let peak = 0;
    let sum = 0;
    for (const d of chans) {
      for (let i = s; i < e; i++) {
        const v = d[i];
        const abs = v < 0 ? -v : v;
        if (abs > peak) peak = abs;
        sum += v * v;
      }
    }
    out[col * 2] = Math.min(1, peak);
    out[col * 2 + 1] = Math.min(1, Math.sqrt(sum / ((e - s) * chans.length)));
  }
  return out;
}
