'use client';

import { useState } from 'react';
import { Plus, Trash2, Wallet, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Deposit {
  id: string;
  deposit_date: string;
  amount: number;
  notes: string | null;
}

export function SupplierDepositsClient({
  supplierId,
  supplierName,
  initialDeposits,
  totalDeposited,
  totalSpent,
}: {
  supplierId: string;
  supplierName: string;
  initialDeposits: Deposit[];
  totalDeposited: number;
  totalSpent: number;
}) {
  const supabase = createClient();
  const { toast } = useToast();
  const [deposits, setDeposits] = useState<Deposit[]>(initialDeposits);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // New-deposit form state
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Live-recalculated balance — uses the sum of the deposits state (not
  // the server-snapshot prop) so it updates instantly after add/delete.
  const currentDeposited = deposits.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const balance = currentDeposited - totalSpent;

  async function addDeposit() {
    if (saving) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ variant: 'destructive', title: 'סכום חיובי חובה' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast({ variant: 'destructive', title: 'תאריך לא תקין' });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('prepaid_deposits')
        .insert({
          user_id: user.id,
          supplier_id: supplierId,
          deposit_date: date,
          amount: Number(amt.toFixed(2)),
          notes: notes.trim() || null,
        })
        .select('id, deposit_date, amount, notes')
        .single();
      if (error) {
        toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
        return;
      }
      setDeposits((cur) => [data as Deposit, ...cur]);
      // Reset form for the next entry
      setAmount('');
      setNotes('');
      setDate(new Date().toISOString().slice(0, 10));
      setAdding(false);
      toast({ title: `הופקדו ${formatCurrency(amt)} ל-${supplierName}` });
    } finally {
      setSaving(false);
    }
  }

  async function removeDeposit(id: string) {
    if (removingId) return;
    if (!confirm('למחוק את ההפקדה? פעולה זו תשנה את היתרה הזמינה.')) return;
    setRemovingId(id);
    try {
      const { error } = await supabase.from('prepaid_deposits').delete().eq('id', id);
      if (error) {
        toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
        return;
      }
      setDeposits((cur) => cur.filter((d) => d.id !== id));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          הפקדות מקדמה
        </CardTitle>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            הוסף הפקדה
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick explainer if no deposits exist yet */}
        {deposits.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            לא נרשמו הפקדות מקדמה לספק זה. <strong>מתי להשתמש?</strong> כשאתה משלם לספק
            סכום כסף שיתבזבז בהדרגה (לדוגמה הפקדה של ₪1,950 ל-PayXpress, שמשם נצרכים
            טעינות לאורך זמן). היתרה תוצג כאן ותתעדכן אוטומטית עם כל הוצאה שתרשום לספק זה.
          </p>
        )}

        {/* New-deposit inline form */}
        {adding && (
          <div className="rounded-md border border-blue-300 bg-blue-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">הפקדה חדשה</p>
              <Button variant="ghost" size="icon" onClick={() => setAdding(false)} disabled={saving}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">תאריך</Label>
                <DatePicker value={date} onChange={setDate} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">סכום (₪)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="לדוגמה: 1950"
                  autoFocus
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label className="text-xs">הערות (אופציונלי)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder='לדוגמה: "טעינות חודש מאי"'
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={saving}>ביטול</Button>
              <Button onClick={addDeposit} disabled={saving} className="bg-green-600 hover:bg-green-700">
                {saving ? 'שומר...' : 'שמור הפקדה'}
              </Button>
            </div>
          </div>
        )}

        {/* Balance summary — only shown when there's at least one deposit. */}
        {deposits.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center text-sm border rounded-md p-3 bg-slate-50">
            <div>
              <p className="font-bold text-base">{formatCurrency(currentDeposited)}</p>
              <p className="text-xs text-muted-foreground">סה״כ הופקד</p>
            </div>
            <div>
              <p className="font-bold text-base text-red-700">- {formatCurrency(totalSpent)}</p>
              <p className="text-xs text-muted-foreground">נצרך (הוצאות)</p>
            </div>
            <div>
              <p className={`font-bold text-base ${balance > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                = {formatCurrency(balance)}
              </p>
              <p className="text-xs text-muted-foreground">יתרה זמינה</p>
            </div>
          </div>
        )}

        {/* Deposits list */}
        {deposits.length > 0 && (
          <div className="divide-y border rounded-md">
            {deposits.map((d) => (
              <div key={d.id} className="p-3 flex items-center justify-between gap-3 hover:bg-accent/30">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatDate(d.deposit_date)}</p>
                  {d.notes && <p className="text-xs text-muted-foreground truncate">{d.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-green-700">+ {formatCurrency(Number(d.amount))}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDeposit(d.id)}
                    disabled={removingId === d.id}
                    title="מחק הפקדה"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
