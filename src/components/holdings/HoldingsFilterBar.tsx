import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ExposureRegion, Region } from '@/types/domain';

/** 미분류/미지정 종목을 고르는 필터 값 — 역할·섹터 공통. */
export const UNCLASSIFIED_FILTER_VALUE = '__unclassified__';

/**
 * `/holdings`의 필터 — 축별 독립 필터(ADR-0062/0063, 옛 "포트폴리오(탭)+버킷" 2단
 * 종속 셀렉트를 대체). 이 화면의 필터는 비중 조절이 아니라 종목 조회·수익률 확인이
 * 목적이라, 서로 종속관계 없이 각각 고를 수 있다. 역할·섹터 둘 다 동적 목록이라
 * id로 필터링한다(더 이상 고정 enum이 아님).
 */
export interface HoldingsFilter {
  region: Region | 'all';
  exposureRegion: ExposureRegion | '기타' | 'all';
  roleId: string | typeof UNCLASSIFIED_FILTER_VALUE | 'all';
  sectorId: string | typeof UNCLASSIFIED_FILTER_VALUE | 'all';
  account: string; // "all" | account name
}

export const ALL_HOLDINGS_FILTER: HoldingsFilter = {
  region: 'all',
  exposureRegion: 'all',
  roleId: 'all',
  sectorId: 'all',
  account: 'all',
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
  roleOptions,
  sectorOptions,
  accountOptions,
}: {
  filter: HoldingsFilter;
  onChange: (filter: HoldingsFilter) => void;
  /** `axis_categories`(axis: "role") 실목록. */
  roleOptions: { id: string; name: string }[];
  /** `axis_categories`(axis: "sector") 실목록. */
  sectorOptions: { id: string; name: string }[];
  accountOptions: string[];
}) {
  const regionItems = [
    { label: '전체', value: 'all' },
    { label: '국내', value: '국내' },
    { label: '해외', value: '해외' },
  ];
  const exposureRegionItems = [
    { label: '전체', value: 'all' },
    { label: '한국', value: '한국' },
    { label: '미국', value: '미국' },
    { label: '기타', value: '기타' },
  ];
  const roleItems = [
    { label: '전체', value: 'all' },
    ...roleOptions.map((r) => ({ label: r.name, value: r.id })),
    { label: '미분류', value: UNCLASSIFIED_FILTER_VALUE },
  ];
  const sectorItems = [
    { label: '전체', value: 'all' },
    ...sectorOptions.map((s) => ({ label: s.name, value: s.id })),
    { label: '미지정', value: UNCLASSIFIED_FILTER_VALUE },
  ];
  const accountItems = [{ label: '전체', value: 'all' }, ...accountOptions.map((a) => ({ label: a, value: a }))];

  return (
    <div className="flex flex-wrap gap-3">
      <FilterSelect
        label="지역"
        value={filter.region}
        items={regionItems}
        onChange={(region) => onChange({ ...filter, region: region as Region | 'all' })}
      />
      <FilterSelect
        label="실질지역"
        value={filter.exposureRegion}
        items={exposureRegionItems}
        onChange={(v) => onChange({ ...filter, exposureRegion: v as HoldingsFilter['exposureRegion'] })}
      />
      <FilterSelect
        label="역할"
        value={filter.roleId}
        items={roleItems}
        onChange={(v) => onChange({ ...filter, roleId: v as HoldingsFilter['roleId'] })}
      />
      <FilterSelect
        label="섹터"
        value={filter.sectorId}
        items={sectorItems}
        onChange={(v) => onChange({ ...filter, sectorId: v as HoldingsFilter['sectorId'] })}
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

export function matchesHoldingsFilter(
  h: { region: Region; exposureRegion: ExposureRegion | null; roleId: string | null; sectorId: string | null; account: string | null },
  filter: HoldingsFilter,
): boolean {
  if (filter.region !== 'all' && h.region !== filter.region) return false;
  if (filter.exposureRegion !== 'all') {
    const bucket = h.exposureRegion ?? '기타';
    if (bucket !== filter.exposureRegion) return false;
  }
  if (filter.roleId !== 'all') {
    if (filter.roleId === UNCLASSIFIED_FILTER_VALUE ? h.roleId !== null : h.roleId !== filter.roleId) return false;
  }
  if (filter.sectorId !== 'all') {
    if (filter.sectorId === UNCLASSIFIED_FILTER_VALUE ? h.sectorId !== null : h.sectorId !== filter.sectorId)
      return false;
  }
  if (filter.account !== 'all' && h.account !== filter.account) return false;
  return true;
}
