import { useMemo, useState } from 'react';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useComboboxSearch } from '@/hooks/useComboboxSearch';
import { cn } from '@/lib/utils';
import type { AxisCategory } from '@/types/domain';

/**
 * 역할 칩 — 매매 모달의 "+ 새 종목" 흐름, `/holdings`의 종목 편집 둘 다에서 쓴다
 * (ADR-0062/0063). 역할 목록 자체는 사용자가 "역할 관리" 모달에서 추가·삭제하는
 * 동적 목록이다(더 이상 고정 5개가 아님) — 여기서는 그 목록을 그대로 칩으로 보여주고
 * 고르기만 한다.
 */
export function RoleChips({
  roles,
  value,
  onChange,
  size = 'md',
}: {
  roles: AxisCategory[];
  value: string | null;
  onChange: (roleId: string) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onChange(r.id)}
          className={cn(
            'rounded-full border font-medium transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
            value === r.id
              ? 'border-primary bg-accent text-accent-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {r.name}
        </button>
      ))}
    </div>
  );
}

interface AxisCategoryComboItem {
  value: string;
  label: string;
  isCreate?: boolean;
}

const CREATE_NEW_VALUE = '__create_new_axis_category__';

/**
 * 섹터 검색 콤보박스 — 없는 이름을 입력하면 "+ '이름' 새 섹터 만들기"가 나타나고,
 * 고르면 그 자리에서 섹터를 만들어 바로 지정한다(ADR-0062). Korean-IME-safe 패턴
 * (`useComboboxSearch`)을 그대로 따른다.
 */
export function SectorCombobox({
  sectors,
  value,
  onChange,
  onCreateSector,
  placeholder = '섹터 검색',
  disabled,
}: {
  sectors: AxisCategory[];
  value: string | null;
  onChange: (sectorId: string | null) => void;
  onCreateSector: (name: string) => Promise<{ id: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  const baseItems = useMemo<AxisCategoryComboItem[]>(
    () => sectors.map((s) => ({ value: s.id, label: s.name })),
    [sectors],
  );
  const search = useComboboxSearch(baseItems, (item) => item.label);
  const [creating, setCreating] = useState(false);

  const trimmedQuery = search.query.trim();
  const exactMatch = sectors.some((s) => s.name === trimmedQuery);
  const createItem: AxisCategoryComboItem = {
    value: CREATE_NEW_VALUE,
    label: `+ '${trimmedQuery}' 새 섹터 만들기`,
    isCreate: true,
  };
  const showCreate = trimmedQuery.length > 0 && !exactMatch;
  const rootItems = showCreate ? [...baseItems, createItem] : baseItems;
  const filteredItems = showCreate ? [...search.filteredItems, createItem] : search.filteredItems;
  const selected = baseItems.find((i) => i.value === value) ?? null;

  async function handleValueChange(item: AxisCategoryComboItem | null) {
    if (item?.isCreate) {
      setCreating(true);
      try {
        const created = await onCreateSector(trimmedQuery);
        onChange(created.id);
        search.reset();
      } finally {
        setCreating(false);
      }
      return;
    }
    onChange(item?.value ?? null);
    search.reset();
  }

  return (
    <Combobox<AxisCategoryComboItem>
      items={rootItems}
      filteredItems={filteredItems}
      value={selected}
      onValueChange={(item) => void handleValueChange(item)}
      disabled={disabled || creating}
    >
      <ComboboxInput placeholder={placeholder} className="h-8 w-full text-xs" {...search.inputProps} />
      <ComboboxContent>
        <ComboboxEmpty>일치하는 섹터가 없습니다.</ComboboxEmpty>
        <ComboboxList>
          {(item: AxisCategoryComboItem) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** 역할 칩 + 섹터 콤보박스 + 레버리지 입력을 한 세트로 묶은 블록 — 매매 모달 "+ 새 종목"과
 * `/holdings` 편집 다이얼로그가 똑같이 쓴다. 새 역할 자체를 만드는 건 여기서 안 하고
 * "역할 관리" 모달에서 한다(칩은 고르기 전용) — 섹터는 여기서 바로 만들 수 있다(콤보박스
 * "+ 새 섹터 만들기"). 레버리지는 계산엔 안 쓰는 표시 전용 값이라 검증(필수) 대상이
 * 아니다 — 기본값 1로 시작한다. */
export function ClassificationFieldsBlock({
  roles,
  roleId,
  onRoleIdChange,
  sectorId,
  onSectorIdChange,
  sectors,
  onCreateSector,
  leverageText,
  onLeverageTextChange,
}: {
  roles: AxisCategory[];
  roleId: string | null;
  onRoleIdChange: (roleId: string) => void;
  sectorId: string | null;
  onSectorIdChange: (sectorId: string | null) => void;
  sectors: AxisCategory[];
  onCreateSector: (name: string) => Promise<{ id: string }>;
  leverageText: string;
  onLeverageTextChange: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px]">역할</Label>
        <RoleChips roles={roles} value={roleId} onChange={onRoleIdChange} size="sm" />
      </div>
      <div className="flex gap-2.5">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label className="text-[11px]">섹터</Label>
          <SectorCombobox sectors={sectors} value={sectorId} onChange={onSectorIdChange} onCreateSector={onCreateSector} />
        </div>
        <div className="flex w-20 flex-col gap-1.5">
          <Label className="text-[11px]">레버리지</Label>
          <input
            type="text"
            inputMode="decimal"
            value={leverageText}
            onChange={(e) => onLeverageTextChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </div>
    </div>
  );
}
