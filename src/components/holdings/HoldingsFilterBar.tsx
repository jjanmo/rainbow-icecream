import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Region } from '@/types/domain';

export interface HoldingsFilter {
  groupId: string; // "all" | asset group id
  account: string; // "all" | account name
  region: Region | 'all';
}

export const ALL_HOLDINGS_FILTER: HoldingsFilter = {
  groupId: 'all',
  account: 'all',
  region: 'all',
};

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
        <SelectTrigger size="sm" className="w-28">
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

export function HoldingsFilterBar({
  filter,
  onChange,
  groupOptions,
  accountOptions,
}: {
  filter: HoldingsFilter;
  onChange: (filter: HoldingsFilter) => void;
  groupOptions: { id: string; name: string }[];
  accountOptions: string[];
}) {
  const groupItems = [{ label: '전체', value: 'all' }, ...groupOptions.map((g) => ({ label: g.name, value: g.id }))];
  const accountItems = [{ label: '전체', value: 'all' }, ...accountOptions.map((a) => ({ label: a, value: a }))];
  const regionItems = [
    { label: '전체', value: 'all' },
    { label: '국내', value: '국내' },
    { label: '해외', value: '해외' },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      <FilterSelect
        label="지역"
        value={filter.region}
        items={regionItems}
        onChange={(region) => onChange({ ...filter, region: region as Region | 'all' })}
      />
      <FilterSelect
        label="자산군"
        value={filter.groupId}
        items={groupItems}
        onChange={(groupId) => onChange({ ...filter, groupId })}
      />
      <FilterSelect
        label="계좌"
        value={filter.account}
        items={accountItems}
        onChange={(account) => onChange({ ...filter, account })}
      />
    </div>
  );
}
