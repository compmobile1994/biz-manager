'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Mail, Phone, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Customer } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

type CustomerType = 'regular' | 'occasional';
type TypeFilter = 'all' | CustomerType;

export function CustomersClient({ initial }: { initial: Customer[] }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [list, setList] = useState<Customer[]>(initial);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [editing, setEditing] = useState<(Partial<Customer> & { customer_type?: CustomerType }) | null>(null);

  const filtered = list.filter((c) => {
    const matchesSearch = [c.name, c.email, c.phone, c.tax_id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (typeFilter === 'all') return true;
    const t = ((c as any).customer_type ?? 'occasional') as CustomerType;
    return t === typeFilter;
  });

  function startNew() {
    setEditing({
      name: '',
      email: '',
      phone: '',
      address: '',
      tax_id: '',
      notes: '',
      customer_type: 'occasional',
    });
  }

  async function save() {
    if (!editing?.name?.trim()) {
      toast({ variant: 'destructive', title: 'שם הלקוח חובה' });
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const payload = { ...editing, user_id: user.id } as any;
    if (editing.id) {
      const { data, error } = await supabase.from('customers').update(payload).eq('id', editing.id).select().single();
      if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
      setList((l) => l.map((c) => (c.id === data.id ? (data as Customer) : c)));
    } else {
      const { data, error } = await supabase.from('customers').insert(payload).select().single();
      if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
      setList((l) => [...l, data as Customer].sort((a, b) => a.name.localeCompare(b.name, 'he')));
    }
    setEditing(null);
    toast({ title: 'נשמר' });
  }

  async function remove(id: string) {
    if (!confirm('למחוק את הלקוח? המסמכים הקיימים יישמרו.')) return;
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
    setList((l) => l.filter((c) => c.id !== id));
  }

  // Counts per type
  const totalCount = list.length;
  const regularCount = list.filter((c) => ((c as any).customer_type ?? 'occasional') === 'regular').length;
  const occasionalCount = totalCount - regularCount;

  const tabs: { key: TypeFilter; label: string; count: number }[] = [
    { key: 'all', label: 'הכל', count: totalCount },
    { key: 'regular', label: 'קבועים', count: regularCount },
    { key: 'occasional', label: 'מזדמנים', count: occasionalCount },
  ];

  return (
    <div className="space-y-4">
      {/* Stats card */}
      <Card>
        <CardContent className="py-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-3xl font-bold">{totalCount}</p>
            <p className="text-xs text-muted-foreground">סה״כ לקוחות</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">{regularCount}</p>
            <p className="text-xs text-muted-foreground">לקוחות קבועים</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-muted-foreground">{occasionalCount}</p>
            <p className="text-xs text-muted-foreground">מזדמנים</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Input placeholder="חיפוש…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" />
          לקוח חדש
        </Button>
      </div>

      <div className="flex gap-1 flex-wrap">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={typeFilter === t.key ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTypeFilter(t.key)}
          >
            {t.label} <span className="opacity-70 mr-1">({t.count})</span>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {search || typeFilter !== 'all' ? 'לא נמצאו לקוחות' : 'עדיין אין לקוחות. לחץ "לקוח חדש" כדי להוסיף.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((c) => {
            const cType = ((c as any).customer_type ?? 'occasional') as CustomerType;
            return (
              <Card key={c.id}>
                <CardContent className="py-4 flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{c.name}</p>
                      {cType === 'regular' && (
                        <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-medium">
                          לקוח קבוע
                        </span>
                      )}
                    </div>
                    {c.tax_id && <p className="text-xs text-muted-foreground">ת״ז/ח.פ.: {c.tax_id}</p>}
                    {c.email && <p className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</p>}
                    {c.phone && <p className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing({ ...(c as any), customer_type: cType })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg">{editing.id ? 'עריכת לקוח' : 'לקוח חדש'}</h3>
                <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Field label="שם (חובה)">
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ת״ז / ח.פ.">
                  <Input value={editing.tax_id ?? ''} onChange={(e) => setEditing({ ...editing, tax_id: e.target.value })} />
                </Field>
                <Field label="טלפון">
                  <Input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </Field>
              </div>
              <Field label="דוא״ל">
                <Input type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
              <Field label="כתובת">
                <Input value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </Field>
              <Field label="סוג לקוח">
                <Select
                  value={(editing.customer_type ?? 'occasional') as CustomerType}
                  onValueChange={(v) => setEditing({ ...editing, customer_type: v as CustomerType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="occasional">מזדמן</SelectItem>
                    <SelectItem value="regular">קבוע</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="הערות">
                <Textarea value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
