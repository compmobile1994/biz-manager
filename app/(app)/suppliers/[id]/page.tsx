import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowRight, Mail, Phone, MapPin, Receipt, Truck } from 'lucide-react';

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!supplier) notFound();

  // Pull all expenses tied to this supplier (by FK or matching legacy
  // vendor text). category name is joined so the list reads clearly.
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, expense_date, vendor, amount, description, payment_method, category:expense_categories(name, color)')
    .or(`supplier_id.eq.${id},vendor.eq.${supplier.name}`)
    .order('expense_date', { ascending: false });

  const list = expenses ?? [];
  const total = list.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
  const last = list[0]?.expense_date ?? null;
  const thisYear = new Date().getFullYear();
  const totalThisYear = list
    .filter((e: any) => e.expense_date?.startsWith(String(thisYear)))
    .reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/suppliers">
          <Button variant="ghost" size="icon">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            {supplier.name}
          </h1>
          <p className="text-sm text-muted-foreground">פרטי ספק והיסטוריית קניות</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold">{formatCurrency(total)}</p>
            <p className="text-xs text-muted-foreground">סה״כ קניות (כל הזמנים)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-primary">{formatCurrency(totalThisYear)}</p>
            <p className="text-xs text-muted-foreground">סה״כ קניות ב-{thisYear}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold">{last ? formatDate(last) : '—'}</p>
            <p className="text-xs text-muted-foreground">קנייה אחרונה</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטי ספק</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {supplier.tax_id && <p className="text-sm"><strong>ח.פ.:</strong> {supplier.tax_id}</p>}
          {supplier.phone && (
            <p className="text-sm flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${supplier.phone}`} className="hover:underline">{supplier.phone}</a>
            </p>
          )}
          {supplier.email && (
            <p className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${supplier.email}`} className="hover:underline">{supplier.email}</a>
            </p>
          )}
          {supplier.address && (
            <p className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {supplier.address}
            </p>
          )}
          {supplier.notes && (
            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{supplier.notes}</p>
          )}
          {!supplier.tax_id && !supplier.phone && !supplier.email && !supplier.address && !supplier.notes && (
            <p className="text-sm text-muted-foreground italic">— אין פרטים נוספים. ניתן לערוך בעמוד הספקים. —</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>היסטוריית קניות ({list.length})</CardTitle>
          <Link href={`/expenses?supplier=${encodeURIComponent(supplier.name)}`}>
            <Button variant="outline" size="sm">
              <Receipt className="h-4 w-4" />
              עבור להוצאות
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">עדיין אין קניות מתועדות מספק זה.</p>
          ) : (
            <div className="divide-y">
              {list.map((e: any) => (
                <div key={e.id} className="p-3 hover:bg-accent/30 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{formatDate(e.expense_date)}</p>
                      {e.category?.name && (
                        <span
                          className="text-xs rounded-full px-2 py-0.5"
                          style={{ background: (e.category?.color ?? '#94a3b8') + '20', color: e.category?.color ?? '#475569' }}
                        >
                          {e.category.name}
                        </span>
                      )}
                    </div>
                    {e.description && <p className="text-xs text-muted-foreground truncate">{e.description}</p>}
                  </div>
                  <span className="font-semibold">{formatCurrency(Number(e.amount ?? 0))}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
