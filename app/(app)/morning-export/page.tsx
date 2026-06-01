import { createClient } from '@/lib/supabase/server';
import { MorningExportClient } from './morning-export-client';

export default async function MorningExportPage() {
  const supabase = await createClient();

  // Last live (non-historical) receipt number — Morning needs this so it can
  // continue numbering from the next number after our system left off.
  const { data: lastReceipt } = await supabase
    .from('documents')
    .select('number')
    .eq('is_historical', false)
    .eq('document_type', 'receipt')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: customers }, { data: suppliers }] = await Promise.all([
    supabase
      .from('customers')
      .select('name, email, phone, phone2, address, tax_id, notes')
      .order('name'),
    supabase
      .from('suppliers')
      .select('name, email, phone, address, tax_id, notes')
      .order('name'),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ייצוא ל-Morning</h1>
        <p className="text-muted-foreground">
          ייצוא לקוחות וספקים בפורמט CSV לייבוא חד-פעמי במערכת Morning (חשבונית ירוקה).
        </p>
      </div>
      <MorningExportClient
        customers={(customers as any) ?? []}
        suppliers={(suppliers as any) ?? []}
        nextReceiptNumber={(lastReceipt?.number ?? 0) + 1}
      />
    </div>
  );
}
