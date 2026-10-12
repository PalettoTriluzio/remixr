// Live spectrum tap: both players (wavesurfer's <audio> for A, the remix
// <audio> for B) are routed through one AnalyserNode.
//
// The AudioContext is created on the first user gesture (play, A/B switch):
// an element routed into a suspended context goes silent, so nothing is tapped
// before the context is known to be running.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
const tapped = new WeakSet<HTMLMediaElement>();
const pending = new Set<HTMLMediaElement>();

function tap(el: HTMLMediaElement) {
  if (!ctx || !analyser || tapped.has(el)) return;
  try {
    ctx.createMediaElementSource(el).connect(analyser);
    tapped.add(el);
  } catch {
    /* already owned by another context: no spectrum for it, audio unaffected */
  }
}

/** Call from a user gesture. */
export function activateAudio() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.7;
    analyser.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  pending.forEach(tap);
  pending.clear();
}

export function registerMedia(el: HTMLMediaElement) {
  if (ctx) tap(el);
  else pending.add(el);
}

export function unregisterMedia(el: HTMLMediaElement) {
  pending.delete(el);
}

export const getAnalyser = () => analyser;
export const audioSampleRate = () => ctx?.sampleRate ?? 48000;
