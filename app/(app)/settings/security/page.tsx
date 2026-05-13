import Link from 'next/link';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield, Smartphone, Monitor, Tablet, Globe, Mail, AlertTriangle } from 'lucide-react';
import { SignOutEverywhereButton } from './sign-out-everywhere-button';

export const dynamic = 'force-dynamic';

interface LoginEvent {
  id: string;
  ip: string | null;
  user_agent: string | null;
  provider: string | null;
  created_at: string;
}

// Very small User-Agent parser — good enough to label "iPhone / Windows / Mac…"
function deviceLabel(ua: string | null | undefined): { icon: 'phone' | 'tablet' | 'desktop' | 'unknown'; label: string } {
  if (!ua) return { icon: 'unknown', label: 'מכשיר לא ידוע' };
  const u = ua.toLowerCase();
  if (u.includes('iphone')) return { icon: 'phone', label: 'iPhone' };
  if (u.includes('ipad')) return { icon: 'tablet', label: 'iPad' };
  if (u.includes('android') && u.includes('mobile')) return { icon: 'phone', label: 'Android (טלפון)' };
  if (u.includes('android')) return { icon: 'tablet', label: 'Android' };
  if (u.includes('mac os')) return { icon: 'desktop', label: 'Mac' };
  if (u.includes('windows')) return { icon: 'desktop', label: 'Windows' };
  if (u.includes('linux')) return { icon: 'desktop', label: 'Linux' };
  return { icon: 'unknown', label: 'מכשיר אחר' };
}

function browserLabel(ua: string | null | undefined): string {
  if (!ua) return '';
  const u = ua.toLowerCase();
  if (u.includes('edg/')) return 'Edge';
  if (u.includes('opr/') || u.includes('opera')) return 'Opera';
  if (u.includes('chrome/') && !u.includes('edg/')) return 'Chrome';
  if (u.includes('firefox/')) return 'Firefox';
  if (u.includes('safari/') && !u.includes('chrome/')) return 'Safari';
  return '';
}

function providerLabel(p: string | null | undefined): string {
  if (p === 'google') return 'דרך חשבון Google';
  if (p === 'auto-credential') return 'התחברות אוטומטית (סיסמה שמורה)';
  if (p === 'password') return 'אימייל + סיסמה';
  return p ?? '';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return 'הרגע';
  if (min < 60) return `לפני ${min} דקות`;
  if (hr < 24) return `לפני ${hr} שעות`;
  if (day < 7) return `לפני ${day} ימים`;
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

const ICONS = { phone: Smartphone, tablet: Tablet, desktop: Monitor, unknown: Globe };

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: events } = await supabase
    .from('login_events')
    .select('id, ip, user_agent, provider, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const h = await headers();
  const currentUa = h.get('user-agent') ?? '';
  const currentDevice = deviceLabel(currentUa);
  const CurrentIcon = ICONS[currentDevice.icon];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/settings">
          <Button variant="ghost" size="icon"><ArrowRight className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Shield className="h-7 w-7" /> אבטחה</h1>
          <p className="text-muted-foreground">פרטי החשבון וכל ההתחברויות האחרונות</p>
        </div>
      </div>

      {/* Current account info */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> החשבון שלך</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">אימייל:</span>
            <span className="font-mono">{user.email}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">מזהה משתמש:</span>
            <span className="font-mono text-xs">{user.id}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">חשבון נוצר:</span>
            <span>{new Date(user.created_at).toLocaleDateString('he-IL')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">מכשיר נוכחי:</span>
            <span className="flex items-center gap-2 font-medium">
              <CurrentIcon className="h-4 w-4 text-green-700" />
              {currentDevice.label} {browserLabel(currentUa) && `· ${browserLabel(currentUa)}`}
              <span className="text-green-700 text-xs">(עכשיו)</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sign out everywhere */}
      <Card className="border-amber-300 bg-amber-50/50">
        <CardContent className="py-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">לא מזהה התחברות חשודה?</p>
              <p className="text-muted-foreground">לחץ "התנתק מכל המכשירים" — תצטרך להיכנס מחדש בכל המכשירים שלך.</p>
            </div>
          </div>
          <SignOutEverywhereButton />
        </CardContent>
      </Card>

      {/* Recent logins */}
      <Card>
        <CardHeader><CardTitle>היסטוריית התחברויות</CardTitle></CardHeader>
        <CardContent>
          {!events || events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              עדיין אין רשומות. ההתחברות הבאה תופיע כאן.
            </p>
          ) : (
            <div className="divide-y">
              {(events as LoginEvent[]).map((ev) => {
                const dev = deviceLabel(ev.user_agent);
                const Icon = ICONS[dev.icon];
                const isCurrent =
                  ev.ip &&
                  ev.user_agent === currentUa &&
                  Date.now() - new Date(ev.created_at).getTime() < 60_000;
                return (
                  <div key={ev.id} className="py-3 flex items-start gap-3">
                    <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{dev.label}</span>
                        {browserLabel(ev.user_agent) && (
                          <span className="text-xs text-muted-foreground">· {browserLabel(ev.user_agent)}</span>
                        )}
                        {isCurrent && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">המכשיר הזה</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{providerLabel(ev.provider)}</span>
                        {ev.ip && <span>· IP {ev.ip}</span>}
                        <span>· {timeAgo(ev.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hardening tips */}
      <Card>
        <CardHeader><CardTitle>טיפים לאבטחה מקסימלית</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p><strong>1.</strong> ההרשמה לחשבונות חדשים סגורה אצלך מהממשק — רק אתה יכול להיכנס.</p>
          <p><strong>2.</strong> כדי לסגור הרשמה גם ברמת Supabase: Dashboard → Authentication → Providers → Email → כבה "Enable email signups".</p>
          <p><strong>3.</strong> אם אתה רואה כאן מכשיר שלא מזהה — לחץ "התנתק מכל המכשירים" ושנה סיסמה.</p>
          <p><strong>4.</strong> מומלץ להפעיל אימות דו-שלבי (2FA) ב-Google שלך כדי שגם אם הסיסמה תדלוף — לא יכנסו בלי הטלפון.</p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        מציג עד 50 התחברויות אחרונות. רשומות חדשות נוספות אוטומטית בכל פעם שאתה (או מישהו עם הסיסמה שלך) מתחבר.
      </p>
    </div>
  );
}
