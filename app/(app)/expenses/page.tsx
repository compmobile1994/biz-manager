import { createClient } from '@/lib/supabase/server';
import { ExpensesClient } from './expenses-client';

export default async function ExpensesPage() {
  const supabase = await createClient();
  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(500),
    supabase.from('expense_categories').select('*').order('sort_order'),
  ]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">הוצאות</h1>
        <p className="text-muted-foreground">רישום הוצאות עסקיות עם צילומי קבלות</p>
      </div>
      <ExpensesClient initialExpenses={expenses ?? []} categories={categories ?? []} />
    </div>
  );
}
