import { createClient } from '@/lib/supabase/server';
import { ReportsClient } from './reports-client';

type BreakdownItem = { name: string; value: number; color: string | null };

async function fetchBreakdown(userId: string, year: number): Promise<BreakdownItem[]> {
  const supabase = await createClient();
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount, category_id')
      .eq('user_id', userId)
      .gte('expense_date', start)
      .lt('expense_date', end),
    supabase.from('expense_categories').select('id, name, color').eq('user_id', userId),
  ]);

  const catMap = new Map<string, { name: string; color: string | null }>();
  for (const c of categories ?? []) {
    catMap.set(c.id, { name: c.name, color: c.color });
  }

  const totals = new Map<string, number>();
  for (const e of expenses ?? []) {
    const key = e.category_id ?? '__none__';
    totals.set(key, (totals.get(key) ?? 0) + Number(e.amount || 0));
  }

  const result: BreakdownItem[] = [];
  for (const [key, value] of totals) {
    if (value <= 0) continue;
    if (key === '__none__') {
      result.push({ name: 'ללא קטגוריה', value, color: null });
    } else {
      const cat = catMap.get(key);
      result.push({ name: cat?.name ?? 'קטגוריה', value, color: cat?.color ?? null });
    }
  }
  result.sort((a, b) => b.value - a.value);
  return result;
}

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const currentYear = new Date().getFullYear();

  const [{ data: settings }, initialBreakdown] = await Promise.all([
    supabase
      .from('business_settings')
      .select('accountant_name, accountant_email, business_name')
      .eq('user_id', user.id)
      .maybeSingle(),
    fetchBreakdown(user.id, currentYear),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">דוחות / רואה חשבון</h1>
        <p className="text-muted-foreground">ייצוא חבילה שנתית מלאה לרואה החשבון</p>
      </div>
      <ReportsClient
        accountantEmail={settings?.accountant_email ?? ''}
        accountantName={settings?.accountant_name ?? ''}
        businessName={settings?.business_name ?? ''}
        initialBreakdown={initialBreakdown}
        initialBreakdownYear={currentYear}
      />
    </div>
  );
}
