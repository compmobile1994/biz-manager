import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { newDocumentSchema } from '@/lib/validation';
import { generateDocumentPdf } from '@/lib/pdf/html-to-pdf';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = newDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid' }, { status: 400 });
  }
  const data = parsed.data;

  // 1) הקצאת מספר רץ אטומי
  const { data: numberRpc, error: numErr } = await supabase.rpc('next_document_number', {
    p_type: data.document_type,
  });
  if (numErr) return NextResponse.json({ error: numErr.message }, { status: 500 });

  const number = Number(numberRpc);
  const subtotal = data.lines.reduce((s, l) => s + l.line_total, 0);
  const total = subtotal;

  // 2) יצירת המסמך
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      document_type: data.document_type,
      number,
      customer_id: data.customer_id ?? null,
      customer_name_snapshot: data.customer_name_snapshot,
      customer_tax_id_snapshot: data.customer_tax_id_snapshot ?? null,
      customer_address_snapshot: data.customer_address_snapshot ?? null,
      issue_date: data.issue_date,
      subtotal,
      total,
      notes: data.notes ?? null,
      status: 'issued',
    } as any)
    .select()
    .single();
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  // Helper: roll back the orphaned `documents` row on any later failure so we
  // don't leave half-written receipts that look "issued" but have no items
  // or payment behind them. Also decrement the running-number counter so we
  // don't burn a number on a failed attempt (Israeli עוסק פטור law forbids
  // gaps in the receipt sequence). Uses the service-role client to bypass
  // RLS — user sessions can no longer DELETE documents directly (0011).
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const userId = user.id; // capture so the closure has a non-null type
  async function rollback() {
    await admin.from('documents').delete().eq('id', doc.id);
    // Optimistically roll the counter back only if it still matches the number
    // we burned. If another receipt was already issued after us, leave it
    // alone (the new number is the authoritative latest).
    await admin
      .from('document_counters')
      .update({ last_number: number - 1 })
      .eq('user_id', userId)
      .eq('document_type', data.document_type)
      .eq('last_number', number);
  }

  // 3) שורות
  const { error: linesErr } = await supabase.from('document_items').insert(
    data.lines.map((l) => ({
      document_id: doc.id,
      saved_item_id: l.saved_item_id ?? null,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
      sort_order: l.sort_order,
      phone_number: l.phone_number ?? null,
      imei: l.imei ?? null,
      item_number: l.item_number ?? null,
      warranty_months: l.warranty_months ?? null,
      warranty_provider: l.warranty_provider ?? null,
      importer_type: l.importer_type ?? null,
    })),
  );
  if (linesErr) {
    await rollback();
    return NextResponse.json({ error: linesErr.message }, { status: 500 });
  }

  // 4) תשלום (אם רלוונטי)
  if (data.payment) {
    const { error: payErr } = await supabase.from('payments').insert({
      document_id: doc.id,
      method: data.payment.method,
      amount: data.payment.amount,
      card_last4: data.payment.card_last4 ?? null,
      card_holder: data.payment.card_holder ?? null,
      auth_code: data.payment.auth_code ?? null,
      check_number: data.payment.check_number ?? null,
      check_bank: data.payment.check_bank ?? null,
      check_branch: data.payment.check_branch ?? null,
      check_account: data.payment.check_account ?? null,
      check_due_date: data.payment.check_due_date ?? null,
      transfer_ref: data.payment.transfer_ref ?? null,
      other_description: data.payment.other_description ?? null,
    });
    if (payErr) {
      await rollback();
      return NextResponse.json({ error: payErr.message }, { status: 500 });
    }
  }

  // 5) יצירת PDF + העלאה ל-storage
  try {
    const { data: settings } = await supabase
      .from('business_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Resolve logo/signature paths to signed URLs so the PDF generator can fetch them.
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

    const pdfBytes = await generateDocumentPdf({
      doc,
      lines: data.lines,
      payment: data.payment ?? null,
      settings: settingsForPdf,
    });

    const path = `${user.id}/${doc.id}.pdf`;
    // CRITICAL: only set pdf_url if the upload actually succeeded. Earlier code
    // ignored upload errors, leaving the DB pointing at a missing file → 404
    // when the customer tries to download. The user can always click "צור PDF
    // עכשיו" on the detail page to regenerate.
    const { error: upErr } = await supabase.storage.from('documents').upload(path, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (upErr) throw upErr;
    await supabase.from('documents').update({ pdf_url: path }).eq('id', doc.id);
  } catch (e: any) {
    // לא נכשל את ההזמנה - אפשר להפיק PDF מאוחר יותר
    console.error('PDF generation failed', e);
  }

  // Invalidate any cached server-rendered pages that depend on the document
  // counter / list — so the next visit to "מסמך חדש" or "מסמכים" shows the
  // new running number / new row immediately, without waiting for a stale
  // route cache to expire.
  revalidatePath('/documents');
  revalidatePath('/documents/new');
  revalidatePath('/');

  return NextResponse.json({ id: doc.id, number });
}
