'use client';

import { useState } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

interface ParsedRow {
  number: number;
  issue_date: string;
  customer_name: string;
  description: string;
  amount: number;
  payment_method?: string;
  _rowIndex: number;
  _error?: string;
}

// CSV parser — small + safe for our 6-column format. Handles:
// - Comma OR semicolon separator (Excel-Hebrew often uses semicolon)
// - Quoted values (for commas inside text)
// - Trailing whitespace + empty rows
function parseCsv(text: string): string[][] {
  // Strip BOM that Excel adds when saving as UTF-8 CSV
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  // Detect separator by counting in the header line
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === sep) { cells.push(cur); cur = ''; }
        else cur += c;
      }
    }
    cells.push(cur);
    return cells.map((s) => s.trim());
  });
}

// Normalize a date string into YYYY-MM-DD. Accepts common Israeli formats:
//   2025-03-15, 15/03/2025, 15.03.2025, 15/3/25
function normalizeDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'מזומן',
  credit_card: 'אשראי',
  bank_transfer: 'העברה',
  bit: 'ביט',
  check: 'צ׳ק',
  other: 'אחר',
};

// Map Hebrew payment labels (what the user types in Excel) back to the
// internal enum. Falls back to 'cash' if unknown.
function normalizePayment(s: string | undefined): string {
  if (!s) return 'cash';
  const t = s.trim().toLowerCase();
  if (t.includes('מזומן') || t === 'cash') return 'cash';
  if (t.includes('אשראי') || t.includes('כרטיס') || t === 'credit_card' || t === 'credit') return 'credit_card';
  if (t.includes('העברה') || t === 'bank_transfer' || t === 'transfer') return 'bank_transfer';
  if (t.includes('ביט') || t === 'bit') return 'bit';
  if (t.includes('צק') || t.includes('צ׳ק') || t === 'check') return 'check';
  return 'cash';
}

export function ImportHistoricalClient() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: any[] } | null>(null);

  function downloadTemplate() {
    // Use BOM + UTF-8 so Excel opens Hebrew correctly. Semicolon separator
    // matches Israeli Excel default for Hebrew locale.
    const bom = '﻿';
    const csv = bom + [
      'מספר;תאריך;שם לקוח;תיאור;סכום;אופן תשלום',
      '50;15/03/2025;ישראל ישראלי;תיקון מסך אייפון 12;450;מזומן',
      '51;16/03/2025;פלוני אלמוני;FRP לסמסונג A52;200;אשראי',
      '52;18/03/2025;ABC חברה בע"מ;שירות סלולר חודשי;1200;העברה',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kabalot-historical-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleFile(file: File) {
    setResult(null);
    const text = await file.text();
    const grid = parseCsv(text);
    if (grid.length < 2) {
      toast({ variant: 'destructive', title: 'הקובץ ריק או חסר שורות נתונים' });
      return;
    }
    // Skip header row. We don't enforce specific header names — column
    // order is positional (per the template).
    const parsed: ParsedRow[] = [];
    for (let i = 1; i < grid.length; i++) {
      const cells = grid[i];
      const [numStr, dateRaw, customer, desc, amountRaw, paymentRaw] = cells;
      const row: ParsedRow = {
        number: Number((numStr ?? '').trim()),
        issue_date: normalizeDate(dateRaw ?? '') ?? '',
        customer_name: (customer ?? '').trim(),
        description: (desc ?? '').trim(),
        amount: Math.round(Number((amountRaw ?? '').trim())),
        payment_method: normalizePayment(paymentRaw),
        _rowIndex: i + 1,
      };
      // Pre-flight validation so the preview shows errors before we hit the
      // server. The server validates again so this is purely UX.
      if (!Number.isInteger(row.number) || row.number <= 0) row._error = 'מספר קבלה לא תקין';
      else if (!row.issue_date) row._error = 'תאריך לא תקין';
      else if (!row.customer_name) row._error = 'שם לקוח חובה';
      else if (!Number.isFinite(row.amount) || row.amount <= 0) row._error = 'סכום לא תקין';
      parsed.push(row);
    }
    setRows(parsed);
    const validCount = parsed.filter((r) => !r._error).length;
    toast({
      title: `נטענו ${parsed.length} שורות`,
      description: validCount === parsed.length
        ? 'כל השורות תקינות — לחץ "ייבא הכל" להמשך'
        : `${validCount} תקינות, ${parsed.length - validCount} עם שגיאות`,
    });
  }

  async function importAll() {
    if (submitting) return;
    const valid = rows.filter((r) => !r._error);
    if (valid.length === 0) {
      toast({ variant: 'destructive', title: 'אין שורות תקינות' });
      return;
    }
    if (!confirm(`לייבא ${valid.length} קבלות היסטוריות? פעולה זו תוסיף ${valid.length} מסמכים חדשים.`)) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/documents/import-historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          rows: valid.map(({ _rowIndex, _error, ...r }) => r),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'הייבוא נכשל');
      setResult({ inserted: json.inserted ?? 0, errors: json.errors ?? [] });
      toast({
        title: `יובאו ${json.inserted} קבלות`,
        description: json.errors?.length > 0 ? `${json.errors.length} שגיאות — ראה למטה` : 'הכל עבר בהצלחה',
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e?.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="h-6 w-6 text-blue-700 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-semibold">איך זה עובד</p>
              <ol className="text-sm space-y-1 list-decimal mr-5">
                <li>הורד את התבנית בלחיצה למטה (קובץ Excel/CSV עם 6 עמודות)</li>
                <li>פתח אותו ב-Excel, מלא שורה לכל קבלה</li>
                <li>שמור כ-CSV (UTF-8) ועלה לכאן</li>
                <li>תראה תצוגה מקדימה עם בדיקת שגיאות → לחץ "ייבא הכל"</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                💡 המספור הרץ של 2026 לא ישפע. הקבלות ההיסטוריות יסומנו ב-"היסטורי" וניתנות לחיפוש כרגיל.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap pt-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4" />
              הורד תבנית CSV
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <span className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90">
                <Upload className="h-4 w-4" />
                העלה קובץ CSV
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold">תצוגה מקדימה ({rows.length} שורות)</h3>
              <Button
                onClick={importAll}
                disabled={submitting || rows.every((r) => r._error)}
                className="bg-green-600 hover:bg-green-700"
              >
                {submitting ? 'מייבא...' : `ייבא ${rows.filter((r) => !r._error).length} קבלות`}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-right">
                    <th className="p-2 text-center w-12">#</th>
                    <th className="p-2">מספר</th>
                    <th className="p-2">תאריך</th>
                    <th className="p-2">לקוח</th>
                    <th className="p-2">תיאור</th>
                    <th className="p-2">סכום</th>
                    <th className="p-2">תשלום</th>
                    <th className="p-2">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._rowIndex} className={r._error ? 'bg-red-50' : ''}>
                      <td className="p-2 text-center text-muted-foreground">{r._rowIndex}</td>
                      <td className="p-2 font-mono">{r.number}</td>
                      <td className="p-2">{r.issue_date}</td>
                      <td className="p-2">{r.customer_name}</td>
                      <td className="p-2 text-xs">{r.description}</td>
                      <td className="p-2 text-left">{Number.isFinite(r.amount) ? `₪${r.amount}` : ''}</td>
                      <td className="p-2">{PAYMENT_LABELS[r.payment_method ?? ''] ?? r.payment_method}</td>
                      <td className="p-2">
                        {r._error ? (
                          <span className="text-xs text-red-700 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {r._error}
                          </span>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className={result.errors.length > 0 ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center gap-2">
              {result.errors.length > 0 ? (
                <AlertCircle className="h-5 w-5 text-amber-700" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-700" />
              )}
              <p className="font-semibold">
                יובאו בהצלחה: {result.inserted} קבלות
                {result.errors.length > 0 && ` · ${result.errors.length} שגיאות`}
              </p>
            </div>
            {result.errors.length > 0 && (
              <div className="text-sm space-y-1">
                <p className="font-medium">שורות שלא יובאו:</p>
                <ul className="list-disc mr-5 text-xs">
                  {result.errors.slice(0, 20).map((e: any, i: number) => (
                    <li key={i}>
                      שורה {e.row} (מספר {e.number}): {e.error}
                    </li>
                  ))}
                  {result.errors.length > 20 && <li>...ועוד {result.errors.length - 20}</li>}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
