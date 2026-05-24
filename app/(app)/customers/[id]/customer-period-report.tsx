'use client';

import { useState } from 'react';
import { FileText, Send, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

interface DocRow {
  id: string;
  number: number;
  document_type: string;
  issue_date: string;
  total: number;
  status: string;
  sent_at: string | null;
}

interface Props {
  docs: DocRow[];
  customerName: string;
  businessName: string;
}

// Builds an annual / monthly receipts report for the customer.
// Merges all the customer's receipts in the chosen period into one PDF and
// lets the user download it or share it via WhatsApp directly.
export function CustomerPeriodReport({ docs, customerName, businessName }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'year' | 'month'>('year');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [building, setBuilding] = useState(false);

  function docsInPeriod(): DocRow[] {
    return docs
      .filter((d) => d.status !== 'cancelled')
      .filter((d) => {
        const dt = new Date(d.issue_date + 'T00:00:00');
        if (mode === 'year') return dt.getFullYear() === year;
        return dt.getFullYear() === year && dt.getMonth() === month;
      });
  }

  async function build(action: 'share' | 'download') {
    if (building) return;
    const inRange = docsInPeriod();
    if (inRange.length === 0) {
      toast({ variant: 'destructive', title: 'אין קבלות בתקופה הזו' });
      return;
    }
    setBuilding(true);
    try {
      if (action === 'share') {
        // Short-link path: mint a link, open wa.me with one clean URL.
        const linkRes = await fetch('/api/share-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ids: inRange.map((d) => d.id), copyMode: 'copy' }),
        });
        if (!linkRes.ok) {
          const j = await linkRes.json().catch(() => ({}));
          toast({ variant: 'destructive', title: 'שגיאה ביצירת קישור', description: (j as any)?.error ?? '' });
          return;
        }
        const { url: shortUrl } = (await linkRes.json()) as { url: string };
        const message =
          `היי ${customerName},\n` +
          (mode === 'year' ? `מצורף דוח שנתי ${year}` : `מצורף דוח חודשי ${HEBREW_MONTHS[month]} ${year}`) + `\n` +
          `(${inRange.length} קבלות)\n` +
          `מ-${businessName}.\n\n` +
          shortUrl;
        const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(wa, '_blank');
        toast({ title: 'הדוח מוכן לשליחה ב-WhatsApp' });
        return;
      }

      // Download action — fetch the merged PDF directly and save locally.
      const res = await fetch('/api/documents/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ids: inRange.map((d) => d.id), copyMode: 'copy' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'שגיאה ביצירת הדוח', description: (j as any)?.error ?? res.status });
        return;
      }
      const blob = await res.blob();
      const filename = mode === 'year'
        ? `Annual-Report-${year}.pdf`
        : `Monthly-Report-${year}-${String(month + 1).padStart(2, '0')}.pdf`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
      toast({ title: 'הדוח הורד' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e?.message ?? '' });
    } finally {
      setBuilding(false);
    }
  }

  const yearsWithDocs = Array.from(new Set(
    docs.filter((d) => d.status !== 'cancelled').map((d) => new Date(d.issue_date + 'T00:00:00').getFullYear())
  )).sort((a, b) => b - a);
  const yearsList = yearsWithDocs.length > 0 ? yearsWithDocs : [now.getFullYear()];
  const inPeriod = docsInPeriod();
  const totalAmount = inPeriod.reduce((s, d) => s + Number(d.total ?? 0), 0);

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-700" />
          <h3 className="font-semibold">דוח קבלות תקופתי</h3>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex border rounded-md overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1.5 text-sm ${mode === 'year' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50'}`}
              onClick={() => setMode('year')}
            >
              שנתי
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-sm ${mode === 'month' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-slate-50'}`}
              onClick={() => setMode('month')}
            >
              חודשי
            </button>
          </div>

          <select
            className="h-9 rounded-md border bg-white px-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="שנה"
          >
            {yearsList.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          {mode === 'month' && (
            <select
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="חודש"
            >
              {HEBREW_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {inPeriod.length === 0
            ? 'אין קבלות בתקופה הנבחרת'
            : <>נכלל בדוח: <strong>{inPeriod.length} קבלות</strong> · סה״כ <strong>{formatCurrency(totalAmount)}</strong></>}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => build('share')}
            disabled={building || inPeriod.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            <Send className="h-4 w-4" />
            {building ? 'בונה...' : 'שלח ב-WhatsApp'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => build('download')}
            disabled={building || inPeriod.length === 0}
          >
            <Download className="h-4 w-4" />
            הורד PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
}
