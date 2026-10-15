import { useEffect } from "react";
import { api } from "../lib/api";
import { useStemsStore } from "../lib/stemsStore";
import { useTrackStore } from "../lib/store";

const POLL_MS = 1000;

/** Per track: stems status (a finished separation survives restarts),
 * polling while it runs, structure analysis — redone from the stems once
 * they are ready. */
export function useTrackStructure() {
  const trackId = useTrackStore((s) => s.track?.track_id ?? null);
  const status = useStemsStore((s) => s.job?.status);
  const source = useStemsStore((s) => s.structure?.source);

  useEffect(() => {
    const store = useStemsStore.getState();
    store.setTrack(trackId);
    if (!trackId) return;
    api.getStems(trackId).then(store.setJob).catch(() => {});
    void store.loadStructure();
  }, [trackId]);

  useEffect(() => {
    if (!trackId || (status !== "pending" && status !== "running")) return;
    const timer = setInterval(() => {
      api.getStems(trackId).then(useStemsStore.getState().setJob).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [trackId, status]);

  // Stems just finished: beats from the drums, chords without the vocals.
  useEffect(() => {
    const s = useStemsStore.getState();
    if (status === "done" && source === "mix" && !s.structureLoading) void s.loadStructure();
  }, [status, source]);
}
