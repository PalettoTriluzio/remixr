import { create } from "zustand";
import { defaultChain, defaultParams, type EffectChain, type Params } from "./types";
import { setIn } from "./effects";

export type AbMode = "A" | "B"; // A = original, B = remix preview
export type PreviewStatus = "idle" | "rendering" | "ready" | "error";

export interface Region { start: number; end: number; }

/** Decoded preview for the A/B lane (same window and speed as the player's). */
export interface PreviewView {
  buffer: AudioBuffer; // 8 kHz, like wavesurfer's decode of the original
  start: number;       // window in original-track seconds
  end: number;
  speed: number;
}

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

  // Undo / redo over params
  past: Params[];
  future: Params[];
  undo: () => void;
  redo: () => void;

  // Preview / transport
  abMode: AbMode;
  loop: boolean;
  region: Region | null;
  previewStatus: PreviewStatus;
  previewError: string | null;
  previewView: PreviewView | null;
  setAbMode: (m: AbMode) => void;
  setLoop: (v: boolean) => void;
  setRegion: (r: Region | null) => void;
  setPreviewStatus: (s: PreviewStatus, error?: string | null) => void;
  setPreviewView: (v: PreviewView | null) => void;

  // LLM chat
  messages: ChatMessage[];
  thinking: boolean;
  pushMessage: (m: Omit<ChatMessage, "id">) => void;
  setThinking: (v: boolean) => void;

  /** Called when the track changes or is removed. */
  resetSession: () => void;
}

let nextId = 1;

const HISTORY_MAX = 100;
// A knob drag fires dozens of setParam: one undo step per gesture, i.e. per
// control until a pause.
const COALESCE_MS = 800;
let lastEdit = { path: "", at: 0 };

const pushPast = (past: Params[], p: Params) => [...past, p].slice(-HISTORY_MAX);

export const useRemixStore = create<RemixState>((set) => ({
  params: defaultParams(),
  highlighted: new Set(),
  past: [],
  future: [],

  setParam: (path, value) =>
    set((s) => {
      const full = `global_chain.${path}`;
      const highlighted = s.highlighted.has(full)
        ? new Set([...s.highlighted].filter((p) => p !== full))
        : s.highlighted;
      const now = Date.now();
      const sameGesture = lastEdit.path === full && now - lastEdit.at < COALESCE_MS;
      lastEdit = { path: full, at: now };
      return {
        params: setIn(s.params, full, value),
        highlighted,
        past: sameGesture ? s.past : pushPast(s.past, s.params),
        future: [],
      };
    }),

  resetEffect: (id) =>
    set((s) => ({
      params: setIn(s.params, `global_chain.${id}`, defaultChain()[id]),
      past: pushPast(s.past, s.params),
      future: [],
    })),

  resetAll: () =>
    set((s) => ({ params: defaultParams(), highlighted: new Set(), past: pushPast(s.past, s.params), future: [] })),

  applyParams: (params, changed) =>
    set((s) => ({ params, highlighted: new Set(changed), past: pushPast(s.past, s.params), future: [] })),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      lastEdit = { path: "", at: 0 };
      return { params: prev, past: s.past.slice(0, -1), future: [s.params, ...s.future], highlighted: new Set() };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      lastEdit = { path: "", at: 0 };
      return { params: next, past: pushPast(s.past, s.params), future: s.future.slice(1), highlighted: new Set() };
    }),

  abMode: "A",
  loop: false,
  region: null,
  previewStatus: "idle",
  previewError: null,
  previewView: null,
  setAbMode: (abMode) => set({ abMode }),
  setLoop: (loop) => set({ loop }),
  setRegion: (region) => set({ region }),
  setPreviewStatus: (previewStatus, previewError = null) => set({ previewStatus, previewError }),
  setPreviewView: (previewView) => set({ previewView }),

  messages: [],
  thinking: false,
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, { ...m, id: nextId++ }] })),
  setThinking: (thinking) => set({ thinking }),

  // Params and chat survive a track change on purpose (same remix, new song);
  // only the track-bound state is cleared.
  resetSession: () =>
    set({ abMode: "A", region: null, previewStatus: "idle", previewError: null, previewView: null }),
}));
