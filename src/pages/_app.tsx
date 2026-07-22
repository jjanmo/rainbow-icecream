import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { fontMono, fontSans } from "@/lib/fonts";
import "@/styles/globals.css";

const BARE_PATHS = new Set(["/login"]);

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const router = useRouter();
  const isBare = BARE_PATHS.has(router.pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <div className={`${fontSans.variable} ${fontMono.variable} font-sans`}>
        {isBare ? (
          <Component {...pageProps} />
        ) : (
          <AppShell>
            <Component {...pageProps} />
          </AppShell>
        )}
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
