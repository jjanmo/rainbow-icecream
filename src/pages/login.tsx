import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { LogoMark } from '@/components/brand/LogoMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const redirectTo = typeof router.query.redirectTo === 'string' ? router.query.redirectTo : '/portfolio';
  const noAccess = router.query.error === 'no_access';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus('error');
      return;
    }

    // Hard navigation so the proxy's app_metadata check runs before any
    // protected page renders (a soft client-side transition could otherwise
    // briefly show the destination before the access check catches up).
    window.location.assign(redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-3 text-center">
          <LogoMark size={40} />
          <div>
            <div className="text-lg font-semibold tracking-tight">Rainbow Icecream</div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={status === 'loading'} className="w-full">
              {status === 'loading' ? '로그인 중...' : '로그인'}
            </Button>
            {status === 'error' && (
              <p className="text-center text-sm text-destructive">이메일 또는 비밀번호가 올바르지 않습니다.</p>
            )}
            {noAccess && status !== 'error' && (
              <p className="text-center text-sm text-destructive">이 계정은 이 앱에 대한 접근 권한이 없습니다.</p>
            )}
            <p className="text-center text-xs text-muted-foreground">초대된 사용자만 로그인할 수 있습니다.</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
