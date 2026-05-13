'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

const REMEMBERED_EMAIL_KEY = 'bm:last_email';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [loading, setLoading] = useState(false);

  // Auto-login flow on page load:
  //   1) Pre-fill email from localStorage (last successful login)
  //   2) Try Credential Management API — if browser has a saved password,
  //      sign in silently and redirect. User won't even see this screen.
  useEffect(() => {
    const remembered = typeof window !== 'undefined' ? localStorage.getItem(REMEMBERED_EMAIL_KEY) : null;
    if (remembered) setEmail(remembered);

    // Try silent auto-login via stored credentials (if browser supports + has saved password)
    (async () => {
      try {
        const nav: any = navigator;
        if (!nav?.credentials?.get) return;
        const cred: any = await nav.credentials.get({ password: true, mediation: 'silent' });
        if (cred?.id && cred?.password) {
          const { error } = await supabase.auth.signInWithPassword({
            email: cred.id,
            password: cred.password,
          });
          if (!error) {
            localStorage.setItem(REMEMBERED_EMAIL_KEY, cred.id);
            // Best-effort: record the login event (auto-login via stored credential)
            fetch('/api/auth/log-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: 'auto-credential' }),
            }).catch(() => {});
            router.push('/');
            router.refresh();
          }
        }
      } catch {
        // Silent failure — fall back to manual login
      }
    })();
  }, [router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const fn =
        mode === 'sign_in'
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
            });
      const { error } = await fn;
      if (error) throw error;
      if (mode === 'sign_up') {
        toast({ title: 'נשלח מייל אימות', description: 'אנא בדוק את תיבת הדואר שלך לאישור החשבון.' });
      } else {
        // Best-effort: record the login event (visible later in /settings/security)
        fetch('/api/auth/log-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'password' }),
        }).catch(() => {});

        // Persist email + offer credential storage so future visits auto-login
        try {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
          const nav: any = navigator;
          if (nav?.credentials?.store && typeof (window as any).PasswordCredential === 'function') {
            const cred = new (window as any).PasswordCredential({
              id: email,
              password,
              name: email,
            });
            await nav.credentials.store(cred);
          }
        } catch {
          // Browser doesn't support Credential Management — that's fine
        }
        router.push('/');
        router.refresh();
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message ?? 'משהו השתבש' });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">ניהול עסק</CardTitle>
          <CardDescription>{mode === 'sign_in' ? 'כניסה לחשבון' : 'הרשמה'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            התחבר עם Google
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">או</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="email">דוא״ל</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete={mode === 'sign_in' ? 'username' : 'email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'אנא המתן…' : mode === 'sign_in' ? 'כניסה' : 'הרשמה'}
            </Button>
          </form>
          {mode === 'sign_in' && (
            <p className="text-xs text-muted-foreground text-center">
              💡 אחרי שתתחבר פעם אחת — הדפדפן ישמור את הסיסמה והאתר ינסה להיכנס אוטומטית בפעם הבאה
            </p>
          )}
          {/*
            ההרשמה הפומבית בוטלה מהממשק — רק המשתמש הקיים יכול להיכנס.
            כדי לפתוח שוב, מחזירים את הכפתור הבא:

            <button onClick={() => setMode(m => m === 'sign_in' ? 'sign_up' : 'sign_in')}>
              {mode === 'sign_in' ? 'אין לי חשבון - להירשם' : 'יש לי חשבון - להתחבר'}
            </button>
          */}
        </CardContent>
      </Card>
    </div>
  );
}
