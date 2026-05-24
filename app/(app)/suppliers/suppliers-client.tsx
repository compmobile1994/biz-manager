'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Mail, Phone, X, Truck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Supplier } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';

type SupplierWithStats = Supplier & {
  total_spent: number;
  expense_count: number;
  last_purchase: string | null;
};

function humanizeSupabaseError(msg: string | null | undefined): string {
  if (!msg) return 'שגיאה לא ידועה';
  const m = msg.toLowerCase();
  if (m.includes('duplicate key')) return 'הרשומה כבר קיימת';
  if (m.includes('foreign key')) return 'לא ניתן לבצע — הרשומה קשורה לרשומות אחרות';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'אין הרשאה לבצע פעולה זו';
  if (m.includes('not found')) return 'הרשומה לא נמצאה';
  if (m.includes('network') || m.includes('fetch')) return 'אין חיבור לאינטרנט';
  return msg;
}

export function SuppliersClient({ initial }: { initial: SupplierWithStats[] }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [list, setList] = useState<SupplierWithStats[]>(initial);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const filtered = list.filter((s) =>
    [s.name, s.email, s.phone, s.tax_id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  function startNew() {
    setEditing({ name: '', email: '', phone: '', address: '', tax_id: '', notes: '' });
  }

  async function save() {
    if (saving) return;
    if (!editing?.name?.trim()) {
      toast({ variant: 'destructive', title: 'שם הספק חובה' });
      return;
    }
    if (editing.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editing.email.trim())) {
      toast({ variant: 'destructive', title: 'כתובת מייל לא תקינה' });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = { ...editing, user_id: user.id } as any;
      if (editing.id) {
        const { data, error } = await supabase.from('suppliers').update(payload).eq('id', editing.id).select().single();
        if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: humanizeSupabaseError(error.message) });
        setList((l) => l.map((s) => (s.id === data.id ? { ...s, ...(data as Supplier) } : s)));
      } else {
        const { data, error } = await supabase.from('suppliers').insert(payload).select().single();
        if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: humanizeSupabaseError(error.message) });
        setList((l) =>
          [...l, { ...(data as Supplier), total_spent: 0, expense_count: 0, last_purchase: null }]
            .sort((a, b) => a.name.localeCompare(b.name, 'he')),
        );
      }
      setEditing(null);
      toast({ title: 'נשמר' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (removingId) return;
    if (!confirm('למחוק את הספק? ההוצאות הקיימות יישמרו (השם יישאר במצב snapshot).')) return;
    setRemovingId(id);
    try {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: humanizeSupabaseError(error.message) });
      setList((l) => l.filter((s) => s.id !== id));
    } finally {
      setRemovingId(null);
    }
  }

  // Header stats
  const totalCount = list.length;
  const totalSpent = list.reduce((s, x) => s + (x.total_spent ?? 0), 0);
  const totalExpenses = list.reduce((s, x) => s + (x.expense_count ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-3xl font-bold">{totalCount}</p>
            <p className="text-xs text-muted-foreground">סה״כ ספקים</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">{formatCurrency(totalSpent)}</p>
            <p className="text-xs text-muted-foreground">סה״כ הוצאות לספקים</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-muted-foreground">{totalExpenses}</p>
            <p className="text-xs text-muted-foreground">קניות מתועדות</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Input placeholder="חיפוש…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" />
          ספק חדש
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {search ? 'לא נמצאו ספקים' : 'עדיין אין ספקים. לחץ "ספק חדש" כדי להוסיף.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <Link href={`/suppliers/${s.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Truck className="h-4 w-4 text-primary flex-shrink-0" />
                      <p className="font-semibold truncate">{s.name}</p>
                    </div>
                    {s.tax_id && <p className="text-xs text-muted-foreground">ח.פ.: {s.tax_id}</p>}
                    {s.email && <p className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</p>}
                    {s.phone && <p className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</p>}
                  </Link>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <Link href={`/suppliers/${s.id}`} className="block">
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
                    <div>
                      <p className="text-sm font-semibold">{formatCurrency(s.total_spent)}</p>
                      <p className="text-[10px] text-muted-foreground">סה״כ קניות</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{s.expense_count}</p>
                      <p className="text-[10px] text-muted-foreground">חשבוניות</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{s.last_purchase ? formatDate(s.last_purchase) : '—'}</p>
                      <p className="text-[10px] text-muted-foreground">קנייה אחרונה</p>
                    </div>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg">{editing.id ? 'עריכת ספק' : 'ספק חדש'}</h3>
                <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Field label="שם הספק (חובה)">
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ח.פ.">
                  <Input value={editing.tax_id ?? ''} onChange={(e) => setEditing({ ...editing, tax_id: e.target.value })} />
                </Field>
                <Field label="טלפון">
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={editing.phone ?? ''}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    placeholder="לדוגמה: 050-1234567"
                  />
                </Field>
              </div>
              <Field label="דוא״ל">
                <Input
                  type="email"
                  value={editing.email ?? ''}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </Field>
              <Field label="כתובת">
                <Input value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </Field>
              <Field label="הערות">
                <Textarea value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>ביטול</Button>
                <Button onClick={save} disabled={saving}>{saving ? 'שומר…' : 'שמור'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
