// Automation curve drawn over a track row (one parameter at a time).
//   click on the lane = new point (then drag) · drag a point = move
//   double click / right click on a point = delete
import { type PointerEvent as RPointerEvent } from "react";
import { AUTO_META, valueAt } from "../lib/automation";
import { ops, snapBeat, snapStep, useFlipStore } from "../lib/flipStore";
import type { AutoParam, AutoPoint, FlipProject, FlipTrack } from "../lib/types";

const PAD = 5;

export function AutomationLane({ project, track, param, width, height }: {
  project: FlipProject; track: FlipTrack; param: AutoParam; width: number; height: number;
}) {
  const zoom = useFlipStore((s) => s.zoom);
  const snap = useFlipStore((s) => s.snap);
  const meta = AUTO_META[param];
  const points = track.automation[param] ?? [];
  const inner = height - 2 * PAD;
  const y = (v: number) => PAD + (1 - v) * inner;
  const total = width / zoom;

  const toPoint = (e: { clientX: number; clientY: number }, el: Element): AutoPoint => {
    const r = el.getBoundingClientRect();
    const step = snapStep(project, snap);
    // Finer than the clip grid: automation lives between the bars too.
    const beat = snapBeat(Math.min(total, Math.max(0, (e.clientX - r.left) / zoom)), step > 0 ? Math.min(step, 0.25) : step);
    const value = Math.min(1, Math.max(0, 1 - (e.clientY - r.top - PAD) / inner));
    return { beat, value: Math.round(value * 1000) / 1000 };
  };

  const save = (pts: AutoPoint[], gesture?: string) => useFlipStore.getState().edit(ops.setAutomation(track.id, param, pts), gesture);

  /** Drag point `index` of `pts` (already saved). */
  const drag = (e: RPointerEvent<SVGElement>, pts: AutoPoint[], index: number, gesture = `auto-${track.id}-${Date.now()}`) => {
    const svg = (e.currentTarget.ownerSVGElement ?? e.currentTarget) as SVGSVGElement;
    svg.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const next = [...pts];
      next[index] = toPoint(ev, svg);
      save(next, gesture);
    };
    const up = () => {
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
  };

  const onLaneDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // First point on an empty lane: also pin the neutral value at the start,
    // so a single click draws a ramp instead of a flat line.
    const p = toPoint(e, e.currentTarget);
    const base = points.length === 0 && p.beat > 0 ? [{ beat: 0, value: meta.neutral }] : [];
    const pts = [...base, ...points, p];
    const gesture = `auto-${track.id}-${Date.now()}`;
    save(pts, gesture);
    drag(e, pts, pts.length - 1, gesture);
  };

  const remove = (i: number) => save(points.filter((_, k) => k !== i));

  const sorted = [...points].sort((a, b) => a.beat - b.beat);
  const line = sorted.length
    ? [`0,${y(sorted[0].value)}`, ...sorted.map((p) => `${p.beat * zoom},${y(p.value)}`), `${width},${y(sorted[sorted.length - 1].value)}`].join(" ")
    : `0,${y(meta.neutral)} ${width},${y(meta.neutral)}`;
  const playhead = useFlipStore((s) => s.playhead);

  return (
    <svg
      className="absolute inset-0 z-[15] cursor-crosshair"
      width={width}
      height={height}
      onPointerDown={onLaneDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <rect x={0} y={0} width={width} height={height} fill="rgba(0,0,0,0.35)" />
      <polyline points={line} fill="none" stroke={meta.color} strokeWidth={1.5} strokeDasharray={sorted.length ? undefined : "4 4"} />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.beat * zoom}
          cy={y(p.value)}
          r={4}
          fill={meta.color}
          stroke="#000"
          className="cursor-move"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (e.button === 2) { remove(i); return; }
            drag(e, points, i);
          }}
          onDoubleClick={(e) => { e.stopPropagation(); remove(i); }}
        >
          <title>{`${meta.label}: ${meta.format(p.value)} · beat ${p.beat}`}</title>
        </circle>
      ))}
      <text x={6} y={12} fill={meta.color} fontSize={9} fontFamily="monospace" className="pointer-events-none select-none">
        {meta.label.toUpperCase()} · ora {meta.format(valueAt(points, param, playhead))} · clic = punto · doppio clic = togli
      </text>
    </svg>
  );
}
