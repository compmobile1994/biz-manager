import { createClient } from '@/lib/supabase/server';
import { ExpensesClient } from './expenses-client';

export default async function ExpensesPage() {
  const supabase = await createClient();
  const [{ data: expenses }, { data: categories }, { data: suppliers }] = await Promise.all([
    supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(500),
    supabase.from('expense_categories').select('*').order('sort_order'),
    supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
  ]);

  // Build a unified vendor name list (saved suppliers ∪ legacy vendor texts
  // that aren't yet linked to a supplier). The datalist on the input does
  // the merge for autocomplete; the user can type a brand-new vendor too.
  const vendorSet = new Set<string>();
  for (const s of suppliers ?? []) {
    if (s.name) vendorSet.add(s.name);
  }
  for (const e of expenses ?? []) {
    if (e.vendor) vendorSet.add(e.vendor);
  }
  const vendors = [...vendorSet].sort((a, b) => a.localeCompare(b, 'he'));

  // Build vendor→category memory: most-recent category used per vendor.
  // Used to auto-pick the category when the user types a known vendor again.
  const vendorCategoryMap: Record<string, string> = {};
  // expenses are already sorted by expense_date desc; first occurrence wins (= most recent)
  for (const e of expenses ?? []) {
    if (e.vendor && e.category_id && !vendorCategoryMap[e.vendor]) {
      vendorCategoryMap[e.vendor] = e.category_id;
    }
  }

  // Name → supplier_id lookup so when the user picks/types a known supplier
  // name we can auto-link the expense to the supplier row.
  const supplierIdByName: Record<string, string> = {};
  for (const s of suppliers ?? []) {
    supplierIdByName[s.name] = s.id;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">הוצאות</h1>
        <p className="text-muted-foreground">רישום הוצאות עסקיות עם צילומי קבלות</p>
      </div>
      <ExpensesClient
        initialExpenses={expenses ?? []}
        categories={categories ?? []}
        vendors={vendors}
        vendorCategoryMap={vendorCategoryMap}
        supplierIdByName={supplierIdByName}
      />
    </div>
  );
}
