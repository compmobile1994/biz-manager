'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { SavedItem } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';

export function SavedItemsClient({ initial }: { initial: SavedItem[] }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [list, setList] = useState<SavedItem[]>(initial);
  const [editing, setEditing] = useState<Partial<SavedItem> | null>(null);
  const [saving, setSaving] = useState(false);

  function startNew() {
    setEditing({ name: '', description: '', default_price: 0, is_active: true });
  }

  async function save() {
    if (saving) return;
    if (!editing?.name?.trim()) return toast({ variant: 'destructive', title: 'שם הפריט חובה' });
    const price = Math.max(0, Math.round(Number(editing.default_price) || 0));
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = { ...editing, user_id: user.id, default_price: price } as any;
      if (editing.id) {
        const { data, error } = await supabase.from('saved_items').update(payload).eq('id', editing.id).select().single();
        if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
        setList((l) => l.map((x) => (x.id === data.id ? (data as SavedItem) : x)));
      } else {
        const { data, error } = await supabase.from('saved_items').insert(payload).select().single();
        if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
        setList((l) => [...l, data as SavedItem].sort((a, b) => a.name.localeCompare(b.name, 'he')));
      }
      setEditing(null);
      toast({ title: 'נשמר' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('למחוק את הפריט?')) return;
    const { error } = await supabase.from('saved_items').update({ is_active: false }).eq('id', id);
    if (error) return toast({ variant: 'destructive', title: 'שגיאה', description: error.message });
    setList((l) => l.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" />
          פריט חדש
        </Button>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            עדיין אין פריטים שמורים. הוסף פריטים תכופים לבחירה מהירה בקבלות.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((it) => (
            <Card key={it.id}>
              <CardContent className="py-4 flex justify-between items-start">
                <div className="space-y-1">
                  <p className="font-semibold">{it.name}</p>
                  {it.description && <p className="text-sm text-muted-foreground">{it.description}</p>}
                  <p className="text-sm">{formatCurrency(Number(it.default_price))}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(it)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(it.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
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
                <h3 className="font-bold text-lg">{editing.id ? 'עריכת פריט' : 'פריט חדש'}</h3>
                <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>שם (חובה)</Label>
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>תיאור</Label>
                <Textarea value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>מחיר ברירת מחדל</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  value={editing.default_price || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditing({ ...editing, default_price: v === '' ? 0 : Math.round(Number(v)) });
                  }}
                />
              </div>
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
