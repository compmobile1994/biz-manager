import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DocumentForm } from './document-form';

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // If user clicked "duplicate" on a past receipt, fetch its data to pre-fill
  let prefill: any = null;
  if (params.duplicate) {
    const [{ data: srcDoc }, { data: srcItems }, { data: srcPayment }] = await Promise.all([
      supabase.from('documents').select('*').eq('id', params.duplicate).maybeSingle(),
      supabase.from('document_items').select('*').eq('document_id', params.duplicate).order('sort_order'),
      supabase.from('payments').select('*').eq('document_id', params.duplicate).maybeSingle(),
    ]);
    if (srcDoc) {
      prefill = {
        document_type: srcDoc.document_type,
        customer_id: srcDoc.customer_id,
        customer_name: srcDoc.customer_name_snapshot,
        customer_tax_id: srcDoc.customer_tax_id_snapshot ?? '',
        customer_address: srcDoc.customer_address_snapshot ?? '',
        notes: srcDoc.notes ?? '',
        lines: (srcItems ?? []).map((it: any) => ({
          saved_item_id: it.saved_item_id,
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          phone_number: it.phone_number ?? '',
        })),
        payment: srcPayment
          ? {
              method: srcPayment.method,
              card_last4: srcPayment.card_last4 ?? '',
              card_holder: srcPayment.card_holder ?? '',
              auth_code: srcPayment.auth_code ?? '',
              check_number: srcPayment.check_number ?? '',
              check_bank: srcPayment.check_bank ?? '',
              transfer_ref: srcPayment.transfer_ref ?? '',
            }
          : null,
        sourceNumber: srcDoc.number,
      };
    }
  }

  const { data: settings } = await supabase
    .from('business_settings')
    .select(
      'business_name, owner_name, tax_id, address, city, phone, email, brand_color, logo_url, signature_url, invoice_footer',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (!settings || !settings.business_name || !settings.tax_id) {
    redirect('/settings?from=new-document');
  }

  // Resolve logo + signature storage paths → signed URLs for the live preview
  let logoUrl: string | null = null;
  if (settings.logo_url) {
    const { data: signed } = await supabase.storage
      .from('business')
      .createSignedUrl(settings.logo_url, 60 * 60);
    logoUrl = signed?.signedUrl ?? null;
  }
  let signatureUrl: string | null = null;
  if ((settings as any).signature_url) {
    const { data: signed } = await supabase.storage
      .from('business')
      .createSignedUrl((settings as any).signature_url, 60 * 60);
    signatureUrl = signed?.signedUrl ?? null;
  }

  const [{ data: customers }, { data: items }, { data: counters }] = await Promise.all([
    supabase.from('customers').select('id, name, email, phone, address, tax_id').order('name'),
    supabase.from('saved_items').select('id, name, description, default_price').eq('is_active', true).order('name'),
    supabase.from('document_counters').select('document_type, last_number').eq('user_id', user.id),
  ]);

  // Build a map of expected next numbers per document type
  const nextNumbers: Record<string, number> = {
    receipt: 1,
    invoice: 1,
    invoice_receipt: 1,
    credit: 1,
  };
  for (const c of (counters as { document_type: string; last_number: number }[] | null) ?? []) {
    nextNumbers[c.document_type] = Number(c.last_number) + 1;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">מסמך חדש</h1>
        <p className="text-muted-foreground">
          {prefill
            ? `שכפול קבלה #${prefill.sourceNumber} - בדוק את הפרטים, שנה אם צריך, ואז אשר`
            : 'הוצאת קבלה / חשבונית עסקה'}
        </p>
      </div>
      <DocumentForm
        customers={customers ?? []}
        savedItems={items ?? []}
        nextNumbers={nextNumbers}
        prefill={prefill}
        settings={{
          business_name: settings.business_name,
          owner_name: (settings as any).owner_name ?? null,
          tax_id: settings.tax_id,
          address: (settings as any).address ?? null,
          city: (settings as any).city ?? null,
          phone: (settings as any).phone ?? null,
          email: (settings as any).email ?? null,
          brand_color: (settings as any).brand_color ?? '#2563eb',
          invoice_footer: (settings as any).invoice_footer ?? 'עוסק פטור',
        }}
        logoUrl={logoUrl}
        signatureUrl={signatureUrl}
      />
    </div>
  );
}
