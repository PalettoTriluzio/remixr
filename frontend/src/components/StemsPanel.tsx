// Stems: separate the track (demucs, background job on the backend), then mix
// voice / drums / bass / other. The mix feeds preview and export; untouched
// mixer = the original file is used.
import clsx from "clsx";
import { Download, Loader2, RotateCcw, Scissors } from "lucide-react";
import { api } from "../lib/api";
import { useStemsStore } from "../lib/stemsStore";
import { useTrackStore } from "../lib/store";
import { STEM_NAMES, defaultStemMix, type StemMix, type StemName } from "../lib/types";

export const STEM_LABELS: Record<StemName, { label: string; color: string }> = {
  vocals: { label: "Voce", color: "#ff5c7c" },
  drums: { label: "Batteria", color: "#ffb35c" },
  bass: { label: "Basso", color: "#5cffa1" },
  other: { label: "Altro", color: "#5cd4ff" },
};

const GAIN_MIN = -60;
const GAIN_MAX = 12;

function only(keep: StemName[], how: "solo" | "mute"): StemMix {
  const mix = defaultStemMix();
  for (const n of keep) mix[n][how] = true;
  return mix;
}

export function StemsPanel() {
  const track = useTrackStore((s) => s.track);
  const job = useStemsStore((s) => s.job);
  const mix = useStemsStore((s) => s.mix);
  const start = useStemsStore((s) => s.start);
  const setLevel = useStemsStore((s) => s.setLevel);
  const setMix = useStemsStore((s) => s.setMix);

  if (!track) return null;
  const status = job?.status ?? "none";
  const anySolo = STEM_NAMES.some((n) => mix[n].solo && !mix[n].mute);

  return (
    <div className="bg-bg-card border border-line rounded-md">
      <div className="flex items-center gap-1.5 px-2 h-8">
        <Scissors className="w-3.5 h-3.5 text-white/40" />
        <span className="flex-1 text-sm font-medium">Stems</span>
        {status === "done" && (
          <>
            <QuickButton onClick={() => setMix(only(["vocals"], "solo"))}>acapella</QuickButton>
            <QuickButton onClick={() => setMix(only(["vocals"], "mute"))}>strumentale</QuickButton>
            <button
              onClick={() => setMix(defaultStemMix())}
              title="Mixer a zero (= originale)"
              className="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white hover:bg-bg-hover"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      <div className="px-2 pb-2">
        {(status === "none" || status === "error") && (
          <>
            <button
              onClick={() => void start()}
              className="w-full h-8 rounded bg-accent/20 hover:bg-accent/35 text-sm text-white"
            >
              Separa voce · batteria · basso · altro
            </button>
            {status === "error" && (
              <p className="mt-1.5 text-xs text-accent-hot break-words" title={job?.error ?? ""}>
                {job?.error ?? "Errore"} — riprova
              </p>
            )}
          </>
        )}

        {(status === "pending" || status === "running") && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="flex-1">
                {status === "pending" ? "in coda…" : `separazione ${Math.round((job?.progress ?? 0) * 100)}%`}
              </span>
              {job?.device && <span className="font-mono text-white/40">{job.device.toUpperCase()}</span>}
            </div>
            <div className="h-1 rounded bg-bg-hover overflow-hidden">
              <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${(job?.progress ?? 0) * 100}%` }} />
            </div>
          </div>
        )}

        {status === "done" && (
          <div className="space-y-1">
            {STEM_NAMES.map((n) => {
              const l = mix[n];
              const audible = !l.mute && (!anySolo || l.solo);
              return (
                <div key={n} className={clsx("flex items-center gap-1.5 h-6", !audible && "opacity-40")}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STEM_LABELS[n].color }} />
                  <span className="w-14 text-xs truncate">{STEM_LABELS[n].label}</span>
                  <Toggle on={l.mute} onClick={() => setLevel(n, { mute: !l.mute })} title="Muto" className="bg-accent-hot/70">M</Toggle>
                  <Toggle on={l.solo} onClick={() => setLevel(n, { solo: !l.solo })} title="Solo" className="bg-yellow-500/70">S</Toggle>
                  <input
                    type="range"
                    min={GAIN_MIN}
                    max={GAIN_MAX}
                    step={0.5}
                    value={l.gain_db}
                    onChange={(e) => setLevel(n, { gain_db: Number(e.target.value) })}
                    onDoubleClick={() => setLevel(n, { gain_db: 0 })}
                    title="Volume (doppio clic = 0 dB)"
                    className="flex-1 min-w-0 accent-[#7c5cff] h-1"
                  />
                  <span className="w-11 text-right text-[10px] font-mono text-white/60">
                    {l.gain_db <= GAIN_MIN ? "-∞" : `${l.gain_db > 0 ? "+" : ""}${l.gain_db.toFixed(1)}`}
                  </span>
                  <a
                    href={api.stemFileUrl(track.track_id, n)}
                    download
                    title={`Scarica ${STEM_LABELS[n].label} (WAV)`}
                    className="w-5 h-5 rounded flex items-center justify-center text-white/30 hover:text-white hover:bg-bg-hover"
                  >
                    <Download className="w-3 h-3" />
                  </a>
                </div>
              );
            })}
            <p className="text-[10px] font-mono text-white/30 pt-0.5">
              {job?.model} · {job?.device?.toUpperCase()}{job?.elapsed_sec != null && ` · ${job.elapsed_sec}s`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button onClick={onClick} className="px-1.5 h-5 rounded text-[10px] font-mono text-white/50 hover:text-white hover:bg-bg-hover">
      {children}
    </button>
  );
}

function Toggle(
  { on, onClick, title, className, children }:
  { on: boolean; onClick: () => void; title: string; className: string; children: string },
) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        "w-5 h-5 rounded text-[10px] font-mono font-semibold",
        on ? clsx(className, "text-white") : "bg-bg-hover text-white/40 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
