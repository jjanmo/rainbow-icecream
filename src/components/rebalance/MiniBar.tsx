import { cn } from "@/lib/utils";

export function MiniBar({
  label,
  pct,
  color,
  opacity = 1,
  thin = false,
}: {
  label: string;
  pct: number;
  color: string;
  opacity?: number;
  thin?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", thin ? "mb-0.5" : "mb-1")}>
      <span
        className={cn(
          "shrink-0 text-muted-foreground",
          thin ? "w-[26px] text-[9.5px]" : "w-7 text-[10.5px]",
        )}
      >
        {label}
      </span>
      <div
        className={cn("flex-1 overflow-hidden rounded-full bg-muted", thin ? "h-1.5" : "h-2.5")}
      >
        <div
          className="h-full"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, opacity }}
        />
      </div>
    </div>
  );
}
