import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { ArrowRight, FileText, Plus } from 'lucide-react';
import { CustomerDocsBulk } from './customer-docs-bulk';
import { CustomerPeriodReport } from './customer-period-report';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: customer } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
  if (!customer) notFound();

  const [{ data: docs }, { data: settings }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, number, document_type, issue_date, total, status, sent_at')
      .eq('customer_id', id)
      .order('issue_date', { ascending: false }),
    supabase
      .from('business_settings')
      .select('business_name')
      .eq('user_id', user?.id ?? '')
      .maybeSingle(),
  ]);
  const businessName = settings?.business_name ?? 'העסק שלי';

  const documents = docs ?? [];
  const docCount = documents.length;
  const totalRevenue = documents
    .filter((d: any) => d.status !== 'cancelled')
    .reduce((sum: number, d: any) => sum + Number(d.total ?? 0), 0);
  const lastDocDate = documents[0]?.issue_date ?? null;

  const isRecurring = customer.customer_type === 'recurring';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/customers">
          <Button variant="ghost" size="icon">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
            {customer.name}
            <span
              className={
                isRecurring
                  ? 'inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium'
                  : 'inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium'
              }
            >
              {isRecurring ? 'קבוע' : 'מזדמן'}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">פרטי לקוח והיסטוריית מסמכים</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטי לקוח</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">אימייל</p>
            <p>{customer.email || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">טלפון</p>
            <p>{customer.phone || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs">כתובת</p>
            <p>{customer.address || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">ת״ז / ח.פ.</p>
            <p>{customer.tax_id || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">נוצר ב-</p>
            <p>{customer.created_at ? formatDateTime(customer.created_at) : '—'}</p>
          </div>
          {customer.notes && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground text-xs">הערות</p>
              <p className="whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">מסמכים</p>
            <p className="text-2xl font-bold">{docCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">הכנסות סה״כ</p>
            <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">מסמך אחרון</p>
            <p className="text-2xl font-bold">{lastDocDate ? formatDate(lastDocDate) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>היסטוריית מסמכים</CardTitle>
        </CardHeader>
        <CardContent className={documents.length === 0 ? 'p-0' : 'p-4'}>
          {documents.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-4">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">עדיין לא הוצאת מסמכים ללקוח זה.</p>
              <Link href={`/documents/new?customer=${id}`}>
                <Button>
                  <Plus className="h-4 w-4" />
                  צור מסמך ללקוח זה
                </Button>
              </Link>
            </div>
          ) : (
            <CustomerDocsBulk
              docs={documents as any}
              customerName={customer.name}
              customerPhone={customer.phone}
              businessName={businessName}
            />
          )}
        </CardContent>
      </Card>

      {documents.length > 0 && (
        <CustomerPeriodReport
          docs={documents as any}
          customerName={customer.name}
          businessName={businessName}
        />
      )}
    </div>
  );
}
