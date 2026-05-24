import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateDocumentPdf } from '@/lib/pdf/html-to-pdf';

export const runtime = 'nodejs';

// Returns a freshly-generated "נאמן למקור" copy of the document's PDF.
//
// Unlike /api/documents/[id]/pdf (which serves the canonical "מקור" from
// storage) and /api/documents/[id]/regenerate-pdf (which rewrites the
// "מקור" in storage after data changes), THIS endpoint never touches
// storage — it builds a one-shot certified-copy version in memory and
// returns the bytes. Used by the WhatsApp / SMS / email share flows so
// the customer always receives a clearly-marked נאמן למקור while the
// original stays intact for the business owner.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [{ data: doc }, { data: items }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).maybeSingle(),
    supabase.from('document_items').select('*').eq('document_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('document_id', id),
    supabase.from('business_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const settingsForPdf: any = { ...(settings ?? {}) };
  if (settingsForPdf?.logo_url) {
    const { data: signed } = await supabase.storage.from('business').createSignedUrl(settingsForPdf.logo_url, 60 * 60);
    settingsForPdf.logo_url = signed?.signedUrl ?? null;
  }
  if (settingsForPdf?.signature_url) {
    const { data: signed } = await supabase.storage.from('business').createSignedUrl(settingsForPdf.signature_url, 60 * 60);
    settingsForPdf.signature_url = signed?.signedUrl ?? null;
  }

  try {
    const pdfBytes = await generateDocumentPdf({
      doc,
      copy: 'copy', // ← the whole point of this endpoint
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
      payment: payments && payments.length > 0
        ? {
            method: payments[0].method,
            amount: Number(payments[0].amount),
            card_last4: payments[0].card_last4,
            auth_code: payments[0].auth_code,
            check_number: payments[0].check_number,
            check_bank: payments[0].check_bank,
            check_branch: payments[0].check_branch,
            check_account: payments[0].check_account,
            check_due_date: payments[0].check_due_date,
            transfer_ref: payments[0].transfer_ref,
            other_description: payments[0].other_description,
          }
        : null,
      settings: settingsForPdf,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBytes.byteLength),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'PDF generation failed' }, { status: 500 });
  }
}
