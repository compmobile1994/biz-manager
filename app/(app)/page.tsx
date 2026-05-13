import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, documentTypeLabel } from '@/lib/utils';
import { ArrowLeft, FileText, Receipt, TrendingUp, Users, Wallet } from 'lucide-react';
import { DashboardChart } from './dashboard-chart';

async function getStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [
    { data: ytdDocs },
    { data: ytdExpenses },
    { data: lastDocs },
    { data: settings },
    { data: allCustomers, count: customerCountRaw },
  ] = await Promise.all([
    supabase.from('documents').select('total, issue_date, document_type, status, customer_id').eq('user_id', user.id).gte('issue_date', startOfYear).neq('status', 'cancelled'),
    supabase.from('expenses').select('amount, expense_date').eq('user_id', user.id).gte('expense_date', startOfYear),
    supabase.from('documents').select('id, document_type, number, customer_name_snapshot, total, issue_date, status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('business_settings').select('business_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('customers').select('customer_type', { count: 'exact' }).eq('user_id', user.id),
  ]);

  const customerCount = customerCountRaw ?? (allCustomers?.length ?? 0);
  const regularCount = (allCustomers ?? []).filter((c: any) => c.customer_type === 'regular').length;

  const ytdRevenue = (ytdDocs ?? []).reduce((s, d) => s + Number(d.total || 0), 0);
  const monthRevenue = (ytdDocs ?? []).filter((d) => d.issue_date >= startOfMonth).reduce((s, d) => s + Number(d.total || 0), 0);
  const ytdExpensesTotal = (ytdExpenses ?? []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthExpenses = (ytdExpenses ?? []).filter((e) => e.expense_date >= startOfMonth).reduce((s, e) => s + Number(e.amount || 0), 0);

  // Top customers YTD by revenue
  const customerTotals = new Map<string, { total: number; count: number }>();
  for (const d of ytdDocs ?? []) {
    if (d.status === 'cancelled' || !d.customer_id) continue;
    const cur = customerTotals.get(d.customer_id) ?? { total: 0, count: 0 };
    cur.total += Number(d.total || 0);
    cur.count += 1;
    customerTotals.set(d.customer_id, cur);
  }
  const topIds = [...customerTotals.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const customerIds = topIds.map(([id]) => id);
  const { data: topCustomersData } = customerIds.length
    ? await supabase.from('customers').select('id, name').in('id', customerIds)
    : { data: [] as { id: string; name: string }[] };
  const topCustomers = topIds.map(([id, s]) => ({
    id,
    total: s.total,
    count: s.count,
    name: topCustomersData?.find((c) => c.id === id)?.name ?? 'לקוח',
  }));

  // Build 12-month series
  const months: { label: string; income: number; expenses: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const startStr = d.toISOString().slice(0, 10);
    const endStr = next.toISOString().slice(0, 10);
    const income = (ytdDocs ?? []).filter((x) => x.issue_date >= startStr && x.issue_date < endStr).reduce((s, x) => s + Number(x.total || 0), 0);
    const expenses = (ytdExpenses ?? []).filter((x) => x.expense_date >= startStr && x.expense_date < endStr).reduce((s, x) => s + Number(x.amount || 0), 0);
    months.push({ label: d.toLocaleDateString('he-IL', { month: 'short' }), income, expenses });
  }

  return {
    ytdRevenue,
    monthRevenue,
    ytdExpenses: ytdExpensesTotal,
    monthExpenses,
    netYtd: ytdRevenue - ytdExpensesTotal,
    lastDocs: lastDocs ?? [],
    months,
    topCustomers,
    customerCount,
    regularCount,
    hasSettings: !!settings,
    businessName: settings?.business_name,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();
  if (!stats) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">{stats.businessName ?? 'מסך הבית'}</h1>
          <p className="text-muted-foreground">סקירה כללית של העסק</p>
        </div>
        <Link href="/documents/new">
          <Button size="lg">
            הוצא מסמך חדש
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {!stats.hasSettings && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 flex items-center justify-between">
            <p className="text-sm">לפני הוצאת מסמך ראשון - הגדר את פרטי העסק</p>
            <Link href="/settings">
              <Button size="sm">להגדרות</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="הכנסות החודש" value={stats.monthRevenue} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="הכנסות השנה" value={stats.ytdRevenue} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="הוצאות השנה" value={stats.ytdExpenses} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="רווח השנה" value={stats.netYtd} icon={<TrendingUp className="h-5 w-5" />} highlight />
      </div>

      <Link href="/customers" className="block">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="py-4 grid grid-cols-3 gap-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.customerCount}</p>
                <p className="text-xs text-muted-foreground">סה״כ לקוחות</p>
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{stats.regularCount}</p>
              <p className="text-xs text-muted-foreground">לקוחות קבועים</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-muted-foreground">{stats.customerCount - stats.regularCount}</p>
              <p className="text-xs text-muted-foreground">מזדמנים</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>הכנסות והוצאות 12 חודשים אחרונים</CardTitle>
        </CardHeader>
        <CardContent>
          <DashboardChart data={stats.months} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>לקוחות מובילים השנה</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">ללא לקוחות עדיין</p>
          ) : (
            <div className="divide-y">
              {stats.topCustomers.map((c, idx) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between py-3 hover:bg-accent/50 rounded px-2 -mx-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{idx + 1}</span>
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.count} מסמכים</p>
                    </div>
                  </div>
                  <span className="font-semibold">{formatCurrency(c.total)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>מסמכים אחרונים</CardTitle>
            <Link href="/documents">
              <Button variant="link" size="sm">לכל המסמכים</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {stats.lastDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">עדיין לא הוצאת מסמכים</p>
          ) : (
            <div className="divide-y">
              {stats.lastDocs.map((d: any) => (
                <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center justify-between py-3 hover:bg-accent/50 rounded px-2 -mx-2">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{documentTypeLabel[d.document_type]} #{d.number}</p>
                      <p className="text-xs text-muted-foreground">{d.customer_name_snapshot} · {formatDate(d.issue_date)}</p>
                    </div>
                  </div>
                  <span className={d.status === 'cancelled' ? 'line-through text-muted-foreground' : 'font-semibold'}>
                    {formatCurrency(Number(d.total))}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon, highlight }: { label: string; value: number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary/40' : undefined}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className={`text-2xl font-bold mt-2 ${highlight ? 'text-primary' : ''}`}>{formatCurrency(value)}</p>
      </CardContent>
    </Card>
  );
}
