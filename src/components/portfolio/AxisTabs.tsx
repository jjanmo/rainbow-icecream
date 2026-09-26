import { useEffect } from "react";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import type { PortfolioAxis } from "@/types/domain";

/** URL 쿼리 `?axis=`에서 현재 축을 읽는다 — 없으면 `role`(기본). */
export function useAxisFromQuery(): PortfolioAxis {
  const { query } = useRouter();
  const raw = Array.isArray(query.axis) ? query.axis[0] : query.axis;
  return raw === "market" ? "market" : "role";
}

const AXIS_ITEMS: { id: PortfolioAxis; label: string }[] = [
  { id: "role", label: "역할" },
  { id: "market", label: "시장" },
];

/**
 * `/portfolio`의 축 전환 — 고정 2-way(역할/시장, ADR-0062). 더 이상 유저가 탭을 만들거나
 * 순서를 바꾸지 않는다(자유 커스텀 탭 시스템 폐기) — plain 세그먼트 버튼(ADR-0051 패턴).
 */
export function AxisTabs({ axis, isLocked }: { axis: PortfolioAxis; isLocked: boolean }) {
  const router = useRouter();
  const { isReady, pathname, query } = router;
  const rawAxis = Array.isArray(query.axis) ? query.axis[0] : query.axis;

  useEffect(() => {
    if (!isReady) return;
    if (rawAxis) return;
    void router.replace({ pathname, query: { axis: "role" } }, undefined, { shallow: true });
  }, [isReady, rawAxis, pathname, router]);

  function select(next: PortfolioAxis) {
    if (isLocked) return;
    void router.replace({ pathname, query: { axis: next } }, undefined, { shallow: true });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {AXIS_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => select(item.id)}
          disabled={isLocked}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
            axis === item.id
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
