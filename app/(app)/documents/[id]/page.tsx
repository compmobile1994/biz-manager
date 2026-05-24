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

  // We fetch the business settings early so we can build a friendly download
  // filename for the PDF — "קבלה-169-מיכאל-הנסב-קומפ-מובייל.pdf" — so the
  // customer who downloads it can hand a recognizable file to their accountant.
  const { data: settingsForName } = await supabase
    .from('business_settings')
    .select('business_name')
    .eq('user_id', user.id)
    .maybeSingle();

  function safeName(s: string | null | undefined): string {
    return (s ?? '')
      .trim()
      // Strip filesystem-unsafe chars and collapse whitespace to single dashes
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);
  }

  const docLabel = documentTypeLabel[doc.document_type] ?? 'מסמך';
  const downloadFilename = [
    safeName(docLabel),
    String(doc.number),
    safeName(doc.customer_name_snapshot),
    safeName(settingsForName?.business_name),
  ]
    .filter(Boolean)
    .join('-') + '.pdf';

  // Signed URL for the PDF — pass `download: <filename>` so Supabase adds
  // Content-Disposition: attachment with our nice filename. The browser will
  // save the file under that name instead of the storage UUID.
  let pdfUrl: string | null = null;
  if (doc.pdf_url) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrl(doc.pdf_url, 60 * 60, {
      download: downloadFilename,
    });
    pdfUrl = signed?.signedUrl ?? null;
  }

  // ניסיון לאחזר אימייל לקוח אם קיים customer_id
  let customerEmail: string | null = null;
  let customerPhone: string | null = null;
  if (doc.customer_id) {
    const { data: c } = await supabase.from('customers').select('email, phone, phone2').eq('id', doc.customer_id).maybeSingle();
    customerEmail = c?.email ?? null;
    // For WhatsApp / SMS sending: prefer the mobile number (Israeli prefix 05).
    // Some customers have a landline as the primary phone (printed on the
    // receipt) and a personal mobile in phone2 for messaging. Pick whichever
    // one looks like a mobile.
    const isMobile = (p?: string | null) => !!p && /^0?5\d/.test(p.replace(/\D/g, ''));
    const phoneAny = c?.phone ?? null;
    const phone2Any = (c as any)?.phone2 ?? null;
    customerPhone = isMobile(phone2Any) ? phone2Any
                  : isMobile(phoneAny) ? phoneAny
                  : (phoneAny ?? phone2Any ?? null);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 relative">
      <div className="absolute -top-1 right-1 text-sm font-bold text-slate-600 tracking-wider">בס&quot;ד</div>
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
          businessPhone={settings?.phone ?? null}
          businessBankName={settings?.bank_name ?? null}
          businessBankBranch={settings?.bank_branch ?? null}
          businessBankAccount={settings?.bank_account ?? null}
          businessOwnerName={settings?.owner_name ?? null}
          documentNumber={doc.number}
          docType={doc.document_type}
          docTotal={Number(doc.total)}
          customerName={doc.customer_name_snapshot}
          status={doc.status}
          sentAt={doc.sent_at ?? null}
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
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3">תיאור</th>
                <th className="p-3 w-20">כמות</th>
                <th className="p-3 w-28">מחיר יח׳</th>
                <th className="p-3 w-28">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it: any, idx: number) => {
                const extras: string[] = [];
                if (it.item_number) extras.push(`מספר: ${it.item_number}`);
                if (it.phone_number) extras.push(`טלפון: ${it.phone_number}`);
                if (it.imei) extras.push(`IMEI: ${it.imei}`);
                if (it.warranty_months) {
                  const d = new Date(doc.issue_date + 'T00:00:00');
                  d.setMonth(d.getMonth() + it.warranty_months);
                  const provider = it.warranty_provider ? ` (${it.warranty_provider})` : '';
                  extras.push(`אחריות: ${it.warranty_months} ח׳${provider} — עד ${formatDate(d)}`);
                } else if (it.warranty_provider) {
                  extras.push(`אחריות: ${it.warranty_provider}`);
                }
                if (it.importer_type) {
                  extras.push(it.importer_type === 'official' ? 'יבואן רשמי' : 'יבואן מקביל');
                }
                return (
                  <tr key={it.id} className="border-t">
                    <td className="p-3 text-center text-muted-foreground">{idx + 1}</td>
                    <td className="p-3">
                      <div>{it.description}</div>
                      {extras.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">{extras.join(' · ')}</div>
                      )}
                    </td>
                    <td className="p-3">{it.quantity}</td>
                    <td className="p-3">{formatCurrency(Number(it.unit_price))}</td>
                    <td className="p-3 font-medium">{formatCurrency(Number(it.line_total))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-muted/30">
                <td className="p-3" colSpan={4}>סה״כ</td>
                <td className="p-3">{formatCurrency(Number(doc.total))}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {payments && payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>תשלום</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {payments.map((p: any) => (
              <div key={p.id} className="space-y-2">
                <div className="flex justify-between border-b py-2">
                  <span>
                    {paymentMethodLabel[p.method]}
                    {p.card_last4 ? ` (${p.card_last4})` : ''}
                    {p.auth_code ? ` · אסמכתה: ${p.auth_code}` : ''}
                    {p.method === 'other' && p.other_description ? ` · ${p.other_description}` : ''}
                  </span>
                  <span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
                </div>
                {p.method === 'check' && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="font-semibold mb-2">פרטי הצ׳ק:</p>
                    <div className="grid grid-cols-2 gap-y-1 gap-x-4">
                      <div><span className="text-muted-foreground">מספר צ׳ק: </span>{p.check_number || '—'}</div>
                      <div><span className="text-muted-foreground">בנק: </span>{p.check_bank || '—'}</div>
                      <div><span className="text-muted-foreground">מספר חשבון: </span>{p.check_account || '—'}</div>
                      <div><span className="text-muted-foreground">תאריך פרעון: </span>{p.check_due_date ? formatDate(p.check_due_date) : '—'}</div>
                      <div className="col-span-2"><span className="text-muted-foreground">סכום: </span><span className="font-semibold">{formatCurrency(Number(p.amount))}</span></div>
                    </div>
                  </div>
                )}
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
