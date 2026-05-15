import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, FileEdit } from 'lucide-react';
import { DocumentsList } from './documents-list';
import type { DocumentRow } from '@/lib/supabase/types';
import { DraftsSection } from './drafts-section';
import { RegenerateAllButton } from './regenerate-all-button';

export default async function DocumentsPage() {
  const supabase = await createClient();
  const [{ data: docs }, { data: drafts }] = await Promise.all([
    supabase
      .from('documents')
      // Only the columns the list-view actually renders. Avoids sending
      // pdf_url / notes / snapshots over the wire on every visit.
      .select('id, document_type, number, customer_name_snapshot, issue_date, total, status')
      .order('issue_date', { ascending: false })
      .order('number', { ascending: false }),
    supabase
      .from('document_drafts')
      .select('id, label, updated_at')
      .order('updated_at', { ascending: false }),
  ]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">מסמכים</h1>
          <p className="text-muted-foreground">קבלות, חשבוניות עסקה וזיכויים</p>
        </div>
        <div className="flex items-center gap-2">
          <RegenerateAllButton />
          <Link href="/documents/new">
            <Button size="lg">
              <Plus className="h-4 w-4" />
              מסמך חדש
            </Button>
          </Link>
        </div>
      </div>

      <DraftsSection initialDrafts={(drafts as any[] | null) ?? []} />

      <DocumentsList initial={(docs as DocumentRow[] | null) ?? []} />
    </div>
  );
}
