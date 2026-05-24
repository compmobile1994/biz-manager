import { createClient } from '@/lib/supabase/server';
import { SuppliersClient } from './suppliers-client';

export default async function SuppliersPage() {
  const supabase = await createClient();

  // Suppliers + a one-shot aggregation of all expense rows so the client
  // can show "total spent" and "last purchase" per supplier without N+1.
  // (Expenses are typically <1000 rows for a small business — fine to ship.)
  const [{ data: suppliers }, { data: expenses }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, phone, email, address, tax_id, notes')
      .order('name', { ascending: true }),
    supabase
      .from('expenses')
      .select('supplier_id, vendor, amount, expense_date'),
  ]);

  // Aggregate per-supplier stats. Falls back to the legacy `vendor` text
  // for unmigrated rows, matched by name.
  type Stats = { total: number; count: number; last: string | null };
  const statsBySupplier = new Map<string, Stats>();
  const statsByVendorText = new Map<string, Stats>();
  for (const e of expenses ?? []) {
    const bucket = e.supplier_id
      ? (statsBySupplier.get(e.supplier_id) ?? { total: 0, count: 0, last: null })
      : (statsByVendorText.get(e.vendor ?? '') ?? { total: 0, count: 0, last: null });
    bucket.total += Number(e.amount ?? 0);
    bucket.count += 1;
    if (!bucket.last || (e.expense_date && e.expense_date > bucket.last)) bucket.last = e.expense_date ?? null;
    if (e.supplier_id) statsBySupplier.set(e.supplier_id, bucket);
    else statsByVendorText.set(e.vendor ?? '', bucket);
  }

  const enriched = (suppliers ?? []).map((s: any) => {
    const stats =
      statsBySupplier.get(s.id) ??
      statsByVendorText.get(s.name) ??
      { total: 0, count: 0, last: null };
    return { ...s, total_spent: stats.total, expense_count: stats.count, last_purchase: stats.last };
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ספקים</h1>
        <p className="text-muted-foreground">ניהול מאגר הספקים והיסטוריית הקניות</p>
      </div>
      <SuppliersClient initial={enriched as any} />
    </div>
  );
}
