// Flip playback: one <audio> playing the rendered project window. The
// playhead (flipStore.playhead) is in project beats; loop runs on the
// timeline's loop range.
import { activateAudio, registerMedia } from "./analyser";
import { useFlipStore } from "./flipStore";
import { player } from "./player";

export interface FlipWindow {
  url: string;
  startBeat: number; // project beat at t = 0 of the WAV
  endBeat: number;
  beatSec: number;   // seconds per beat in the WAV (master tempo included)
}

const audio = new Audio();
audio.preload = "auto";
registerMedia(audio);

let win: FlipWindow | null = null;
let raf = 0;
let playing = false;
let volume = 0.8;
const listeners = new Set<(playing: boolean) => void>();

const store = () => useFlipStore.getState();

function beatNow(): number {
  return win ? win.startBeat + audio.currentTime / win.beatSec : store().playhead;
}

function seekAudio(beat: number) {
  if (!win) return;
  const t = (beat - win.startBeat) * win.beatSec;
  audio.currentTime = t >= 0 && beat < win.endBeat ? t : 0;
}

function tick() {
  const s = store();
  let b = beatNow();
  if (s.loopOn && s.loop && b >= s.loop.end - 1e-3) {
    seekAudio(s.loop.start);
    b = s.loop.start;
  }
  s.setPlayhead(b);
  raf = requestAnimationFrame(tick);
}

function setPlaying(v: boolean) {
  playing = v;
  listeners.forEach((l) => l(v));
}

audio.addEventListener("play", () => {
  setPlaying(true);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
});
audio.addEventListener("pause", () => {
  cancelAnimationFrame(raf);
  setPlaying(false);
});
audio.addEventListener("ended", () => {
  cancelAnimationFrame(raf);
  const s = store();
  if (s.loopOn && s.loop) {
    seekAudio(s.loop.start);
    void audio.play();
    return;
  }
  s.setPlayhead(win?.startBeat ?? 0);
  setPlaying(false);
});

export const flipPlayer = {
  isPlaying: () => playing,
  hasAudio: () => win !== null,
  window: () => win,

  subscribe(fn: (playing: boolean) => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** New render: keep playing from the same beat. */
  load(w: FlipWindow) {
    const wasPlaying = playing;
    const beat = store().playhead;
    if (win) URL.revokeObjectURL(win.url);
    win = w;
    audio.src = w.url;
    audio.volume = volume;
    audio.addEventListener("loadedmetadata", () => {
      if (win !== w) return;
      seekAudio(beat);
      if (wasPlaying) void audio.play();
    }, { once: true });
  },

  clear() {
    audio.pause();
    if (win) URL.revokeObjectURL(win.url);
    win = null;
    audio.removeAttribute("src");
    audio.load();
  },

  play() {
    if (!win) return;
    activateAudio();
    player.pauseAll();
    seekAudio(store().playhead);
    void audio.play();
  },

  pause() {
    audio.pause();
  },

  toggle() {
    if (playing) flipPlayer.pause();
    else flipPlayer.play();
  },

  /** Jump to a beat (keeps playing if it was). */
  seek(beat: number) {
    store().setPlayhead(beat);
    if (win && beat >= win.startBeat && beat < win.endBeat) seekAudio(beat);
  },

  setVolume(v: number) {
    volume = v;
    audio.volume = v;
  },
};
