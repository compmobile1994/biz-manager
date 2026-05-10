'use client';

import { useState } from 'react';
import { Plus, Trash2, X, Camera, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Expense, ExpenseCategory, PaymentMethod } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate, paymentMethodLabel } from '@/lib/utils';

const PAY_METHODS: PaymentMethod[] = ['cash', 'credit_card', 'bank_transfer', 'bit', 'check', 'other'];

export function ExpensesClient({
  initialExpenses,
  categories,
  vendors,
}: {
  initialExpenses: Expense[];
  categories: ExpenseCategory[];
  vendors: string[];
}) {
  const supabase = createClient();
  const { toast } = useToast();
  const [list, setList] = useState<Expense[]>(initialExpenses);
  const [editing, setEditing] = useState<Partial<Expense> & { _file?: File } | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const filtered = list.filter((e) => filterCategory === 'all' || e.category_id === filterCategory);
  const totalSum = filtered.reduce((s, e) => s + Number(e.amount), 0);

  function startNew() {
    setEditing({
      expense_date: new Date().toISOString().slice(0, 10),
      vendor: '',
      amount: 0,
      payment_method: 'cash',
    });
  }

  async function save() {
    if (!editing?.vendor?.trim()) return toast({ variant: 'destructive', title: 'שם הספק חובה' });
    if (!editing?.amount || editing.amount <= 0) return toast({ variant: 'destructive', title: 'סכום חיובי נדרש' });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let receipt_url: string | null = editing.receipt_url ?? null;
    if (editing._file) {
      const ext = editing._file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('expenses').upload(path, editing._file, { upsert: true });
      if (upErr) return toast({ variant: 'destructive', title: 'שגיאה בהעלאת קבלה', description: upErr.message });
      receipt_url = path;
    }

    const payload: any = {
      user_id: user.id,
      expense_date: editing.expense_date,
      vendor: editing.vendor,
      category_id: editing.category_id ?? null,
      amount: Number(editing.amount),
      description: editing.description ?? null,
      payment_method: editing.payment_method ?? null,
      reference: editing.reference ?? null,
      receipt_url,
    };

    if (editing.id) {
      const { data, error } = await supabase.from('expenses').update(payload).eq('id', editing.id).select().single();
      if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
      setList((l) => l.map((x) => (x.id === data.id ? (data as Expense) : x)));
    } else {
      const { data, error } = await supabase.from('expenses').insert(payload).select().single();
      if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
      setList((l) => [data as Expense, ...l]);
    }
    setEditing(null);
    toast({ title: 'נשמר' });
  }

  async function remove(id: string) {
    if (!confirm('למחוק את ההוצאה?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
    setList((l) => l.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הקטגוריות</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" />
          הוצאה חדשה
        </Button>
      </div>

      <Card>
        <CardContent className="py-3 text-right">
          <span className="text-muted-foreground text-sm">סה״כ:</span>
          <span className="font-bold text-lg mr-2">{formatCurrency(totalSum)}</span>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">אין הוצאות בקטגוריה זו</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const cat = categories.find((c) => c.id === e.category_id);
            return (
              <Card key={e.id}>
                <CardContent className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{e.vendor}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(e.expense_date)}
                      {cat && ` · ${cat.name}`}
                      {e.payment_method && ` · ${paymentMethodLabel[e.payment_method]}`}
                      {e.receipt_url && ` · 📎`}
                    </p>
                    {e.description && <p className="text-sm mt-1">{e.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{formatCurrency(Number(e.amount))}</span>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(e)}>
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(e.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-auto" onClick={() => setEditing(null)}>
          <Card className="w-full max-w-lg my-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg">{editing.id ? 'עריכת הוצאה' : 'הוצאה חדשה'}</h3>
                <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>תאריך</Label>
                  <Input type="date" value={editing.expense_date ?? ''} onChange={(e) => setEditing({ ...editing, expense_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>סכום (₪)</Label>
                  <Input type="number" step="0.01" value={editing.amount ?? 0} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>ספק / מקור (חובה)</Label>
                <Input
                  list="vendors-list"
                  value={editing.vendor ?? ''}
                  onChange={(e) => setEditing({ ...editing, vendor: e.target.value })}
                  placeholder="הקלד או בחר ספק קיים"
                  autoComplete="off"
                />
                <datalist id="vendors-list">
                  {vendors.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                {vendors.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    💡 {vendors.length} ספקים שמורים — תתחיל להקליד וייצא הצעות
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>קטגוריה</Label>
                  <Select value={editing.category_id ?? ''} onValueChange={(v) => setEditing({ ...editing, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="ללא" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>אופן תשלום</Label>
                  <Select value={editing.payment_method ?? 'cash'} onValueChange={(v) => setEditing({ ...editing, payment_method: v as PaymentMethod })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{paymentMethodLabel[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>אסמכתה / מס׳ קבלה</Label>
                <Input value={editing.reference ?? ''} onChange={(e) => setEditing({ ...editing, reference: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>תיאור</Label>
                <Textarea value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>צילום / קובץ קבלה</Label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Camera capture (mobile) */}
                  <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-md p-3 cursor-pointer hover:bg-accent text-center">
                    <Camera className="h-6 w-6" />
                    <span className="text-xs font-medium">📷 צלם קבלה</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => setEditing({ ...editing, _file: e.target.files?.[0] })}
                    />
                  </label>
                  {/* File upload (PDF email invoice / image from gallery) */}
                  <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-md p-3 cursor-pointer hover:bg-accent text-center">
                    <FileText className="h-6 w-6" />
                    <span className="text-xs font-medium">📎 העלה קובץ / PDF</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setEditing({ ...editing, _file: e.target.files?.[0] })}
                    />
                  </label>
                </div>
                {editing._file && <p className="text-xs text-muted-foreground">📎 {editing._file.name}</p>}
                {editing.receipt_url && !editing._file && <p className="text-xs text-muted-foreground">📎 קובץ קיים</p>}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>ביטול</Button>
                <Button onClick={save}>שמור</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
