'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileEdit, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { formatDateTime } from '@/lib/utils';

interface Draft {
  id: string;
  label: string | null;
  updated_at: string;
}

export function DraftsSection({ initialDrafts }: { initialDrafts: Draft[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [open, setOpen] = useState(initialDrafts.length > 0);

  async function remove(id: string) {
    if (!confirm('למחוק את הטיוטה? לא ניתן לבטל פעולה זו.')) return;
    const res = await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'שגיאה במחיקה' });
      return;
    }
    setDrafts((d) => d.filter((x) => x.id !== id));
    toast({ title: 'הטיוטה נמחקה' });
    router.refresh();
  }

  if (drafts.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardContent className="py-3">
        <button
          type="button"
          className="w-full flex items-center justify-between font-semibold text-sm"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-amber-700" />
            📝 טיוטות שמורות ({drafts.length})
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {open && (
          <div className="mt-3 divide-y">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2">
                <Link
                  href={`/documents/new?draft=${d.id}`}
                  className="flex-1 flex items-center gap-2 hover:text-blue-600"
                >
                  <FileEdit className="h-4 w-4 text-amber-700" />
                  <div>
                    <p className="text-sm font-medium">{d.label || 'טיוטה'}</p>
                    <p className="text-xs text-muted-foreground">נשמר: {formatDateTime(d.updated_at)}</p>
                  </div>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => remove(d.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
