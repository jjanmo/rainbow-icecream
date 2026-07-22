import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Character-count heuristic rather than real measurement — this table
// re-renders on every live-price tick (as often as every 5s), so a
// ResizeObserver/canvas-measure approach per cell would be wasteful.
const STEPS: { max: number; size: string }[] = [
  { max: 6, size: "text-xs" },
  { max: 10, size: "text-[11px]" },
  { max: 16, size: "text-[10px]" },
  { max: Infinity, size: "text-[9px]" },
];

export function FitText({
  children,
  className,
  style,
}: {
  children: string;
  className?: string;
  style?: CSSProperties;
}) {
  const step = STEPS.find((s) => children.length <= s.max) ?? STEPS[STEPS.length - 1];
  return (
    <span className={cn("block truncate", step.size, className)} style={style}>
      {children}
    </span>
  );
}
