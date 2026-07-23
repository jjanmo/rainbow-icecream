import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

export interface DonutSlice {
  id: string;
  name: string;
  value: number;
  color: string;
  valueLabel: string;
}

export function AllocationDonutChart({
  title,
  centerLabel,
  data,
}: {
  title: string;
  centerLabel: string;
  data: DonutSlice[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const hasValue = data.some((d) => d.value > 0);
  const chartData = hasValue ? data : [{ id: 'empty', name: '-', value: 1, color: 'var(--muted)' }];
  const active = data.find((d) => d.id === activeId);

  function clearIfActive(id: string) {
    setActiveId((current) => (current === id ? null : current));
  }

  return (
    <div className="flex min-w-80 flex-1 flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="text-[13px] font-semibold">{title}</div>
      <div className="flex flex-wrap items-center justify-center gap-6">
        <div className="relative size-45 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={90}
                stroke="none"
                isAnimationActive={false}
              >
                {chartData.map((d) => (
                  <Cell
                    key={d.id}
                    fill={d.color}
                    opacity={activeId === null || activeId === d.id ? 1 : 0.35}
                    onMouseEnter={() => hasValue && setActiveId(d.id)}
                    onMouseLeave={() => hasValue && clearIfActive(d.id)}
                    onClick={() => hasValue && setActiveId((cur) => (cur === d.id ? null : d.id))}
                    style={{ cursor: hasValue ? 'pointer' : 'default' }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex size-26 flex-col items-center justify-center rounded-full bg-card text-center">
              {active ? (
                <>
                  <span className="max-w-20 truncate text-[11px] text-muted-foreground">{active.name}</span>
                  <span className="font-mono text-base font-semibold">{active.valueLabel}</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{centerLabel}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex w-44 shrink-0 flex-col gap-1.5">
          {data.map((d) => (
            <button
              key={d.id}
              type="button"
              className="flex items-center gap-2 rounded-md p-1 text-left text-[12.5px] transition-colors hover:bg-muted"
              style={{ opacity: activeId === null || activeId === d.id ? 1 : 0.5 }}
              onMouseEnter={() => setActiveId(d.id)}
              onMouseLeave={() => clearIfActive(d.id)}
              onClick={() => setActiveId((cur) => (cur === d.id ? null : d.id))}
            >
              <div className="size-2.25 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="flex-1 truncate">{d.name}</span>
              <span className="font-mono text-muted-foreground">{d.valueLabel}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
