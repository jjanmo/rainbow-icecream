import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { colorFor, hueForGroupIndex } from "@/lib/calc/color";
import { fmtPct, fmtUsd, fmtWon } from "@/lib/format";
import type { HoldingCalc } from "@/lib/calc/rebalance";

/** Read-mode expanded group panel: a donut of each holding's share within
 * the group (by current value) on the left, a plain list on the right.
 *
 * Slice/dot colors here are independent of each holding's `color` (a tint of
 * the *group's* hue, used elsewhere) — this panel is a self-contained view of
 * one group, so its holdings get their own evenly-spaced distinct hues
 * (reusing the same "position around the wheel" logic as group colors). */
export function GroupHoldingsPanel({ holdings }: { holdings: HoldingCalc[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const distinctColors = holdings.map((_, i) => colorFor(hueForGroupIndex(i, holdings.length), 0));
  const hasValue = holdings.some((h) => h.value > 0);
  const chartData = hasValue
    ? holdings.map((h, i) => ({ id: h.id, value: h.actualPctInGroup, color: distinctColors[i] }))
    : [{ id: "empty", value: 1, color: "var(--muted)" }];

  function clearIfActive(id: string) {
    setActiveId((current) => (current === id ? null : current));
  }

  return (
    <div className="flex items-start gap-5 pt-2">
      <div className="flex w-2/5 justify-center">
        <div className="relative size-36 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                innerRadius={42}
                outerRadius={68}
                stroke="none"
                isAnimationActive={false}
              >
                {chartData.map((d) => (
                  <Cell
                    key={d.id}
                    fill={d.color}
                    opacity={activeId === null || activeId === d.id ? 1 : 0.35}
                    style={{ cursor: hasValue ? "pointer" : "default" }}
                    onMouseEnter={() => hasValue && setActiveId(d.id)}
                    onMouseLeave={() => hasValue && clearIfActive(d.id)}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {holdings.map((h, i) => {
          const isOverseas = h.nativeCurrency === "USD";
          return (
            <button
              key={h.id}
              type="button"
              className="flex w-full items-center gap-2.5 border-t border-border py-1.5 text-left text-xs transition-colors first:border-t-0 hover:bg-muted"
              style={{ opacity: activeId === null || activeId === h.id ? 1 : 0.5 }}
              onMouseEnter={() => setActiveId(h.id)}
              onMouseLeave={() => clearIfActive(h.id)}
            >
              <div className="size-2 shrink-0 rounded-full" style={{ background: distinctColors[i] }} />
              {h.ticker && <span className="shrink-0 font-mono text-muted-foreground">{h.ticker}</span>}
              <span className="flex-1 truncate">{h.name}</span>
              <span className="shrink-0 text-muted-foreground">{h.account || "-"}</span>
              <span className="shrink-0 font-mono">
                {fmtWon(h.value)}
                {isOverseas && <span className="ml-1 text-muted-foreground">({fmtUsd(h.valueNative)})</span>}
              </span>
              <span className="shrink-0 text-muted-foreground">{fmtPct(h.actualPctInGroup)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
