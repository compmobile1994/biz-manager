import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { documentTypeLabel, formatCurrency, formatDate, paymentMethodLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { DocumentActions } from './document-actions';

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: doc }, { data: items }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).maybeSingle(),
    supabase.from('document_items').select('*').eq('document_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('document_id', id),
    supabase.from('business_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  if (!doc) notFound();

  // Signed URL for the PDF
  let pdfUrl: string | null = null;
  if (doc.pdf_url) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrl(doc.pdf_url, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  // ניסיון לאחזר אימייל לקוח אם קיים customer_id
  let customerEmail: string | null = null;
  let customerPhone: string | null = null;
  if (doc.customer_id) {
    const { data: c } = await supabase.from('customers').select('email, phone').eq('id', doc.customer_id).maybeSingle();
    customerEmail = c?.email ?? null;
    customerPhone = c?.phone ?? null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link href="/documents">
            <Button variant="ghost" size="icon"><ArrowRight className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">
              {documentTypeLabel[doc.document_type]} #{doc.number}
              {doc.status === 'cancelled' && <span className="text-destructive text-sm mr-2">(בוטל)</span>}
            </h1>
            <p className="text-sm text-muted-foreground">{formatDate(doc.issue_date)}</p>
          </div>
        </div>
        <DocumentActions
          docId={doc.id}
          pdfUrl={pdfUrl}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          businessName={settings?.business_name ?? 'העסק שלי'}
          documentNumber={doc.number}
          docType={doc.document_type}
        />
      </div>

      <Card>
        <CardHeader><CardTitle>לקוח</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <p className="font-semibold">{doc.customer_name_snapshot}</p>
          {doc.customer_tax_id_snapshot && <p className="text-sm">ת״ז/ח.פ.: {doc.customer_tax_id_snapshot}</p>}
          {doc.customer_address_snapshot && <p className="text-sm">{doc.customer_address_snapshot}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>פריטים</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-right">
                <th className="p-3">תיאור</th>
                <th className="p-3 w-20">כמות</th>
                <th className="p-3 w-28">מחיר יח׳</th>
                <th className="p-3 w-28">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it: any) => (
                <tr key={it.id} className="border-t">
                  <td className="p-3">{it.description}</td>
                  <td className="p-3">{it.quantity}</td>
                  <td className="p-3">{formatCurrency(Number(it.unit_price))}</td>
                  <td className="p-3 font-medium">{formatCurrency(Number(it.line_total))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-muted/30">
                <td className="p-3" colSpan={3}>סה״כ</td>
                <td className="p-3">{formatCurrency(Number(doc.total))}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {payments && payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>תשלום</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {payments.map((p: any) => (
              <div key={p.id} className="flex justify-between border-b last:border-b-0 py-2">
                <span>{paymentMethodLabel[p.method]}{p.card_last4 ? ` (${p.card_last4})` : ''}{p.auth_code ? ` · אסמכתה: ${p.auth_code}` : ''}</span>
                <span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {doc.notes && (
        <Card>
          <CardHeader><CardTitle>הערות</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{doc.notes}</p></CardContent>
        </Card>
      )}

      {doc.sent_at && (
        <p className="text-xs text-muted-foreground text-center">
          נשלח ב-{formatDate(doc.sent_at)} דרך {doc.sent_via}
        </p>
      )}
    </div>
  );
}
