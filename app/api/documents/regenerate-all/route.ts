import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateDocumentPdf } from '@/lib/pdf/html-to-pdf';

export const runtime = 'nodejs';
export const maxDuration = 300; // up to 5 minutes for Vercel Pro; 60s on hobby

// Regenerate the PDF for every document owned by the calling user.
// Useful after the receipt template changes (e.g. בס"ד added) so existing
// PDFs match the new layout without clicking each one manually.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 1) Resolve business settings once (logo/signature URLs are reusable across docs)
  const { data: settings } = await supabase
    .from('business_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const settingsForPdf: any = { ...(settings ?? {}) };
  if (settingsForPdf?.logo_url) {
    const { data: signed } = await supabase.storage
      .from('business')
      .createSignedUrl(settingsForPdf.logo_url, 60 * 60);
    settingsForPdf.logo_url = signed?.signedUrl ?? null;
  }
  if (settingsForPdf?.signature_url) {
    const { data: signed } = await supabase.storage
      .from('business')
      .createSignedUrl(settingsForPdf.signature_url, 60 * 60);
    settingsForPdf.signature_url = signed?.signedUrl ?? null;
  }

  // 2) List all docs (RLS already filters to this user)
  const { data: docs } = await supabase
    .from('documents')
    .select('id')
    .order('issue_date', { ascending: false });

  const docIds: string[] = (docs ?? []).map((d: any) => d.id);

  let ok = 0;
  const failures: { id: string; error: string }[] = [];

  for (const id of docIds) {
    try {
      const [{ data: doc }, { data: items }, { data: payments }] = await Promise.all([
        supabase.from('documents').select('*').eq('id', id).maybeSingle(),
        supabase.from('document_items').select('*').eq('document_id', id).order('sort_order'),
        supabase.from('payments').select('*').eq('document_id', id),
      ]);
      if (!doc) {
        failures.push({ id, error: 'not found' });
        continue;
      }

      const pdfBytes = await generateDocumentPdf({
        doc,
        lines: (items ?? []).map((it: any) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          line_total: Number(it.line_total),
          phone_number: it.phone_number ?? null,
          imei: it.imei ?? null,
          warranty_months: it.warranty_months ?? null,
          warranty_provider: it.warranty_provider ?? null,
          importer_type: it.importer_type ?? null,
        })),
        payment:
          payments && payments.length > 0
            ? {
                method: payments[0].method,
                amount: Number(payments[0].amount),
                card_last4: payments[0].card_last4,
                auth_code: payments[0].auth_code,
                check_number: payments[0].check_number,
                transfer_ref: payments[0].transfer_ref,
              }
            : null,
        settings: settingsForPdf,
      });

      const path = `${user.id}/${doc.id}.pdf`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (upErr) throw upErr;
      await supabase.from('documents').update({ pdf_url: path }).eq('id', doc.id);
      ok++;
    } catch (e: any) {
      failures.push({ id, error: e?.message ?? 'unknown' });
    }
  }

  return NextResponse.json({
    total: docIds.length,
    regenerated: ok,
    failed: failures.length,
    failures,
  });
}
