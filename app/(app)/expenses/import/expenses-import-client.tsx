'use client';

import { useState } from 'react';
import { Upload, Trash2, CheckCircle2, AlertCircle, FileText, Image as ImageIcon, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import type { ExpenseCategory } from '@/lib/supabase/types';

interface Row {
  id: string;
  file: File;
  date: string;
  vendor: string;
  amount: string;
  categoryId: string;
  description: string;
  // AI extraction status (separate from the submit/import status)
  aiStatus?: 'pending' | 'extracting' | 'extracted' | 'failed';
  aiError?: string;
  // Per-row outcome after submission
  status?: 'pending' | 'ok' | 'error';
  errorMsg?: string;
}

// Convert a File to a base64 string (without the data: prefix), as expected
// by the Anthropic vision API.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const i = result.indexOf(',');
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function uniqueId() {
  return Math.random().toString(36).slice(2, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ExpensesImportClient({
  categories,
  vendors,
  supplierIdByName,
}: {
  categories: ExpenseCategory[];
  vendors: string[];
  supplierIdByName: Record<string, string>;
}) {
  const supabase = createClient();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<{ ok: number; failed: number } | null>(null);

  function onFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newRows: Row[] = Array.from(files).map((f) => ({
      id: uniqueId(),
      file: f,
      date: todayIso(),
      vendor: '',
      amount: '',
      categoryId: '',
      description: '',
    }));
    setRows((cur) => [...cur, ...newRows]);
    setResults(null);
    toast({ title: `נטענו ${newRows.length} קבצים — מלא את הפרטים` });
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((cur) => cur.filter((r) => r.id !== id));
  }

  // Run Claude vision on every row that doesn't yet have a successful AI
  // extraction. Sequential (not parallel) so we don't slam the API quota
  // and the UI can show progress row-by-row. Each call is ~$0.005.
  async function extractAll() {
    if (extracting) return;
    // Only process rows that aren't already filled successfully — lets the
    // user re-run after adding more files.
    const todo = rows.filter((r) => r.aiStatus !== 'extracted');
    if (todo.length === 0) {
      toast({ title: 'אין מה לחלץ — כל השורות כבר מולאו' });
      return;
    }
    setExtracting(true);
    let ok = 0;
    let failed = 0;
    for (const row of todo) {
      // Mark this row as "extracting" so the badge spins / changes color
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, aiStatus: 'extracting' } : r)));
      try {
        const base64 = await fileToBase64(row.file);
        // Most receipts are JPEG/PNG. Claude vision supports png/jpeg/gif/webp.
        // PDF support is more limited — fall back to the file's MIME and
        // surface any API rejection as a per-row error.
        const mime = row.file.type || 'application/octet-stream';
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)) {
          throw new Error('פורמט לא נתמך ל-AI: ' + mime + ' (השתמש ב-JPG/PNG)');
        }
        const res = await fetch('/api/expenses/ai-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            fileBase64: base64,
            mimeType: mime,
            categories: categories.map((c) => ({ id: c.id, name: c.name })),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'AI נכשל');

        // Patch the row with whatever fields the model returned. Don't
        // override fields the user already typed manually — preserve their
        // edits if they pre-filled anything before pressing AI.
        setRows((cur) => cur.map((r) => {
          if (r.id !== row.id) return r;
          return {
            ...r,
            date: r.date && r.date !== todayIso() ? r.date : (json.date ?? r.date),
            vendor: r.vendor || (json.vendor ?? ''),
            amount: r.amount || (json.amount != null ? String(json.amount) : ''),
            categoryId: r.categoryId || (json.categoryId ?? ''),
            description: r.description || (json.description ?? ''),
            aiStatus: 'extracted',
          };
        }));
        ok++;
      } catch (e: any) {
        setRows((cur) => cur.map((r) => (r.id === row.id
          ? { ...r, aiStatus: 'failed', aiError: e?.message ?? 'שגיאה' }
          : r)));
        failed++;
      }
    }
    setExtracting(false);
    toast({
      title: `מילוי אוטומטי הסתיים`,
      description: `✅ ${ok} הצליחו · ${failed > 0 ? `❌ ${failed} נכשלו` : 'הכל מוכן'}`,
      variant: failed > 0 ? 'destructive' : 'default',
    });
  }

  async function importAll() {
    if (submitting) return;
    if (rows.length === 0) return;
    // Validate all rows up-front so the user sees errors before any upload.
    const errors: string[] = [];
    rows.forEach((r, i) => {
      if (!r.vendor.trim()) errors.push(`שורה ${i + 1}: שם ספק חובה`);
      if (!r.amount || Number(r.amount) <= 0) errors.push(`שורה ${i + 1}: סכום חיובי חובה`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errors.push(`שורה ${i + 1}: תאריך לא תקין`);
    });
    if (errors.length > 0) {
      toast({ variant: 'destructive', title: 'יש שגיאות', description: errors.slice(0, 3).join(' · ') });
      return;
    }
    setSubmitting(true);
    setResults(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: 'destructive', title: 'אין הרשאה' });
      setSubmitting(false);
      return;
    }

    let ok = 0;
    let failed = 0;
    const updated: Row[] = [...rows];

    // Sequential upload — each row gets its own status update so the user
    // sees progress live. Parallel would be faster but harder to track UX.
    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      try {
        // 1. Upload file to expenses bucket
        const ext = row.file.name.split('.').pop() ?? 'bin';
        const safeName = `${Date.now()}-${uniqueId()}.${ext}`;
        const path = `${user.id}/${safeName}`;
        const { error: upErr } = await supabase.storage.from('expenses').upload(path, row.file, { upsert: false });
        if (upErr) throw new Error('העלאת קובץ נכשלה: ' + upErr.message);

        // 2. Resolve supplier_id — auto-create if new
        const vendorTrim = row.vendor.trim();
        let supplierId: string | null = supplierIdByName[vendorTrim] ?? null;
        if (!supplierId) {
          const { data: newSup, error: supErr } = await supabase
            .from('suppliers')
            .insert({ user_id: user.id, name: vendorTrim })
            .select('id')
            .single();
          if (!supErr && newSup) {
            supplierId = newSup.id;
            supplierIdByName[vendorTrim] = newSup.id;
          }
          // non-fatal — supplier creation failure doesn't block the expense
        }

        // 3. Insert expense row
        const { error: expErr } = await supabase.from('expenses').insert({
          user_id: user.id,
          expense_date: row.date,
          vendor: vendorTrim,
          supplier_id: supplierId,
          category_id: row.categoryId || null,
          amount: Math.round(Number(row.amount)),
          description: row.description || null,
          payment_method: null,
          reference: null,
          receipt_url: path,
        });
        if (expErr) throw new Error(expErr.message);

        updated[i] = { ...row, status: 'ok' };
        ok++;
      } catch (e: any) {
        updated[i] = { ...row, status: 'error', errorMsg: e?.message ?? 'שגיאה' };
        failed++;
      }
      // Update state mid-loop so the UI reflects progress.
      setRows([...updated]);
    }

    setResults({ ok, failed });
    setSubmitting(false);
    toast({
      title: `יובאו ${ok} הוצאות${failed > 0 ? ` · ${failed} שגיאות` : ''}`,
      variant: failed > 0 ? 'destructive' : 'default',
    });
  }

  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start gap-3">
            <FileText className="h-6 w-6 text-blue-700 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-semibold">איך זה עובד</p>
              <ol className="text-sm space-y-1 list-decimal mr-5">
                <li>לחץ "בחר קבצים" — תוכל לסמן הרבה קבצי PDF/תמונה בבת אחת (Ctrl+A)</li>
                <li>לכל קובץ תופיע שורה — מלא תאריך, ספק, סכום וקטגוריה</li>
                <li>לחץ "ייבא הכל" — כל ההוצאות יישמרו והקבצים יעלו לאחסון</li>
                <li>ספקים חדשים שיופיעו — יישמרו אוטומטית במאגר הספקים</li>
              </ol>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap pt-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf,image/*"
                multiple
                className="hidden"
                onChange={(e) => onFilesPicked(e.target.files)}
              />
              <span className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90">
                <Upload className="h-4 w-4" />
                בחר קבצים
              </span>
            </label>
            {rows.length > 0 && (
              <>
                <Button
                  onClick={extractAll}
                  disabled={extracting || submitting}
                  className="bg-purple-600 hover:bg-purple-700"
                  title="מילוי אוטומטי של תאריך/ספק/סכום/קטגוריה ע״י Claude AI"
                >
                  <Sparkles className={`h-4 w-4 ${extracting ? 'animate-pulse' : ''}`} />
                  {extracting ? 'מילוי AI...' : '🤖 מילוי אוטומטי'}
                </Button>
                <Button
                  onClick={importAll}
                  disabled={submitting || extracting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {submitting ? 'מייבא...' : `ייבא ${rows.length} הוצאות (₪${Math.round(totalAmount)})`}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <h3 className="font-semibold">{rows.length} קבצים — מלא את הפרטים</h3>
            <div className="space-y-2">
              {rows.map((row, idx) => {
                const isImage = row.file.type.startsWith('image/');
                return (
                  <div
                    key={row.id}
                    className={`rounded-md border p-3 ${
                      row.status === 'ok'
                        ? 'border-green-300 bg-green-50'
                        : row.status === 'error'
                          ? 'border-red-300 bg-red-50'
                          : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                        {isImage ? <ImageIcon className="h-4 w-4 text-slate-500" /> : <FileText className="h-4 w-4 text-slate-500" />}
                        <span className="text-sm font-medium truncate" title={row.file.name}>
                          {row.file.name}
                        </span>
                        <span className="text-xs text-muted-foreground">({(row.file.size / 1024).toFixed(0)}KB)</span>
                        {row.aiStatus === 'extracting' && (
                          <span className="text-xs text-purple-700 flex items-center gap-1 animate-pulse">
                            <Sparkles className="h-3 w-3" />
                            AI...
                          </span>
                        )}
                        {row.aiStatus === 'extracted' && (
                          <span className="text-xs text-purple-700 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            מולא ע״י AI
                          </span>
                        )}
                        {row.aiStatus === 'failed' && (
                          <span className="text-xs text-amber-700 flex items-center gap-1" title={row.aiError}>
                            <AlertCircle className="h-3 w-3" />
                            AI נכשל
                          </span>
                        )}
                        {row.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        {row.status === 'error' && (
                          <span className="text-xs text-red-700 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {row.errorMsg}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(row.id)}
                        disabled={submitting}
                        title="הסר שורה"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">תאריך</Label>
                        <Input type="date" value={row.date} onChange={(e) => updateRow(row.id, { date: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">ספק</Label>
                        <Input
                          list={`vendors-${row.id}`}
                          value={row.vendor}
                          onChange={(e) => updateRow(row.id, { vendor: e.target.value })}
                          placeholder="שם ספק"
                          autoComplete="off"
                        />
                        <datalist id={`vendors-${row.id}`}>
                          {vendors.map((v) => <option key={v} value={v} />)}
                        </datalist>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">סכום (₪)</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={row.amount}
                          onChange={(e) => updateRow(row.id, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">קטגוריה</Label>
                        <Select value={row.categoryId || '__none__'} onValueChange={(v) => updateRow(row.id, { categoryId: v === '__none__' ? '' : v })}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— ללא —</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">תיאור (אופציונלי)</Label>
                        <Input
                          value={row.description}
                          onChange={(e) => updateRow(row.id, { description: e.target.value })}
                          placeholder="מה זה?"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {results && (
        <Card className={results.failed > 0 ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}>
          <CardContent className="py-4">
            <p className="font-semibold">
              ✅ יובאו {results.ok} הוצאות
              {results.failed > 0 && ` · ❌ ${results.failed} נכשלו`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
