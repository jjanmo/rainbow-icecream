import Link from 'next/link';
import { useRouter } from 'next/router';
import { LogOut } from 'lucide-react';
import { LogoMark } from '@/components/brand/LogoMark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/setup', label: '포트폴리오 설정' },
  { href: '/rebalance', label: '비중 체크' },
  { href: '/holdings', label: '보유 종목' },
  { href: '/journal', label: '매매일지' },
] as const;

export function TopNav() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 sm:px-8">
      <Link href="/setup" className="flex items-center gap-2.5">
        <LogoMark size={34} />
        <div className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-tight text-foreground">Rainbow Icecream</span>
        </div>
      </Link>

      <div className="flex flex-wrap items-center gap-1.5">
        {NAV_ITEMS.map((item) => {
          const active = router.pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
        <Button variant="ghost" size="icon" title="로그아웃" onClick={handleSignOut}>
          <LogOut />
        </Button>
      </div>
    </div>
  );
}
