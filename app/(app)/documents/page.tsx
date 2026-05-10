import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { DocumentsList } from './documents-list';
import type { DocumentRow } from '@/lib/supabase/types';

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from('documents')
    .select('*')
    .order('issue_date', { ascending: false })
    .order('number', { ascending: false });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">מסמכים</h1>
          <p className="text-muted-foreground">קבלות, חשבוניות עסקה וזיכויים</p>
        </div>
        <Link href="/documents/new">
          <Button size="lg">
            <Plus className="h-4 w-4" />
            מסמך חדש
          </Button>
        </Link>
      </div>

      <DocumentsList initial={(docs as DocumentRow[] | null) ?? []} />
    </div>
  );
}
