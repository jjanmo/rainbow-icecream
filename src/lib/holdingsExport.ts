import type { HoldingCalc } from '@/lib/calc/rebalance';
import { fmtQty, fmtSigned, fmtUsd, fmtWon, holdingDownloadLabel } from '@/lib/format';

const HEADERS = ['종목', '역할', '섹터', '수량', '현재가', '평가금액', '수익률'];
// 수량 이후 숫자 컬럼은 오른쪽 정렬
const ALIGNS = [':--', ':--', ':--', '--:', '--:', '--:', '--:'];

// 마크다운 표 셀 안의 `|`/줄바꿈은 표를 깨뜨리므로 이스케이프한다.
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 보유 종목 목록을 마크다운 표 문자열로 만든다 — `/holdings` 다운로드 버튼용. */
export function buildHoldingsMarkdownTable(
  holdings: HoldingCalc[],
  roleNameById: Map<string, string>,
  sectorNameById: Map<string, string>,
): string {
  const rows = holdings.map((h) => {
    const isOverseas = h.nativeCurrency === 'USD';
    return [
      holdingDownloadLabel(h),
      h.roleId ? (roleNameById.get(h.roleId) ?? '-') : '미지정',
      h.sectorId ? (sectorNameById.get(h.sectorId) ?? '-') : '미지정',
      fmtQty(h.qty),
      isOverseas ? `${fmtWon(h.priceKrw)} (${fmtUsd(h.priceNative)})` : fmtWon(h.priceKrw),
      isOverseas ? `${fmtWon(h.value)} (${fmtUsd(h.valueNative)})` : fmtWon(h.value),
      fmtSigned(h.returnPct),
    ];
  });

  return [HEADERS, ALIGNS, ...rows].map((cols) => `| ${cols.map(cell).join(' | ')} |`).join('\n') + '\n';
}
