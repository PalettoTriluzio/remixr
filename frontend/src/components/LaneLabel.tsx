import clsx from "clsx";

export function LaneLabel({ text, active, className }: { text: string; active: boolean; className: string }) {
  return (
    <span
      className={clsx(
        "absolute top-1 left-4 z-10 text-[10px] font-mono tracking-widest pointer-events-none transition-opacity",
        className,
        active ? "opacity-100" : "opacity-50",
      )}
    >
      {text}
    </span>
  );
}
