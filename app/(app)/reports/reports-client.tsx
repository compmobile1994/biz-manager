'use client';

import { useEffect, useState } from 'react';
import { Download, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { createClient } from '@/lib/supabase/client';
import { ExpensePie, type PieDatum } from './expense-pie';

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
const BREAKDOWN_YEARS = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];

export function ReportsClient({
  accountantEmail: initEmail,
  accountantName,
  businessName,
  initialBreakdown,
  initialBreakdownYear,
}: {
  accountantEmail: string;
  accountantName: string;
  businessName: string;
  initialBreakdown: PieDatum[];
  initialBreakdownYear: number;
}) {
  const { toast } = useToast();
  const [year, setYear] = useState(String(currentYear));
  const [accountantEmail, setAccountantEmail] = useState(initEmail);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  const [breakdownYear, setBreakdownYear] = useState(String(initialBreakdownYear));
  const [breakdown, setBreakdown] = useState<PieDatum[]>(initialBreakdown);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    if (Number(breakdownYear) === initialBreakdownYear) {
      setBreakdown(initialBreakdown);
      return;
    }
    let cancelled = false;
    (async () => {
      setBreakdownLoading(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const y = Number(breakdownYear);
        const start = `${y}-01-01`;
        const end = `${y + 1}-01-01`;
        const [{ data: expenses }, { data: categories }] = await Promise.all([
          supabase
            .from('expenses')
            .select('amount, category_id')
            .eq('user_id', user.id)
            .gte('expense_date', start)
            .lt('expense_date', end),
          supabase.from('expense_categories').select('id, name, color').eq('user_id', user.id),
        ]);
        if (cancelled) return;
        const catMap = new Map<string, { name: string; color: string | null }>();
        for (const c of categories ?? []) catMap.set(c.id, { name: c.name, color: c.color });
        const totals = new Map<string, number>();
        for (const e of expenses ?? []) {
          const key = e.category_id ?? '__none__';
          totals.set(key, (totals.get(key) ?? 0) + Number(e.amount || 0));
        }
        const result: PieDatum[] = [];
        for (const [key, value] of totals) {
          if (value <= 0) continue;
          if (key === '__none__') result.push({ name: 'ללא קטגוריה', value, color: null });
          else {
            const cat = catMap.get(key);
            result.push({ name: cat?.name ?? 'קטגוריה', value, color: cat?.color ?? null });
          }
        }
        result.sort((a, b) => b.value - a.value);
        setBreakdown(result);
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'שגיאה בטעינת ההוצאות', description: e?.message });
      } finally {
        if (!cancelled) setBreakdownLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [breakdownYear, initialBreakdown, initialBreakdownYear, toast]);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/export/year?year=${year}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'נכשל הייצוא');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `דוח_שנתי_${year}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'הורד', description: `דוח שנת ${year}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message });
    } finally {
      setDownloading(false);
    }
  }

  async function sendToAccountant() {
    if (!accountantEmail) return toast({ variant: 'destructive', title: 'יש להזין דוא״ל רואה חשבון' });
    setSending(true);
    try {
      const res = await fetch('/api/export/year/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, to: accountantEmail }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'נכשל');
      toast({ title: 'נשלח', description: `הדוח של ${year} נשלח ל-${accountantEmail}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message });
    } finally {
      setSending(false);
    }
  }

  const totalBreakdown = breakdown.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ייצוא שנתי</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            הקובץ יכלול: גליון אקסל עם כל ההכנסות, גליון עם כל ההוצאות, גליון סיכום שנתי - וכל ה-PDFs של הקבלות
            וצילומי הקבלות שהעלית כקבצים בתוך תיקיית ZIP.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>שנת מס</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>דוא״ל רואה חשבון{accountantName && ` (${accountantName})`}</Label>
              <Input type="email" value={accountantEmail} onChange={(e) => setAccountantEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={download} disabled={downloading} size="lg">
              <Download className="h-4 w-4" />
              {downloading ? 'יוצר חבילה…' : 'הורד חבילה'}
            </Button>
            <Button variant="outline" onClick={sendToAccountant} disabled={sending} size="lg">
              <Send className="h-4 w-4" />
              {sending ? 'שולח…' : 'שלח לרואה חשבון'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>הוצאות לפי קטגוריה</CardTitle>
            <div className="w-32">
              <Select value={breakdownYear} onValueChange={setBreakdownYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BREAKDOWN_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {breakdownLoading ? (
            <p className="text-center text-muted-foreground py-8">טוען…</p>
          ) : (
            <>
              <ExpensePie data={breakdown} />
              {breakdown.length > 0 && (
                <p className="text-sm text-muted-foreground text-center mt-2">
                  סה״כ הוצאות לשנת {breakdownYear}:{' '}
                  <span className="font-semibold text-foreground">
                    {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(totalBreakdown)}
                  </span>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>מה כלול בחבילה?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            <li>📊 <strong>הכנסות.xlsx</strong> - גליון 1: כל המסמכים שהוצאו (קבלה/חשבונית עסקה) עם תאריך, מספר רץ, לקוח, פירוט פריטים וסכום</li>
            <li>📊 <strong>הוצאות.xlsx</strong> - גליון 2: כל ההוצאות עם תאריך, ספק, קטגוריה, אופן תשלום וסכום</li>
            <li>📊 <strong>סיכום_שנתי.xlsx</strong> - גליון 3: סיכום הכנסות מול הוצאות לפי חודש, רווח נקי</li>
            <li>📁 <strong>תיקיית מסמכים</strong> - כל ה-PDFs של הקבלות שהוצאת בשנה</li>
            <li>📁 <strong>תיקיית הוצאות</strong> - כל הצילומי קבלות שהעלית להוצאות</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
