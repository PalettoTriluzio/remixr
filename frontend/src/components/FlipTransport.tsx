import { useEffect, useState } from "react";
import clsx from "clsx";
import { Pause, Play, Repeat, SkipBack, Volume2 } from "lucide-react";
import { barBeatLabel, contentEnd } from "../lib/flip";
import { flipPlayer } from "../lib/flipPlayer";
import { useFlipStore } from "../lib/flipStore";
import { formatDuration } from "../lib/format";
import { useRemixStore } from "../lib/remixStore";

/** Transport bar in flip view: plays the arrangement. */
export function FlipTransport() {
  const project = useFlipStore((s) => s.project);
  const playhead = useFlipStore((s) => s.playhead);
  const loop = useFlipStore((s) => s.loop);
  const loopOn = useFlipStore((s) => s.loopOn);
  const setLoop = useFlipStore((s) => s.setLoop);
  const setLoopOn = useFlipStore((s) => s.setLoopOn);
  const status = useFlipStore((s) => s.status);
  const amount = useRemixStore((s) => s.amount);
  const setAmount = useRemixStore((s) => s.setAmount);
  const [playing, setPlaying] = useState(flipPlayer.isPlaying());
  const [volume, setVolume] = useState(80);
  useEffect(() => flipPlayer.subscribe(setPlaying), []);
  useEffect(() => flipPlayer.setVolume(volume / 100), [volume]);

  if (!project) return <footer className="h-12 shrink-0 border-t border-line bg-bg-panel" />;
  const bpb = project.beats_per_bar;
  const beatSec = 60 / project.bpm;
  const canPlay = status === "ready" || flipPlayer.hasAudio();

  const toggleLoop = () => {
    if (loop) setLoopOn(!loopOn);
    else {
      // No range yet: loop the content (whole bars).
      const end = Math.max(bpb, Math.ceil(contentEnd(project) / bpb) * bpb);
      setLoop({ start: 0, end });
    }
  };

  return (
    <footer className="h-12 shrink-0 border-t border-line bg-bg-panel flex items-center px-4 gap-3">
      <button
        disabled={!canPlay}
        onClick={() => flipPlayer.toggle()}
        title="Play/pausa (Spazio)"
        className="w-9 h-9 rounded-full bg-accent-hot hover:brightness-110 flex items-center justify-center disabled:opacity-40"
      >
        {playing ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
      </button>
      <button
        onClick={() => flipPlayer.seek(loopOn && loop ? loop.start : 0)}
        title="All'inizio"
        className="w-8 h-8 rounded hover:bg-bg-hover flex items-center justify-center text-white/60"
      >
        <SkipBack className="w-4 h-4" />
      </button>
      <button
        onClick={toggleLoop}
        title="Loop sul range (trascina sul righello per sceglierlo) (L)"
        className={clsx("w-8 h-8 rounded hover:bg-bg-hover flex items-center justify-center", loopOn ? "text-accent" : "text-white/60")}
      >
        <Repeat className="w-4 h-4" />
      </button>
      <span className="text-xs font-mono text-white/80 w-14" title="Battuta.movimento">{barBeatLabel(playhead, bpb)}</span>
      <span className="text-xs font-mono text-white/40">{formatDuration(playhead * beatSec)}</span>
      {loop && (
        <span className="text-xs font-mono text-white/30">
          loop {barBeatLabel(loop.start, bpb)}–{barBeatLabel(loop.end, bpb)}
        </span>
      )}

      <label
        className="flex items-center gap-2 text-xs font-mono ml-4"
        title="Intensità del master (il rack): 0% = nessun effetto, 100% = come nel rack. Doppio clic = 100%."
        onDoubleClick={() => setAmount(100)}
      >
        <span className="text-white/40">MASTER</span>
        <input type="range" min={0} max={150} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-24 accent-[#7c5cff]" />
        <span className="w-10 text-right text-white/60">{amount}%</span>
      </label>

      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-white/50" />
        <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-24" />
      </div>
      <span className="text-xs font-mono text-white/40">{project.bpm} BPM · {project.bars} batt.</span>
    </footer>
  );
}
