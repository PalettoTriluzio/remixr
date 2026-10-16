// Waveforms of the separated stems for the flip clips (GET
// /stems/{id}/{stem}/peaks: uint8 peaks, `rate` per second). Fetched once per
// track and stem; the mix keeps using wavesurfer's 8 kHz decode.
import { useEffect, useState } from "react";
import { api } from "./api";
import type { FlipSource } from "./types";

export interface StemPeaks { rate: number; data: Uint8Array; }

const cache = new Map<string, Promise<StemPeaks | null>>();

function load(trackId: string, stem: string): Promise<StemPeaks | null> {
  const key = `${trackId}:${stem}`;
  let p = cache.get(key);
  if (!p) {
    p = api.stemPeaks(trackId, stem).catch(() => {
      cache.delete(key); // stems not ready yet: retry next time
      return null;
    });
    cache.set(key, p);
  }
  return p;
}

/** Peaks of a clip's stem, or null (mix, stems missing, still loading). */
export function useStemPeaks(trackId: string | undefined, source: FlipSource, ready: boolean): StemPeaks | null {
  const [peaks, setPeaks] = useState<StemPeaks | null>(null);
  useEffect(() => {
    setPeaks(null);
    if (!trackId || source === "mix" || !ready) return;
    let alive = true;
    void load(trackId, source).then((p) => { if (alive) setPeaks(p); });
    return () => { alive = false; };
  }, [trackId, source, ready]);
  return peaks;
}
