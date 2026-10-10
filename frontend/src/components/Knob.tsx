import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import clsx from "clsx";
import { decimals, formatValue, type ControlDef } from "../lib/effects";

interface Props {
  def: ControlDef;
  value: number;
  defaultValue: number;
  onChange: (v: number) => void;
  dim?: boolean;
  highlight?: boolean;
}

const SIZE = 40;
const R = 15;
const SWEEP = 270; // degrees, from -135° to +135°

const toNorm = (v: number, d: ControlDef) =>
  d.log ? Math.log(v / d.min) / Math.log(d.max / d.min) : (v - d.min) / (d.max - d.min);

const fromNorm = (n: number, d: ControlDef) => {
  const c = Math.min(1, Math.max(0, n));
  const v = d.log ? d.min * Math.pow(d.max / d.min, c) : d.min + c * (d.max - d.min);
  const snapped = Math.round(v / d.step) * d.step;
  return Number(Math.min(d.max, Math.max(d.min, snapped)).toFixed(decimals(d.step)));
};

function polar(n: number) {
  const a = ((-SWEEP / 2 + n * SWEEP) - 90) * (Math.PI / 180);
  return { x: SIZE / 2 + R * Math.cos(a), y: SIZE / 2 + R * Math.sin(a) };
}

function arc(n0: number, n1: number) {
  const [a, b] = n0 <= n1 ? [n0, n1] : [n1, n0];
  const p0 = polar(a);
  const p1 = polar(b);
  const large = (b - a) * SWEEP > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${R} ${R} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

/** Drag vertically to turn (Shift = fine), double-click to reset, arrows to step. */
export function Knob({ def, value, defaultValue, onChange, dim, highlight }: Props) {
  const drag = useRef<{ y: number; n: number } | null>(null);
  const norm = toNorm(value, def);
  // Bipolar ranges (gain, semitones) draw the arc from zero.
  const origin = def.min < 0 && def.max > 0 ? toNorm(0, def) : 0;
  const tip = polar(norm);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, n: norm };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const range = e.shiftKey ? 800 : 160; // px for the full sweep
    const v = fromNorm(drag.current.n + (drag.current.y - e.clientY) / range, def);
    if (v !== value) onChange(v);
  };
  const onPointerUp = () => { drag.current = null; };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1
      : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onChange(fromNorm(norm + dir * (e.shiftKey ? 0.002 : 0.01), def));
  };

  return (
    <div className={clsx("flex flex-col items-center w-14 select-none", dim && "opacity-40")}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={def.label}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={value}
        title={`${def.label}: ${formatValue(value, def)} (doppio click = default)`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={onKeyDown}
        className="cursor-ns-resize rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-accent touch-none"
      >
        <svg width={SIZE} height={SIZE}>
          <path d={arc(0, 1)} fill="none" stroke="#2a313d" strokeWidth={3} strokeLinecap="round" />
          {Math.abs(norm - origin) > 0.001 && (
            <path
              d={arc(origin, norm)}
              fill="none"
              stroke={highlight ? "#ff5c7c" : "#7c5cff"}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R - 5} fill="#141820" />
          <line
            x1={SIZE / 2 + (tip.x - SIZE / 2) * 0.35}
            y1={SIZE / 2 + (tip.y - SIZE / 2) * 0.35}
            x2={SIZE / 2 + (tip.x - SIZE / 2) * 0.65}
            y2={SIZE / 2 + (tip.y - SIZE / 2) * 0.65}
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className={clsx("text-[10px] font-mono leading-tight", highlight ? "text-accent-hot" : "text-white/80")}>
        {formatValue(value, def)}
      </span>
      <span className="text-[10px] text-white/40 leading-tight">{def.label}</span>
    </div>
  );
}
