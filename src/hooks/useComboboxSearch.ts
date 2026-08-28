import { useMemo, useState, type ChangeEvent } from 'react';
import { Combobox } from '@base-ui/react';

/**
 * base-ui Combobox의 내장 필터링은 한글 조합(IME) 중엔 입력값을 반영하지 않고
 * 조합이 끝날 때까지 미룬다(Empty 상태가 잠깐 잘못 보이는 걸 막으려는 의도) —
 * 그런데 한글은 스페이스 없이 이어 치는 동안 계속 "조합 중" 상태라, 목록이 전혀
 * 안 좁혀진 채로 남아있는다. 그 상태에서 클릭하거나 화살표+Enter로 고르면
 * 사용자 눈엔 안 보이는 원본(미필터링) 목록 기준으로 골라져 엉뚱한 항목이
 * 선택된다 — 영어는 IME 조합 자체가 없어 이 경로를 안 타서 항상 정상 동작했다.
 *
 * 해결: <ComboboxInput>에 직접 onChange를 얹어 조합 여부와 무관하게 매 키
 * 입력마다(한글 자모 단계 포함) 검색어를 추적하고, `Combobox.Root`의
 * `filteredItems` prop으로 이미 걸러진 목록을 넘겨 내장 필터링을 완전히
 * 우회한다 — base-ui가 직접 제공하는 외부 필터링 경로(`useFilter`)를 그대로 쓴다.
 */
export function useComboboxSearch<T>(items: T[], getLabel: (item: T) => string) {
  const [query, setQuery] = useState('');
  const { contains } = Combobox.useFilter();

  const filteredItems = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((item) => contains(item, q, getLabel));
  }, [items, query, contains, getLabel]);

  return {
    filteredItems,
    inputProps: {
      onChange: (e: ChangeEvent<HTMLInputElement>) => setQuery(e.currentTarget.value),
    },
    reset: () => setQuery(''),
  };
}
