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
  const hasValue = data.some((d) => d.value > 0);
  const chartData = hasValue ? data : [{ id: 'empty', name: '-', value: 1, color: 'var(--muted)' }];

  return (
    <div className="flex min-w-[280px] flex-1 flex-col items-center gap-4 rounded-lg border border-border bg-card p-5">
      <div className="self-start text-[13px] font-semibold">{title}</div>
      <div className="relative size-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={41}
              outerRadius={70}
              stroke="none"
              isAnimationActive={false}
            >
              {chartData.map((d) => (
                <Cell key={d.id} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex size-[82px] items-center justify-center rounded-full bg-card text-[11px] text-muted-foreground">
            {centerLabel}
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col gap-1.5">
        {data.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-[12.5px]">
            <div className="size-[9px] shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="flex-1">{d.name}</span>
            <span className="font-mono text-muted-foreground">{d.valueLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
