import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Holding, Region } from '@/types/domain';
import type { Execution, Side } from '@/types/journal';

export interface ExecutionsFilter {
  holdingId: string; // "all" | holding id
  side: Side | 'all';
  region: Region | 'all';
}

export const ALL_EXECUTIONS_FILTER: ExecutionsFilter = {
  holdingId: 'all',
  side: 'all',
  region: 'all',
};

export function matchesExecutionsFilter(
  execution: Execution,
  filter: ExecutionsFilter,
  holding: Holding | undefined,
): boolean {
  if (filter.holdingId !== 'all' && execution.holdingId !== filter.holdingId) return false;
  if (filter.side !== 'all' && execution.side !== filter.side) return false;
  if (filter.region !== 'all' && holding?.region !== filter.region) return false;
  return true;
}

function FilterSelect({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select items={items} value={value} onValueChange={(v) => onChange(v ?? 'all')}>
        <SelectTrigger size="sm" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ExecutionsFilterBar({
  filter,
  onChange,
  holdingOptions,
}: {
  filter: ExecutionsFilter;
  onChange: (filter: ExecutionsFilter) => void;
  holdingOptions: { id: string; label: string }[];
}) {
  const holdingItems = [
    { label: '전체', value: 'all' },
    ...holdingOptions.map((h) => ({ label: h.label, value: h.id })),
  ];
  const sideItems = [
    { label: '전체', value: 'all' },
    { label: '매수', value: 'BUY' },
    { label: '매도', value: 'SELL' },
  ];
  const regionItems = [
    { label: '전체', value: 'all' },
    { label: '국내', value: '국내' },
    { label: '해외', value: '해외' },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      <FilterSelect
        label="종목"
        value={filter.holdingId}
        items={holdingItems}
        onChange={(holdingId) => onChange({ ...filter, holdingId })}
      />
      <FilterSelect
        label="매매"
        value={filter.side}
        items={sideItems}
        onChange={(side) => onChange({ ...filter, side: side as Side | 'all' })}
      />
      <FilterSelect
        label="지역"
        value={filter.region}
        items={regionItems}
        onChange={(region) => onChange({ ...filter, region: region as Region | 'all' })}
      />
    </div>
  );
}
