import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { isNeutral, speedOf } from "../lib/effects";
import { decodeForView } from "../lib/peaks";
import { player } from "../lib/player";
import { useRemixStore } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";

const DEBOUNCE_MS = 300;
const PREVIEW_MAX_SEC = 30; // backend/app/dsp/render.py

/** Re-render the remix preview whenever params or the region change. */
export function usePreviewSync() {
  const track = useTrackStore((s) => s.track);
  const params = useRemixStore((s) => s.params);
  const region = useRemixStore((s) => s.region);
  const setStatus = useRemixStore((s) => s.setPreviewStatus);
  const setView = useRemixStore((s) => s.setPreviewView);

  // A params edit means "let me hear it": switch to B once the render lands.
  // Region moves alone keep the current A/B side.
  const lastParams = useRef(params);
  const pendingB = useRef(false);
  if (lastParams.current !== params) {
    lastParams.current = params;
    pendingB.current = true;
  }

  useEffect(() => {
    if (!track) return;
    const chain = params.global_chain;
    if (isNeutral(chain)) {
      player.clearPreview();
      setStatus("idle");
      pendingB.current = false;
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const start = region?.start ?? 0;
      const end = Math.min(region?.end ?? track.duration_sec, start + PREVIEW_MAX_SEC, track.duration_sec);
      setStatus("rendering");
      try {
        const blob = await api.renderPreview(
          { track_id: track.track_id, params, region_start_sec: start, region_end_sec: end },
          ctrl.signal,
        );
        // Decoded copy for the A/B lane; a failure only leaves the lane empty.
        const buffer = await decodeForView(blob).catch(() => null);
        if (ctrl.signal.aborted) return;
        const speed = speedOf(chain);
        player.loadPreview({ url: URL.createObjectURL(blob), start, end, speed }, pendingB.current);
        setView(buffer && { buffer, start, end, speed });
        pendingB.current = false;
        setStatus("ready");
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setStatus("error", (e as Error).message);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [track, params, region, setStatus, setView]);

  // Track removed or replaced: the old preview belongs to the old audio.
  useEffect(() => () => player.clearPreview(), [track?.track_id]);
}
