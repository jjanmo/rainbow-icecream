import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fmtPct, fmtSigned } from '@/lib/format';
import { diffColor, type GroupCalc } from '@/lib/calc/rebalance';
import { GroupHoldingsPanel } from './GroupHoldingsPanel';

/** 목표/실제/차이를 접힌 줄에서 바로 보여준다 — 예전엔 별도 "비중 체크" 페이지
 * 표에서만 보이던 내용이다(ADR-0056). 차이는 부호(diffColor)만으로 매수/매도
 * 방향을 나타내고, "유지/매수 필요/매도 필요" 같은 판정 배지는 두지 않는다 —
 * 그 판정 기준(REBALANCE_THRESHOLD)은 이번 범위에서 뺐다. */
export function GroupCard({ group }: { group: GroupCalc }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-5 sm:p-6 ">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`flex w-full flex-wrap items-center gap-3 text-left ${expanded ? 'pb-2' : ''} cursor-pointer`}
      >
        <div className="size-3.5 shrink-0 rounded-full" style={{ background: group.color }} />
        <span className="flex-1 text-[15px] font-semibold">{group.name}</span>

        {/* 고정폭 3칸이라 자산군 이름 길이와 무관하게 카드마다 숫자가 같은
            x축 위치에서 시작한다 — flex 줄바꿈만으론 카드마다 들쭉날쭉해서
            눈에 잘 안 들어온다는 피드백으로 바꿈. */}
        <div className="flex shrink-0 items-end gap-3">
          <span className="flex w-16 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">목표</span>
            <span className="font-mono text-sm">{fmtPct(group.targetPct)}</span>
          </span>
          <span className="flex w-16 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">실제</span>
            <span className="font-mono text-sm">{fmtPct(group.actualPct)}</span>
          </span>
          <span className="flex w-16 flex-col items-end leading-tight">
            <span className="text-[10px] text-muted-foreground">차이</span>
            <span className="font-mono text-sm font-semibold" style={{ color: diffColor(group.diff) }}>
              {fmtSigned(group.diff)}p
            </span>
          </span>
        </div>

        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && <GroupHoldingsPanel group={group} />}
    </div>
  );
}
