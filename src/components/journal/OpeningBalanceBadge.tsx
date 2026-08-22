import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

/** intent === 'OPENING_BALANCE'인 체결에 붙이는 배지 — 클릭하면 뜻을 설명하는
 * 팝오버가 뜬다 (/rebalance 리밸런싱 헤더의 "?" 설명과 같은 패턴, 클릭 토글). */
export function OpeningBalanceBadge({ className = '' }: { className?: string }) {
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Popover>
        <PopoverTrigger
          render={<Badge variant="outline" className={`cursor-pointer font-normal text-muted-foreground ${className}`} />}
        >
          기초잔고
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 text-left">
          <PopoverHeader>
            <PopoverTitle className="text-[13px]">기초잔고란?</PopoverTitle>
            <PopoverDescription className="text-xs leading-relaxed">
              매매일지를 쓰기 시작하기 전부터 갖고 있던 잔고를 기록한 체결입니다. 실제 매매가 아니라서 매수/매도
              합계와 매매 횟수·보유일수 같은 집계에는 포함되지 않습니다.
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </span>
  );
}
