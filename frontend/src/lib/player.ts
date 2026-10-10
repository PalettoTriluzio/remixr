// A/B playback engine.
//   A = original track, played by wavesurfer (full length).
//   B = remix preview: WAV of a window (region, or first 30 s) rendered by
//       /api/render/preview, played by a hidden <audio>. Tempo changes its
//       length, so positions are mapped through the preview's speed.
// The waveform cursor always shows the position in the *original* track.
import type WaveSurfer from "wavesurfer.js";
import { useTrackStore } from "./store";
import { useRemixStore, type AbMode } from "./remixStore";

export interface Preview {
  url: string;   // blob URL
  start: number; // window in original-track seconds
  end: number;
  speed: number; // tempo ratio the preview was rendered with
}

const remix = new Audio();
remix.preload = "auto";

let preview: Preview | null = null;
let loadToken = 0;
let raf = 0;

const mode = (): AbMode => useRemixStore.getState().abMode;
const ws = (): WaveSurfer | null => useTrackStore.getState().wavesurfer;
const setPlaying = (v: boolean) => useTrackStore.getState().setPlaying(v);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function toRemixTime(p: Preview, t: number): number {
  // Outside the window: restart from its beginning.
  if (t < p.start || t >= p.end) return 0;
  return (t - p.start) / p.speed;
}

function toOriginalTime(p: Preview, t: number): number {
  return clamp(p.start + t * p.speed, p.start, p.end);
}

/** Region if any, otherwise the preview window, otherwise the whole track. */
function loopWindow(): { start: number; end: number } | null {
  return useRemixStore.getState().region ?? (preview && { start: preview.start, end: preview.end });
}

// ---- remix element → stores / waveform cursor ----

function syncCursor() {
  if (preview && mode() === "B") ws()?.setTime(toOriginalTime(preview, remix.currentTime));
}

function tick() {
  syncCursor();
  raf = requestAnimationFrame(tick);
}

remix.addEventListener("play", () => {
  if (mode() !== "B") return;
  setPlaying(true);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
});

const stopTick = () => {
  cancelAnimationFrame(raf);
  syncCursor();
  if (mode() === "B") setPlaying(false);
};
remix.addEventListener("pause", stopTick);
remix.addEventListener("ended", stopTick);

// ---- wavesurfer → stores ----

export function bindWavesurfer(w: WaveSurfer) {
  w.on("play", () => { if (mode() === "A") setPlaying(true); });
  w.on("pause", () => { if (mode() === "A") setPlaying(false); });
  w.on("finish", () => {
    if (mode() !== "A") return;
    if (useRemixStore.getState().loop && !loopWindow()) {
      w.setTime(0);
      void w.play();
    } else {
      setPlaying(false);
    }
  });
  w.on("timeupdate", (t) => {
    useTrackStore.getState().setCurrentTime(t);
    if (mode() !== "A" || !w.isPlaying() || !useRemixStore.getState().loop) return;
    const win = loopWindow();
    if (win && t >= win.end) w.setTime(win.start);
  });
  // Click on the waveform while listening to B: seek the remix too.
  w.on("interaction", (t) => {
    if (mode() === "B" && preview) remix.currentTime = toRemixTime(preview, t);
  });
}

// ---- public API ----

export const player = {
  hasPreview: () => preview !== null,

  togglePlay() {
    if (mode() === "A") {
      void ws()?.playPause();
    } else if (preview) {
      if (remix.paused) void remix.play();
      else remix.pause();
    }
  },

  setMode(m: AbMode) {
    const store = useRemixStore.getState();
    if (store.abMode === m || (m === "B" && !preview)) return;
    const playing = useTrackStore.getState().isPlaying;
    const w = ws();

    if (m === "B" && preview) {
      const t = w?.getCurrentTime() ?? preview.start;
      store.setAbMode("B");
      w?.pause();
      remix.currentTime = toRemixTime(preview, t);
      if (playing) void remix.play();
      else syncCursor();
    } else {
      const t = preview ? toOriginalTime(preview, remix.currentTime) : w?.getCurrentTime() ?? 0;
      store.setAbMode("A");
      remix.pause();
      w?.setTime(t);
      if (playing) void w?.play();
    }
  },

  /** Swap in a freshly rendered preview, keeping the listening position. */
  loadPreview(p: Preview, switchToB: boolean) {
    const old = preview;
    const wasB = mode() === "B";
    const playing = useTrackStore.getState().isPlaying;
    const origT = wasB && old ? toOriginalTime(old, remix.currentTime) : ws()?.getCurrentTime() ?? p.start;

    preview = p;
    const token = ++loadToken;
    remix.src = p.url;
    remix.loop = useRemixStore.getState().loop;
    if (old) URL.revokeObjectURL(old.url);

    if (!wasB && !switchToB) return;
    if (!wasB) {
      useRemixStore.getState().setAbMode("B");
      ws()?.pause();
    }
    remix.addEventListener(
      "loadedmetadata",
      () => {
        if (token !== loadToken) return;
        remix.currentTime = toRemixTime(p, origT);
        if (playing) void remix.play();
        else syncCursor();
      },
      { once: true },
    );
  },

  /** Chain is neutral again (or track gone): drop the preview, back to A. */
  clearPreview() {
    if (!preview) return;
    if (mode() === "B") player.setMode("A");
    ++loadToken;
    remix.pause();
    remix.removeAttribute("src");
    remix.load();
    URL.revokeObjectURL(preview.url);
    preview = null;
  },

  setLoop(v: boolean) {
    useRemixStore.getState().setLoop(v);
    remix.loop = v;
  },

  setVolume(v: number) {
    remix.volume = v;
    ws()?.setVolume(v);
  },
};
