import { create } from "zustand";
import { defaultChain, defaultParams, type EffectChain, type Params } from "./types";
import { setIn } from "./effects";

export type AbMode = "A" | "B"; // A = original, B = remix preview
export type PreviewStatus = "idle" | "rendering" | "ready" | "error";

export interface Region { start: number; end: number; }

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "error";
  text: string;
  /** assistant only: params before/after, to show the diff and undo it */
  before?: Params;
  after?: Params;
  changed?: string[];
}

interface RemixState {
  params: Params;
  /** Paths changed by the last LLM answer ("global_chain.reverb.wet"), highlighted in the rack. */
  highlighted: Set<string>;

  setParam: (path: string, value: unknown) => void; // path inside global_chain
  resetEffect: (id: keyof EffectChain) => void;
  resetAll: () => void;
  applyParams: (params: Params, changed: string[]) => void;

  // Preview / transport
  abMode: AbMode;
  loop: boolean;
  region: Region | null;
  previewStatus: PreviewStatus;
  previewError: string | null;
  setAbMode: (m: AbMode) => void;
  setLoop: (v: boolean) => void;
  setRegion: (r: Region | null) => void;
  setPreviewStatus: (s: PreviewStatus, error?: string | null) => void;

  // LLM chat
  messages: ChatMessage[];
  thinking: boolean;
  pushMessage: (m: Omit<ChatMessage, "id">) => void;
  setThinking: (v: boolean) => void;

  /** Called when the track changes or is removed. */
  resetSession: () => void;
}

let nextId = 1;

export const useRemixStore = create<RemixState>((set) => ({
  params: defaultParams(),
  highlighted: new Set(),

  setParam: (path, value) =>
    set((s) => {
      const full = `global_chain.${path}`;
      const highlighted = s.highlighted.has(full)
        ? new Set([...s.highlighted].filter((p) => p !== full))
        : s.highlighted;
      return { params: setIn(s.params, full, value), highlighted };
    }),

  resetEffect: (id) =>
    set((s) => ({ params: setIn(s.params, `global_chain.${id}`, defaultChain()[id]) })),

  resetAll: () => set({ params: defaultParams(), highlighted: new Set() }),

  applyParams: (params, changed) => set({ params, highlighted: new Set(changed) }),

  abMode: "A",
  loop: false,
  region: null,
  previewStatus: "idle",
  previewError: null,
  setAbMode: (abMode) => set({ abMode }),
  setLoop: (loop) => set({ loop }),
  setRegion: (region) => set({ region }),
  setPreviewStatus: (previewStatus, previewError = null) => set({ previewStatus, previewError }),

  messages: [],
  thinking: false,
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, { ...m, id: nextId++ }] })),
  setThinking: (thinking) => set({ thinking }),

  // Params and chat survive a track change on purpose (same remix, new song);
  // only the track-bound state is cleared.
  resetSession: () =>
    set({ abMode: "A", region: null, previewStatus: "idle", previewError: null }),
}));
