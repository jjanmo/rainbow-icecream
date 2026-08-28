import { useMemo, useState } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { colorFor, hexToHue } from '@/lib/calc/color';
import type { HoldingCalc } from '@/lib/calc/rebalance';
import { fmtSigned, fmtWon, shortHoldingLabel } from '@/lib/format';

// finviz류 시장 히트맵과 같은 채도를 내려면 앱 전역의 GOOD_COLOR(민트)/LOSS_COLOR보다
// 훨씬 진한 색이 필요해서, 여기서만 쓰는 전용 스케일이다(lib/calc/rebalance.ts의
// returnColor/diffColor는 건드리지 않는다 — 그쪽은 텍스트 한 글자 색이라 파스텔로도 충분하지만,
// 타일 전체를 채우는 히트맵은 그러면 흐릿해 보인다).
const GAIN_HUE = 150;
const LOSS_HUE = 20;
// 실제 시장 히트맵처럼 캔버스 자체를 앱 라이트/다크 테마와 무관하게 항상 어둡게 고정한다 —
// 자산군 라벨(그룹 고유 색)이 밝은 카드 배경 위에서는 옅은 색상이 묻혀 잘 안 보였는데,
// 검정 위에서는 채도 있는 색이 대부분 잘 도드라진다. 타일 색(oklch(...))도 이미 테마와
// 무관한 고정값이라 캔버스만 따로 var(--card)를 쓰면 오히려 서로 어울리지 않았다.
const HEATMAP_CANVAS_BG = '#131316';
const HEATMAP_CANVAS_BORDER = '#2a2a2e';
// var(--muted)는 라이트 테마에서 밝은 회색이라 검정 캔버스 위에서 튀어 보인다 — 중립 타일도
// 고정 색으로 둔다.
const NEUTRAL_FILL = 'oklch(38% 0 0)';
// 라벨은 항상 흰 글씨로 통일한다(밝은 파스텔 타일 위에서도) — 대신 옅은 배경에서도 읽히도록
// 얇은 검정 아웃라인(TEXT_OUTLINE)을 깔아준다. 배경 명도별로 흰/검을 계산해서 고르던 이전
// 방식은 타일마다 글자색이 달라 보여서 산만했다.
const WHITE_INK = '#fff';
const TEXT_OUTLINE = 'rgba(0,0,0,0.65)';
// 이 값 밑이면 등락이 사실상 없다고 보고 중립으로 표시한다 — 부동소수점 오차 방지용이지
// 실질적인 반올림 경계는 아니다.
const NEUTRAL_EPSILON = 0.005;

/** 절대 등락률 크기에 따라 명도/채도를 달리하는 5단계 — 일일 변동폭 기준(생애 수익률보다
 * 훨씬 작은 스케일)으로 골랐다: 하루 5% 이상이면 이미 큰 움직임이다. */
const LEVELS: { minAbsPct: number; L: number; gainC: number; lossC: number }[] = [
  { minAbsPct: 5, L: 0.32, gainC: 0.17, lossC: 0.2 },
  { minAbsPct: 2.5, L: 0.42, gainC: 0.18, lossC: 0.21 },
  { minAbsPct: 1, L: 0.55, gainC: 0.17, lossC: 0.2 },
  { minAbsPct: 0.3, L: 0.68, gainC: 0.14, lossC: 0.16 },
  { minAbsPct: 0, L: 0.82, gainC: 0.09, lossC: 0.1 },
];

function levelFor(absPct: number) {
  return LEVELS.find((lv) => absPct >= lv.minAbsPct) ?? LEVELS[LEVELS.length - 1];
}

function heatmapStyle(changePct: number | undefined, pending: boolean, unavailable = false): { fill: string } {
  if (pending || unavailable) return { fill: NEUTRAL_FILL };
  if (changePct === undefined || Math.abs(changePct) < NEUTRAL_EPSILON) {
    return { fill: NEUTRAL_FILL };
  }
  const lv = levelFor(Math.abs(changePct));
  const hue = changePct > 0 ? GAIN_HUE : LOSS_HUE;
  const C = changePct > 0 ? lv.gainC : lv.lossC;
  return { fill: `oklch(${(lv.L * 100).toFixed(0)}% ${C} ${hue})` };
}

// --- 타일 라벨: 칸 크기에 맞춰 폰트를 줄이고, 그래도 안 맞으면 말줄임 -----------------

const NAME_SIZES = [13, 12, 11, 10, 9];
const PCT_SIZES = [12, 11, 10, 9, 8];
const GROUP_LABEL_SIZES = [11, 10, 9];

/** 정확한 글자폭 측정 대신 쓰는 근사치 — 한글/CJK는 정사각형에 가깝고 라틴/숫자는 훨씬
 * 좁으므로 문자 종류별로 다른 비율을 곱한다. */
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    width += /[ㄱ-힝一-鿿]/.test(ch) ? fontSize * 1.05 : fontSize * 0.62;
  }
  return width;
}

function truncateToWidth(text: string, fontSize: number, maxWidth: number): string | null {
  const ellipsis = '…';
  if (estimateTextWidth(ellipsis, fontSize) > maxWidth) return null;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTextWidth(text.slice(0, mid) + ellipsis, fontSize) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + ellipsis : ellipsis;
}

/** sizes를 큰 것부터 시도해 통째로 들어가는 첫 크기를 쓰고, 전부 안 맞으면 가장 작은
 * 크기로 말줄임한다. 말줄임표조차 안 들어가면 null(라벨 자체를 생략). */
function bestFit(text: string, sizes: number[], maxWidth: number): { size: number; text: string } | null {
  for (const size of sizes) {
    if (estimateTextWidth(text, size) <= maxWidth) return { size, text };
  }
  const size = sizes[sizes.length - 1];
  const truncated = truncateToWidth(text, size, maxWidth);
  return truncated ? { size, text: truncated } : null;
}

// --- 데이터 --------------------------------------------------------------

interface HeatmapLeaf {
  [key: string]: unknown;
  name: string;
  size: number;
  changePct: number | undefined;
  pending: boolean;
  unavailable: boolean;
  value: number;
  groupName: string;
  groupId: string;
  groupColor: string;
  /** 그룹 내 최대 보유 종목(정렬 후 0번째) — squarify가 이 종목을 그룹 영역의
   * 좌상단에 배치하는 경향을 이용해, 그 타일 모서리에 그룹명을 얹는다(아래 참고). */
  isFirstInGroup: boolean;
}

interface HeatmapGroupNode {
  [key: string]: unknown;
  name: string;
  groupId: string;
  color: string;
  children: HeatmapLeaf[];
}

function buildHeatmapData(
  holdings: HoldingCalc[],
  dailyChangeByTicker: Record<string, number>,
  isLoadingDailyChanges: boolean,
): HeatmapGroupNode[] {
  // /holdings는 항상 active-only fetchHoldings() 결과만 다뤄서 groupId가 null일
  // 일이 없다(소프트 삭제된 종목에만 null이 생김, lib/api/groups.ts's deleteGroup).
  const byGroup = new Map<string, HeatmapGroupNode>();
  for (const h of holdings) {
    if (h.value <= 0) continue; // 트리맵 면적은 양수만 가능 — 수량 0인 종목 등은 제외
    let group = byGroup.get(h.groupId!);
    if (!group) {
      group = { name: h.groupName, groupId: h.groupId!, color: h.groupColor, children: [] };
      byGroup.set(h.groupId!, group);
    }
    // ticker가 없는 현금성 자산은 시세 자체가 없어 등락도 없다(항상 중립) — API 조회 대상이 아니다.
    const changePct = h.ticker === null ? 0 : dailyChangeByTicker[h.ticker];
    // pending: 첫 조회가 아직 진행 중. unavailable: 조회는 끝났는데 이 종목만 실패(레이트리밋 등) —
    // 이 둘을 구분하지 않으면 실패한 종목이 "등락 없음(0%)"으로 보여서 데이터가 거짓말을 하게 된다.
    const pending = h.ticker !== null && changePct === undefined && isLoadingDailyChanges;
    const unavailable = h.ticker !== null && changePct === undefined && !isLoadingDailyChanges;
    group.children.push({
      name: shortHoldingLabel(h),
      size: h.value,
      changePct,
      pending,
      unavailable,
      value: h.value,
      groupName: h.groupName,
      groupId: h.groupId!,
      groupColor: h.groupColor,
      isFirstInGroup: false,
    });
  }
  return [...byGroup.values()]
    .map((group) => {
      const sortedChildren = [...group.children].sort((a, b) => b.value - a.value);
      if (sortedChildren[0]) sortedChildren[0] = { ...sortedChildren[0], isFirstInGroup: true };
      return { ...group, children: sortedChildren };
    })
    .sort((a, b) => b.children.reduce((sum, c) => sum + c.value, 0) - a.children.reduce((sum, c) => sum + c.value, 0));
}

const LEAF_PADDING = 6;
const LEAF_MIN_WIDTH = 18;
const LEAF_MIN_HEIGHT = 14;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts Treemap content는 depth별로 다른 커스텀 필드를 노드에 섞어 넘겨준다.
function HeatmapContent(props: any) {
  const { x, y, width, height, depth, name } = props;
  const onGroupClick: ((groupId: string) => void) | undefined = props.onGroupClick;

  if (depth === 1) {
    // 그룹명은 여기서 그리지 않는다 — 부모(그룹)가 자식(leaf)보다 먼저 렌더링되기 때문에
    // 텍스트를 넣으면 뒤이어 그려지는 leaf 타일에 완전히 덮인다. 대신 그룹의 최대 보유
    // 종목 타일(depth===2, isFirstInGroup) 모서리에 겹쳐 그린다 — 그 타일은 자기 자신을
    // 그리는 시점이라 z-order 문제가 없다. 이 사각형은 얇은 색 테두리(그룹 경계)만 맡는다.
    const color: string = props.color ?? 'var(--border)';
    const groupId: string = props.groupId;
    return (
      <g onClick={() => onGroupClick?.(groupId)} style={{ cursor: onGroupClick ? 'pointer' : undefined }}>
        <rect x={x} y={y} width={width} height={height} fill="none" stroke={color} strokeWidth={2} rx={3} />
      </g>
    );
  }

  if (depth === 2) {
    const changePct: number | undefined = props.changePct;
    const pending: boolean = !!props.pending;
    const unavailable: boolean = !!props.unavailable;
    const { fill } = heatmapStyle(changePct, pending, unavailable);

    let nameNode: React.ReactNode = null;
    let pctNode: React.ReactNode = null;
    if (width > LEAF_MIN_WIDTH && height > LEAF_MIN_HEIGHT) {
      const availWidth = width - LEAF_PADDING * 2;
      const nameFit = bestFit(name, NAME_SIZES, availWidth);
      const pctText = pending ? '···' : unavailable ? 'N/A' : fmtSigned(changePct ?? 0);
      const canShowTwoLines = nameFit && height >= nameFit.size * 2 + 12;
      const pctFit = canShowTwoLines ? bestFit(pctText, PCT_SIZES, availWidth) : null;

      if (nameFit) {
        const singleLine = !pctFit;
        nameNode = (
          <text
            x={x + width / 2}
            y={y + height / 2 + (singleLine ? nameFit.size / 3 : -4)}
            textAnchor="middle"
            fontSize={nameFit.size}
            fontWeight={600}
            fill={WHITE_INK}
            stroke={TEXT_OUTLINE}
            strokeWidth={3}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {nameFit.text}
          </text>
        );
      }
      if (pctFit) {
        pctNode = (
          <text
            x={x + width / 2}
            y={y + height / 2 + (nameFit ? nameFit.size : 0) + 2}
            textAnchor="middle"
            fontSize={pctFit.size}
            fontWeight={600}
            fill={WHITE_INK}
            stroke={TEXT_OUTLINE}
            strokeWidth={3}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {pctFit.text}
          </text>
        );
      }
    }

    // 그룹명은 그룹 안 최대 보유 종목 타일(isFirstInGroup) 모서리에 겹쳐 그린다 — depth-1
    // 사각형에 넣으면 뒤이어 그려지는 leaf에 덮이지만, 이건 그 leaf 자신의 렌더링이라
    // z-order 문제가 없다. 타일이 라벨 하나 들어갈 만큼은 되어야 겹치지 않는다.
    const isFirstInGroup: boolean = !!props.isFirstInGroup;
    const groupName: string = props.groupName;
    // 그룹 경계에 쓰는 groupColor(레벨0, L48%)는 어두운 칩 배경 위에서 대비가 3:1 안팎이라
    // 타이틀 텍스트로는 약하다(계산해서 확인함) — 같은 색상(hue)의 더 밝은 톤(레벨2, L74%,
    // 대비 ~9:1)으로 다시 뽑아 타이틀에만 쓴다.
    const groupColorLabel: string = props.groupColor ? colorFor(hexToHue(props.groupColor), 2) : WHITE_INK;
    const groupLabelFit =
      isFirstInGroup && width > 70 && height > 56 ? bestFit(groupName, GROUP_LABEL_SIZES, width - 10) : null;

    // 그룹 사각형은 leaf들에 완전히 가려지므로(nodeInset 여백만 노출), leaf도 같은
    // onGroupClick을 걸어야 "그룹 영역 아무 데나 클릭"이 실제로 동작한다.
    const groupId: string | undefined = props.groupId;
    return (
      <g onClick={() => groupId && onGroupClick?.(groupId)} style={{ cursor: onGroupClick ? 'pointer' : undefined }}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          fillOpacity={unavailable ? 0.55 : 1}
          stroke="#fff"
          strokeWidth={1}
        >
          {pending && <animate attributeName="fill-opacity" values="1;0.55;1" dur="1.4s" repeatCount="indefinite" />}
        </rect>
        {groupLabelFit && (() => {
          // estimateTextWidth는 truncateToWidth 안전 마진을 위해 넉넉하게 잡은 근사치라,
          // 칩에 그대로 쓰면 글자 오른쪽에 여백이 남는다 — 칩 전용으로 살짝 줄여서 쓴다.
          const chipPadX = 4;
          const chipPadY = 3;
          const chipWidth = estimateTextWidth(groupLabelFit.text, groupLabelFit.size) * 0.85 + chipPadX * 2;
          const chipHeight = groupLabelFit.size + chipPadY * 2;
          return (
            <>
              {/* 타일 색이 뭐가 됐든 타이틀이 또렷하게 보이도록, 텍스트 외곽선 대신 불투명한
                  칩 배경을 깐다 — 옅은 색 타일 위에서 얇은 외곽선만으로는 여전히 흐릿했다. */}
              <rect x={x + 4} y={y + 4} width={chipWidth} height={chipHeight} rx={3} fill="rgba(0,0,0,0.72)" />
              <text
                x={x + 4 + chipPadX}
                y={y + 4 + chipHeight / 2}
                dominantBaseline="middle"
                fontSize={groupLabelFit.size}
                fontWeight={700}
                fill={groupColorLabel}
              >
                {groupLabelFit.text}
              </text>
            </>
          );
        })()}
        {nameNode}
        {pctNode}
      </g>
    );
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts Tooltip content 시그니처
function HeatmapTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const node = payload[0]?.payload;
  if (!node || node.depth !== 2) return null;
  const { fill } = heatmapStyle(node.changePct, node.pending, node.unavailable);
  const statusText = node.pending
    ? '등락률 조회 중…'
    : node.unavailable
      ? '등락률을 가져오지 못했습니다'
      : `${fmtSigned(node.changePct ?? 0)} (일일 등락률)`;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-semibold">{node.name}</p>
      <p className="text-xs text-muted-foreground">{node.groupName}</p>
      <p className="mt-1 font-mono">{fmtWon(node.value)}</p>
      <p className="font-mono" style={{ color: node.unavailable ? undefined : fill }}>
        {statusText}
      </p>
    </div>
  );
}

const LEGEND_STEPS: { label: string; changePct: number }[] = [
  { label: '-5%↓', changePct: -5 },
  { label: '-2.5%', changePct: -2.5 },
  { label: '-1%', changePct: -1 },
  { label: '0%', changePct: 0 },
  { label: '+1%', changePct: 1 },
  { label: '+2.5%', changePct: 2.5 },
  { label: '+5%↑', changePct: 5 },
];

function HeatmapLegend() {
  return (
    <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
      <span>하락</span>
      {LEGEND_STEPS.map((step) => (
        <div key={step.label} className="flex flex-col items-center gap-1">
          <span className="size-4 rounded" style={{ background: heatmapStyle(step.changePct, false).fill }} />
          <span>{step.label}</span>
        </div>
      ))}
      <span>상승</span>
    </div>
  );
}

export function HoldingsHeatmap({
  holdings,
  dailyChangeByTicker,
  isLoadingDailyChanges,
}: {
  holdings: HoldingCalc[];
  dailyChangeByTicker: Record<string, number>;
  isLoadingDailyChanges: boolean;
}) {
  const [zoomedGroupId, setZoomedGroupId] = useState<string | null>(null);

  const allData = useMemo(
    () => buildHeatmapData(holdings, dailyChangeByTicker, isLoadingDailyChanges),
    [holdings, dailyChangeByTicker, isLoadingDailyChanges],
  );

  const zoomedGroup = zoomedGroupId ? allData.find((g) => g.groupId === zoomedGroupId) : undefined;
  // 그룹 하나로 좁히면 같은 depth1(그룹)/depth2(종목) 구조를 그대로 유지한 채 배열
  // 길이만 1로 줄인다 — squarify가 그 하나짜리 그룹을 캔버스 전체에 채워 자동으로
  // "확대"된 것처럼 보이고, 별도의 flat 렌더 모드를 만들 필요가 없다.
  const data = zoomedGroup ? [zoomedGroup] : allData;

  if (allData.length === 0) {
    return <p className="text-sm text-muted-foreground">표시할 종목이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-6 items-center gap-1.5 text-sm">
        {zoomedGroup ? (
          <button
            type="button"
            onClick={() => setZoomedGroupId(null)}
            className="flex items-center gap-1 font-semibold text-foreground hover:underline"
          >
            ← 전체 자산군
          </button>
        ) : (
          <span className="text-muted-foreground">전체 자산군 — 자산군을 클릭하면 확대됩니다</span>
        )}
        {zoomedGroup && <span className="text-muted-foreground">/ {zoomedGroup.name}</span>}
      </div>

      <div
        className="h-120 w-full rounded-lg p-2"
        style={{ background: HEATMAP_CANVAS_BG, border: `1px solid ${HEATMAP_CANVAS_BORDER}` }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={4 / 3}
            nodeInset={4}
            content={<HeatmapContent onGroupClick={setZoomedGroupId} />}
            isAnimationActive={false}
          >
            <Tooltip content={<HeatmapTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <HeatmapLegend />
    </div>
  );
}
