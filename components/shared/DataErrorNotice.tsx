import { useEffect } from "react";
import { getErrorMessage } from "@/lib/utils";

export function DataErrorNotice({ error }: { error: unknown }) {
  useEffect(() => {
    // Details go to the console only — never rendered, so schema/DB
    // internals aren't exposed on screen.
    console.error("Failed to load data:", getErrorMessage(error));
  }, [error]);

  return (
    <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <p className="font-medium text-destructive">데이터를 불러오지 못했습니다.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        잠시 후 다시 시도해주세요. 문제가 계속되면 브라우저 콘솔의 에러 메시지를 확인해주세요.
      </p>
    </div>
  );
}
