import { useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { speedOf } from "../lib/effects";
import { contentEnd } from "../lib/flip";
import { flipPlayer } from "../lib/flipPlayer";
import { useFlipStore } from "../lib/flipStore";
import { morphParams } from "../lib/morph";
import { useRemixStore } from "../lib/remixStore";
import { useTrackStore } from "../lib/store";

const DEBOUNCE_MS = 350;
const PREVIEW_MAX_SEC = 120; // backend/app/flip/render.py

/** Re-render the flip project (debounced) while in flip view. Master = the
 * rack as heard (intensity applied). */
export function useFlipPreview() {
  const view = useFlipStore((s) => s.view);
  const project = useFlipStore((s) => s.project);
  const owner = useFlipStore((s) => s.trackId);
  const loop = useFlipStore((s) => s.loop);
  const loopOn = useFlipStore((s) => s.loopOn);
  const setStatus = useFlipStore((s) => s.setStatus);
  const track = useTrackStore((s) => s.track);
  const params = useRemixStore((s) => s.params);
  const amount = useRemixStore((s) => s.amount);
  const master = useMemo(() => morphParams(params, amount).global_chain, [params, amount]);

  useEffect(() => {
    if (view !== "flip" || !project || !track || owner !== track.track_id) return;
    const bpb = project.beats_per_bar;
    const end = Math.min(project.bars * bpb, Math.ceil(contentEnd(project) / bpb) * bpb);
    if (end <= 0) {
      flipPlayer.clear();
      setStatus("idle");
      return;
    }

    const beatSec = 60 / project.bpm / speedOf(master);
    let start = 0;
    let stop = end;
    if (loopOn && loop) {
      start = loop.start;
      stop = Math.min(loop.end, end);
    } else if (end * beatSec > PREVIEW_MAX_SEC) {
      // Longer than one preview: render from the bar under the playhead.
      start = Math.floor(useFlipStore.getState().playhead / bpb) * bpb;
      stop = Math.min(end, start + Math.floor(PREVIEW_MAX_SEC / beatSec));
    }
    if (stop <= start) return;

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("rendering");
      try {
        const blob = await api.flipPreview(
          { track_id: track.track_id, project, master, start_beat: start, end_beat: stop },
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        flipPlayer.load({ url: URL.createObjectURL(blob), startBeat: start, endBeat: stop, beatSec });
        setStatus("ready");
      } catch (e) {
        if (!ctrl.signal.aborted) setStatus("error", (e as Error).message);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [view, project, owner, track, master, loop, loopOn, setStatus]);

  // Another song: the project was made of the old one's slices.
  const trackId = track?.track_id ?? null;
  useEffect(() => {
    const s = useFlipStore.getState();
    if (!trackId) {
      if (s.view === "flip") s.setView("remix");
      return;
    }
    if (s.trackId && s.trackId !== trackId) {
      flipPlayer.clear();
      s.clear();
      s.setView("remix");
    }
  }, [trackId]);

  // Leaving flip view stops its playback.
  useEffect(() => {
    if (view !== "flip") flipPlayer.pause();
  }, [view]);
}
