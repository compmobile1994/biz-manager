'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [loading, setLoading] = useState(false);

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
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">סיסמה</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'אנא המתן…' : mode === 'sign_in' ? 'כניסה' : 'הרשמה'}
            </Button>
          </form>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => setMode((m) => (m === 'sign_in' ? 'sign_up' : 'sign_in'))}
          >
            {mode === 'sign_in' ? 'אין לי חשבון - להירשם' : 'יש לי חשבון - להתחבר'}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
