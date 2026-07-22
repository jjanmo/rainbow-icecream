import { useState } from "react";
import { fmtPct } from "@/lib/format";
import type { GroupCalc } from "@/lib/calc/rebalance";

export function AllocationBar({
  groups,
  widthOf,
}: {
  groups: GroupCalc[];
  widthOf: (group: GroupCalc) => number;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const segments = groups.map((g, i) => {
    const cursor = groups.slice(0, i).reduce((sum, prior) => sum + widthOf(prior), 0);
    const width = widthOf(g);
    return { group: g, width, center: cursor + width / 2 };
  });

  const active = segments.find((s) => s.group.id === activeId);

  function clearIfActive(id: string) {
    setActiveId((current) => (current === id ? null : current));
  }

  return (
    <div className="relative pb-4">
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md"
          style={{ left: `${active.center}%`, top: -6 }}
        >
          <span
            className="mr-1.5 inline-block size-1.5 rounded-full align-middle"
            style={{ background: active.group.color }}
          />
          {active.group.name} {fmtPct(active.width, 0)}
        </div>
      )}

      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map(({ group, width }) => (
          <button
            key={group.id}
            type="button"
            className="h-full min-w-0 border-0 p-0 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
            style={{ width: `${width}%`, background: group.color }}
            onMouseEnter={() => setActiveId(group.id)}
            onMouseLeave={() => clearIfActive(group.id)}
            onFocus={() => setActiveId(group.id)}
            onBlur={() => clearIfActive(group.id)}
            onClick={() => setActiveId((current) => (current === group.id ? null : group.id))}
            aria-label={`${group.name} ${fmtPct(width, 0)}`}
          />
        ))}
      </div>

      <div className="relative mt-1 h-3.5">
        {segments
          .filter((s) => s.width > 2)
          .map(({ group, width, center }) => (
            <span
              key={group.id}
              className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-muted-foreground"
              style={{ left: `${center}%` }}
            >
              {fmtPct(width, 0)}
            </span>
          ))}
      </div>
    </div>
  );
}
