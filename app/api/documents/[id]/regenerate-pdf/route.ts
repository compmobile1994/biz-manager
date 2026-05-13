import { NextResponse } from 'next/server';
import { createClient as createSsrClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { generateDocumentPdf } from '@/lib/pdf/html-to-pdf';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Two auth modes:
  //   1. Normal user session (cookie-based) — interactive button click
  //   2. Service-role bearer token in Authorization header — for CLI / script
  //      one-shot recovery of failed PDFs (bypasses RLS / user login).
  const authHeader = req.headers.get('authorization') ?? '';
  const isServiceRole =
    authHeader.startsWith('Bearer ') &&
    authHeader.slice(7) === process.env.SUPABASE_SERVICE_ROLE_KEY;

  let supabase: any;
  let userId: string;

  if (isServiceRole) {
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: ownerRow } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    if (!ownerRow) return NextResponse.json({ error: 'not found' }, { status: 404 });
    userId = ownerRow.user_id;
  } else {
    const ssr = await createSsrClient();
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    supabase = ssr;
    userId = user.id;
  }

  const [{ data: doc }, { data: items }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).maybeSingle(),
    supabase.from('document_items').select('*').eq('document_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('document_id', id),
    supabase.from('business_settings').select('*').eq('user_id', userId).maybeSingle(),
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
          }
        : null,
      settings: settingsForPdf,
    });

    const path = `${userId}/${doc.id}.pdf`;
    const { error: upErr } = await supabase.storage.from('documents').upload(path, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (upErr) throw upErr;
    await supabase.from('documents').update({ pdf_url: path }).eq('id', doc.id);

    return NextResponse.json({ ok: true, pdf_url: path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'PDF generation failed' }, { status: 500 });
  }
}
