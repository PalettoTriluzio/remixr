import { useEffect, useMemo, useRef } from "react";
import { api } from "../lib/api";
import { isNeutral, speedOf } from "../lib/effects";
import { morphParams } from "../lib/morph";
import { decodeForView } from "../lib/peaks";
import { player } from "../lib/player";
import { useRemixStore } from "../lib/remixStore";
import { activeStemMix, useStemsStore } from "../lib/stemsStore";
import { useFlipStore } from "../lib/flipStore";
import { useTrackStore } from "../lib/store";

const DEBOUNCE_MS = 300;
const PREVIEW_MAX_SEC = 30; // backend/app/dsp/render.py

/** Re-render the remix preview whenever params or the region change. */
export function usePreviewSync() {
  const track = useTrackStore((s) => s.track);
  const target = useRemixStore((s) => s.params);
  const amount = useRemixStore((s) => s.amount);
  const region = useRemixStore((s) => s.region);
  const setStatus = useRemixStore((s) => s.setPreviewStatus);
  const setView = useRemixStore((s) => s.setPreviewView);
  const flipView = useFlipStore((s) => s.view === "flip");
  const job = useStemsStore((s) => s.job);
  const mix = useStemsStore((s) => s.mix);
  const stemMix = useMemo(() => activeStemMix({ job, mix }), [job, mix]);

  // A params edit means "let me hear it": switch to B once the render lands.
  // Region moves alone keep the current A/B side.
  const lastParams = useRef(target);
  const lastAmount = useRef(amount);
  const pendingB = useRef(false);
  const lastMix = useRef(stemMix);
  if (lastParams.current !== target || lastAmount.current !== amount || lastMix.current !== stemMix) {
    lastParams.current = target;
    lastAmount.current = amount;
    lastMix.current = stemMix;
    pendingB.current = true;
  }

  // What you hear = rack params dosed by "Intensità".
  const params = useMemo(() => morphParams(target, amount), [target, amount]);

  useEffect(() => {
    // Flip view renders the arrangement instead (useFlipPreview).
    if (!track || flipView) return;
    const chain = params.global_chain;
    if (isNeutral(chain) && !stemMix) {
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
          { track_id: track.track_id, params, stem_mix: stemMix, region_start_sec: start, region_end_sec: end },
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
  }, [track, flipView, params, stemMix, region, setStatus, setView]);

  // Track removed or replaced: the old preview belongs to the old audio.
  useEffect(() => () => player.clearPreview(), [track?.track_id]);
}
