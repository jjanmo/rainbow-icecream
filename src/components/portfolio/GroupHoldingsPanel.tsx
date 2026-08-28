import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { colorFor, hueForGroupIndex } from "@/lib/calc/color";
import { fmtPct, fmtUsd, fmtWon, shortHoldingLabel } from "@/lib/format";
import type { GroupCalc } from "@/lib/calc/rebalance";

/** Read-mode expanded group panel: a donut of each holding's share within
 * the group (by current value) on the left, a plain list on the right, and a
 * 목표/실제/차이 합계 행 at the bottom (absorbed from the old standalone 비중
 * 체크 page, ADR-0056) — this is the group's own rebalance check, right where
 * its holdings already are, instead of a separate page repeating the shape.
 *
 * Slice/dot colors here are independent of each holding's `color` (a tint of
 * the *group's* hue, used elsewhere) — this panel is a self-contained view of
 * one group, so its holdings get their own evenly-spaced distinct hues
 * (reusing the same "position around the wheel" logic as group colors). */
export function GroupHoldingsPanel({ group }: { group: GroupCalc }) {
  const holdings = group.members;
  const [activeId, setActiveId] = useState<string | null>(null);

  const distinctColors = holdings.map((_, i) => colorFor(hueForGroupIndex(i, holdings.length), 0));
  const hasValue = holdings.some((h) => h.value > 0);
  const chartData = hasValue
    ? holdings.map((h, i) => ({ id: h.id, value: h.actualPctInGroup, color: distinctColors[i] }))
    : [{ id: "empty", value: 1, color: "var(--muted)" }];
  const active = holdings.find((h) => h.id === activeId);

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
          {/* Center readout, mirroring AllocationDonutChart — driven by the same
              activeId as the list on the right, so hovering either surface fills it. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex size-18 flex-col items-center justify-center rounded-full bg-card text-center">
              {active ? (
                <>
                  <span className="max-w-15 truncate text-[9.5px] text-muted-foreground">
                    {shortHoldingLabel(active)}
                  </span>
                  <span className="font-mono text-[13px] font-semibold">{fmtPct(active.actualPctInGroup)}</span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">비중</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {/* ticker/account/value/pct 전부 고정폭 + 우측 정렬이라, 티커가 없는
            종목(현금성 자산 등)이 섞여 있어도 열이 흔들리지 않는다 — 예전엔
            티커를 조건부로만 렌더링해서(`h.ticker &&`) 있는 행과 없는 행의
            나머지 칸이 서로 어긋났다. */}
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
              <span className="w-14 shrink-0 truncate font-mono text-muted-foreground">{h.ticker ?? ""}</span>
              <span className="flex-1 truncate">{h.name}</span>
              <span className="w-16 shrink-0 truncate text-right text-muted-foreground">{h.account || "-"}</span>
              {/* w-52 — 해외 종목의 원화+달러 병기("₩999,999,999($714,285.71)"류,
                  괄호 안 포함 최대 약 184px 실측)가 원화 억 단위까지 커져도
                  옆 % 칸과 안 겹치게, w-32(128px)보다 넉넉히 잡았다. */}
              <span className="w-52 shrink-0 text-right font-mono">
                {fmtWon(h.value)}
                {isOverseas && <span className="ml-1 text-muted-foreground">({fmtUsd(h.valueNative)})</span>}
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-muted-foreground">
                {fmtPct(h.actualPctInGroup)}
              </span>
            </button>
          );
        })}

        {/* 목표/실제/조정금 합계 — 이 자산군의 비중 체크 그 자체. actionAmount는 이미
            targetValue - actualValue라 targetValue를 다시 구하지 않고 더해서 얻는다.
            "조정금"은 위 접힌 줄의 %p 차이와 성격이 다르다 — 그건 "지금 비중이
            얼마나 벗어났나"(상승/하락과 같은 계열의 diffColor로 표현), 이건
            "그래서 얼마를 사고팔아야 하나"라는 행동값이라 방향은 부호(+/-)로만
            나타내고 색은 항상 하나로 고정해 "조치가 필요한 숫자"라는 것 자체를
            강조한다 — diffColor(부호별로 갈리는 색)를 쓰지 않는다. 처음엔
            text-primary(딸기, 빨강 계열)를 썼는데, 그러면 diff-rise/LOSS_COLOR와
            같은 빨강 계열이라 "차이"의 상승 신호처럼 헷갈릴 수 있다는 피드백을
            받아 — 완전히 다른 색 계열인 flavor-mango(호박/amber)로 바꿨다. 브랜드
            팔레트에서 아직 다른 신호로 쓰이지 않은 색(민트=GOOD_COLOR, 딸기=낙관/
            액센트, 파랑/빨강=diff-rise/fall)이라 새 의미를 얹기에 충돌이 없다.
            "차이"가 아니라 "조정금"이라 부르는 것도 예전 RebalanceTable이 쓰던
            이름을 그대로 되살린 것이다. GroupCard의 목표/실제/차이 칸과 같은
            "라벨 위, 값 아래, 고정폭" 패턴을 재사용해 하나의 시각 언어로
            읽히게 했다. 리밸런싱 판정 배지·기준선(REBALANCE_THRESHOLD)은
            이번 범위에서 뺐다(ADR-0056). */}
        <div className="mt-1 flex items-end gap-4 border-t border-border pt-2">
          <span className="mr-auto text-[11px] text-muted-foreground">합계</span>
          <span className="flex w-32 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">목표</span>
            <span className="font-mono text-sm">{fmtWon(group.value + group.actionAmount)}</span>
          </span>
          <span className="flex w-32 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">평가금</span>
            <span className="font-mono text-sm">{fmtWon(group.value)}</span>
          </span>
          <span className="flex w-32 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">조정금</span>
            <span className="text-flavor-mango font-mono text-sm font-bold">
              {group.actionAmount >= 0 ? "+" : "-"}
              {fmtWon(Math.abs(group.actionAmount))}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
