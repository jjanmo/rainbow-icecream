import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtPct } from "@/lib/format";
import { useEditableField, useEditableNumberField } from "@/hooks/useEditableField";
import { groupColor, hueForFlavorIndex, tintForIndex } from "@/lib/calc/color";
import { GOOD_COLOR } from "@/lib/calc/rebalance";
import type { DraftGroup, DraftHolding } from "@/lib/setupDraft";
import { EditHoldingInlineRow } from "./EditHoldingInlineRow";
import { SwatchPicker } from "./SwatchPicker";

export function EditGroupCard({
  group,
  holdings,
  onUpdate,
  onDelete,
  onAddHolding,
  onUpdateHolding,
  onDeleteHolding,
}: {
  group: DraftGroup;
  /** This group's holdings, in stable order. */
  holdings: DraftHolding[];
  onUpdate: (patch: Partial<Pick<DraftGroup, "name" | "targetPct" | "flavorIndex">>) => void;
  onDelete: () => void;
  onAddHolding: () => void;
  onUpdateHolding: (
    clientKey: string,
    patch: Partial<Pick<DraftHolding, "ticker" | "name" | "targetPctInGroup">>,
  ) => void;
  onDeleteHolding: (clientKey: string) => void;
}) {
  const name = useEditableField(group.name, (v) => onUpdate({ name: v }));
  const targetPct = useEditableNumberField(group.targetPct, (v) => onUpdate({ targetPct: v }));

  const hue = hueForFlavorIndex(group.flavorIndex);
  const memberTargetSum = holdings.reduce((sum, h) => sum + h.targetPctInGroup, 0);
  const memberTargetSumWarn = holdings.length > 0 && Math.abs(memberTargetSum - 100) > 0.5;
  const memberTargetGap = 100 - memberTargetSum;
  const wholeTargetGap = (memberTargetGap * group.targetPct) / 100;

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-5 sm:p-6">
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <div className="size-3.5 shrink-0 rounded-full" style={{ background: groupColor(group.flavorIndex) }} />
        <Input
          value={name.value}
          onChange={(e) => name.onChange(e.target.value)}
          onBlur={name.onBlur}
          className="h-8 min-w-25 flex-1 border-none bg-transparent px-0 text-[15px] font-semibold shadow-none focus-visible:ring-0"
        />
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span
            className={`text-[11px] ${memberTargetSumWarn ? "text-destructive" : ""}`}
            style={memberTargetSumWarn ? undefined : { color: GOOD_COLOR }}
          >
            {memberTargetSumWarn
              ? memberTargetGap > 0
                ? `그룹내 ${fmtPct(memberTargetGap, 0)} 부족`
                : `그룹내 ${fmtPct(-memberTargetGap, 0)} 초과`
              : `그룹내 ${fmtPct(memberTargetSum, 0)}`}
          </span>
          <span className="text-[11px] text-muted-foreground">·</span>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">전체의</span>
            <Input
              type="text"
              inputMode="decimal"
              value={targetPct.value}
              onChange={(e) => targetPct.onChange(e.target.value)}
              onBlur={targetPct.onBlur}
              className="h-8 w-14 text-right font-mono text-xs"
            />
            <span className="text-[11px] text-muted-foreground">%</span>
          </div>
          {memberTargetSumWarn && (
            <span className="text-[11px] text-destructive">
              (환산 시{" "}
              {memberTargetGap > 0 ? `${fmtPct(wholeTargetGap, 1)} 부족` : `${fmtPct(-wholeTargetGap, 1)} 초과`})
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          title="자산군 삭제 시 하위 종목도 함께 삭제됩니다"
          className="shrink-0 text-muted-foreground"
        >
          삭제
        </Button>
      </div>

      <SwatchPicker flavorIndex={group.flavorIndex} onSelect={(flavorIndex) => onUpdate({ flavorIndex })} />

      {holdings.map((holding, index) => (
        <EditHoldingInlineRow
          key={holding.clientKey}
          holding={holding}
          color={tintForIndex(hue, index, holdings.length)}
          targetPctOfWhole={(group.targetPct * holding.targetPctInGroup) / 100}
          onUpdate={(patch) => onUpdateHolding(holding.clientKey, patch)}
          onDelete={() => onDeleteHolding(holding.clientKey)}
        />
      ))}

      <button
        type="button"
        onClick={onAddHolding}
        className="mt-2.5 w-full rounded-lg border-[1.5px] border-dashed border-border py-2.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        + 종목 추가
      </button>
    </div>
  );
}
