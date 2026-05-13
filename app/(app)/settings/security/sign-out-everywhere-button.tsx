'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { createClient } from '@/lib/supabase/client';

// Signs the user out of *all* devices, including this one. After it
// runs they'll be redirected to /login and must sign in again on every
// device they use.
export function SignOutEverywhereButton() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  async function run() {
    if (running) return;
    if (
      !confirm(
        'להתנתק מכל המכשירים?\nתצטרך להיכנס מחדש בכל מחשב/טלפון שאתה משתמש בהם.',
      )
    )
      return;
    setRunning(true);
    try {
      // scope: "global" → revokes the refresh token for all sessions of this user
      const { error } = await supabase.auth.signOut({ scope: 'global' } as any);
      if (error) throw error;
      toast({ title: 'התנתקת מכל המכשירים' });
      router.push('/login');
      router.refresh();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message ?? 'משהו השתבש' });
      setRunning(false);
    }
  }

  return (
    <Button variant="destructive" size="sm" onClick={run} disabled={running}>
      <LogOut className="h-4 w-4" />
      {running ? 'מתנתק...' : 'התנתק מכל המכשירים'}
    </Button>
  );
}
