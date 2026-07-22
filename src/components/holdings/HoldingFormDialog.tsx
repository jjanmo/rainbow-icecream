import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Holding, NewHolding, Region } from "@/types/domain";

// qty/avgPrice are edited as free-form text (not `type="number"`) and only
// parsed to numbers on submit — a controlled number input whose value starts
// at 0 can't be typed into normally (e.g. typing "1" after "0" needs the "0"
// cleared first, which the browser gets in an inconsistent, cursor-dependent
// way, producing artifacts like "010").
type Draft = Omit<NewHolding, "groupId" | "qty" | "avgPrice">;

const EMPTY_DRAFT: Draft = {
  ticker: "",
  name: "",
  targetPctInGroup: 0,
  account: "일반계좌",
  region: "국내",
  memo: "",
};

const REGION_ITEMS = [
  { label: "국내", value: "국내" },
  { label: "해외", value: "해외" },
];

const ACCOUNT_TYPES = [
  "일반계좌",
  "ISA",
  "연금저축",
  "IRP",
  "CMA",
  "파킹통장",
  "예적금",
  "기타",
];
const ACCOUNT_ITEMS = ACCOUNT_TYPES.map((v) => ({ label: v, value: v }));

function toDraft(holding: Holding): Draft {
  return {
    ticker: holding.ticker ?? "",
    name: holding.name,
    targetPctInGroup: holding.targetPctInGroup,
    account: holding.account ?? "",
    region: holding.region,
    memo: holding.memo ?? "",
  };
}

export function HoldingFormDialog({
  open,
  onOpenChange,
  groupOptions,
  defaultGroupId,
  initialHolding,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupOptions: { id: string; name: string }[];
  defaultGroupId: string | null;
  /** When set, the dialog edits this holding instead of creating a new one. */
  initialHolding?: Holding | null;
  onSubmit: (holding: NewHolding) => void;
}) {
  const isEdit = !!initialHolding;
  const [groupId, setGroupId] = useState(initialHolding?.groupId ?? defaultGroupId ?? "");
  const [draft, setDraft] = useState<Draft>(initialHolding ? toDraft(initialHolding) : EMPTY_DRAFT);
  const [qtyText, setQtyText] = useState(initialHolding ? String(initialHolding.qty) : "");
  const [avgPriceText, setAvgPriceText] = useState(initialHolding ? String(initialHolding.avgPrice) : "");
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset/prefill the form when the dialog transitions to open — adjusted
  // during render rather than in an effect, see https://react.dev/learn/you-might-not-need-an-effect
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setGroupId(initialHolding?.groupId ?? defaultGroupId ?? groupOptions[0]?.id ?? "");
      setDraft(initialHolding ? toDraft(initialHolding) : EMPTY_DRAFT);
      setQtyText(initialHolding ? String(initialHolding.qty) : "");
      setAvgPriceText(initialHolding ? String(initialHolding.avgPrice) : "");
    }
  }

  const qty = parseFloat(qtyText) || 0;
  const avgPrice = parseFloat(avgPriceText) || 0;

  const canSubmit =
    !!groupId &&
    draft.name.trim().length > 0 &&
    qty > 0 &&
    avgPrice > 0 &&
    (draft.account ?? "").trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ ...draft, groupId, qty, avgPrice });
    onOpenChange(false);
  }

  const groupItems = groupOptions.map((g) => ({ label: g.name, value: g.id }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "종목 수정" : "종목 추가"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>
              자산군 <span className="text-destructive">*</span>
            </Label>
            <Select items={groupItems} value={groupId} onValueChange={(v) => setGroupId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="자산군 선택" />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>티커</Label>
              <Input
                value={draft.ticker ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, ticker: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="flex flex-2 flex-col gap-1.5">
              <Label>
                종목명 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
          </div>

          <p className="text-[11.5px] text-muted-foreground">
            티커를 비워두면 시세 조회를 하지 않고 평균매입가를
            현재가로 사용합니다 — CMA·예금 등 실제로 거래되지 않는 자산에 활용하세요.
          </p>

          <div className="flex gap-2.5">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>
                보유수량 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>
                평균매입가 (KRW) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                value={avgPriceText}
                onChange={(e) => setAvgPriceText(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex gap-2.5">
            <div className="flex w-24 flex-col gap-1.5">
              <Label>
                구분 <span className="text-destructive">*</span>
              </Label>
              <Select
                items={REGION_ITEMS}
                value={draft.region}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, region: v as Region }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="국내">국내</SelectItem>
                  <SelectItem value="해외">해외</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>
                계좌 <span className="text-destructive">*</span>
              </Label>
              <Select
                items={ACCOUNT_ITEMS}
                value={draft.account ?? ""}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, account: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="계좌 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>비고</Label>
            <Input
              value={draft.memo ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? "수정" : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
