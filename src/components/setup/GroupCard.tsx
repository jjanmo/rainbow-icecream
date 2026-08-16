import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fmtPct } from '@/lib/format';
import type { GroupCalc } from '@/lib/calc/rebalance';
import { HoldingInlineRow } from './HoldingInlineRow';

export function GroupCard({ group }: { group: GroupCalc }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-5 sm:p-6 ">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`flex w-full flex-wrap items-center gap-2.5 text-left ${expanded ? 'pb-2' : ''} cursor-pointer`}
      >
        <div className="size-3.5 shrink-0 rounded-full" style={{ background: group.color }} />
        <span className="flex-1 text-[15px] font-semibold">{group.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">전체의 {fmtPct(group.targetPct, 0)}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && group.members.map((holding) => <HoldingInlineRow key={holding.id} holding={holding} />)}
    </div>
  );
}
