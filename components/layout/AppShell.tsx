import type { ReactNode } from "react";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-[1360px] px-4 pt-8 pb-20 sm:px-8">{children}</div>
    </div>
  );
}
