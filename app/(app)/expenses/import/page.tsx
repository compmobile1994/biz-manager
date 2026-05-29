import { createClient } from '@/lib/supabase/server';
import { ExpensesImportClient } from './expenses-import-client';

export default async function ExpensesImportPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: suppliers }, { data: expenses }] = await Promise.all([
    supabase.from('expense_categories').select('id, name').order('sort_order'),
    supabase.from('suppliers').select('id, name').order('name'),
    supabase.from('expenses').select('vendor').not('vendor', 'is', null).limit(500),
  ]);

  // Union of supplier names + historical vendor strings for autocomplete.
  const vendorSet = new Set<string>();
  for (const s of suppliers ?? []) if ((s as any).name) vendorSet.add((s as any).name);
  for (const e of expenses ?? []) if ((e as any).vendor) vendorSet.add((e as any).vendor);
  const vendors = [...vendorSet].sort((a, b) => a.localeCompare(b, 'he'));

  // Lookup map so the client can auto-link to a saved supplier when the
  // user types a matching name.
  const supplierIdByName: Record<string, string> = {};
  for (const s of suppliers ?? []) supplierIdByName[(s as any).name] = (s as any).id;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ייבוא הוצאות מרובה</h1>
        <p className="text-muted-foreground">
          העלה תיקייה שלמה של קבלות מספקים (PDF/תמונה) — מלא את הפרטים שורה אחר שורה, וכולן יישמרו בלחיצה אחת.
        </p>
      </div>
      <ExpensesImportClient
        categories={(categories ?? []) as any}
        vendors={vendors}
        supplierIdByName={supplierIdByName}
      />
    </div>
  );
}
