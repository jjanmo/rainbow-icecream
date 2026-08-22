import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

/** "기초잔고" 개념을 설명하는 "?" 트리거 — `HoldingFormDialog`의 `AssetTypeHelp`와
 * 같은 모양. 기초잔고는 이제 "+ 새 종목" 흐름과 "기초잔고 보기" 목록에서만 나타나고
 * (ADR-0050), 어느 쪽도 항목별 배지가 필요 없다 — 새 종목 흐름은 체크박스 자체가
 * 설명을 겸하고, 목록은 행 전부가 기초잔고라 반복이므로 헤더에서 한 번만 설명하면
 * 된다. 그래서 이전에 있던 행별 배지(`OpeningBalanceBadge`)는 걷어냈다. */
export function OpeningBalanceHelp({ className = '' }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="기초잔고가 무엇인지 보기"
        className={`inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-[10px] leading-none font-normal text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground ${className}`}
      >
        ?
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 text-left">
        <PopoverHeader>
          <PopoverTitle className="text-[13px]">기초잔고란?</PopoverTitle>
          <PopoverDescription className="text-xs leading-relaxed">
            매매일지를 쓰기 시작하기 전부터 갖고 있던 잔고를 기록한 체결입니다. 매매일이 없어서 캘린더에는 안
            보이고, 매매 횟수·보유일수 같은 집계에도 포함되지 않습니다.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
