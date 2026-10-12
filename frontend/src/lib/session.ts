// Last session in localStorage: track (if still on the server), analysis,
// params, intensity, chat. Reloading the page brings everything back.
import { api } from "./api";
import { useRemixStore, type ChatMessage } from "./remixStore";
import { useTrackStore } from "./store";
import type { AnalyzeResponse, Params, UploadResponse } from "./types";

const KEY = "remixr.session.v1";
const SAVE_DEBOUNCE_MS = 500;
const MAX_MESSAGES = 60;

interface Saved {
  track: UploadResponse | null;
  analysis: AnalyzeResponse | null;
  params: Params;
  amount: number;
  levelMatch: boolean;
  messages: ChatMessage[];
}

function save() {
  const t = useTrackStore.getState();
  const r = useRemixStore.getState();
  const data: Saved = {
    track: t.track,
    analysis: t.analysis,
    params: r.params,
    amount: r.amount,
    levelMatch: r.levelMatch,
    messages: r.messages.slice(-MAX_MESSAGES),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode: the session just isn't kept */
  }
}

/** Restore once, then keep saving. Returns the unsubscribe function. */
export function startSession(): () => void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  if (raw) {
    try {
      const s = JSON.parse(raw) as Saved;
      if (s.params?.global_chain) {
        useRemixStore.getState().restore({
          params: s.params,
          amount: typeof s.amount === "number" ? s.amount : 100,
          levelMatch: s.levelMatch ?? true,
          messages: Array.isArray(s.messages) ? s.messages : [],
        });
      }
      // The upload may have been deleted meanwhile: check before reopening.
      if (s.track) {
        const saved = s.track;
        api.trackInfo(saved.track_id)
          .then(() => {
            if (!useTrackStore.getState().track) useTrackStore.getState().restoreTrack(saved, s.analysis);
          })
          .catch(() => { /* gone: start empty */ });
      }
    } catch {
      /* corrupt: ignore */
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DEBOUNCE_MS);
  };
  const unsubs = [
    useRemixStore.subscribe((s, prev) => {
      if (s.params !== prev.params || s.amount !== prev.amount || s.messages !== prev.messages || s.levelMatch !== prev.levelMatch) schedule();
    }),
    useTrackStore.subscribe((s, prev) => {
      if (s.track !== prev.track || s.analysis !== prev.analysis) schedule();
    }),
  ];
  return () => {
    clearTimeout(timer);
    unsubs.forEach((u) => u());
  };
}
