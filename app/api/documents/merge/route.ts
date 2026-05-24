import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';
import { generateDocumentPdf } from '@/lib/pdf/html-to-pdf';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST { ids: string[], copyMode?: 'auto' | 'original' | 'copy' }
//
// Builds a single combined PDF that concatenates all the receipts whose ids
// were passed. Returns the merged bytes inline. Used by:
//   1. The customer-page bulk send (so WhatsApp receives ONE attachment,
//      not N — mobile WhatsApp doesn't accept multiple PDFs reliably).
//   2. The customer annual / monthly report button (same code path —
//      pass all the docs in the date range).
//
// copyMode:
//   'auto'     (default) — for each doc, if it's already been sent we use
//                          the inline "נאמן למקור" version; otherwise the
//                          canonical "מקור" from storage.
//   'original' — always use the stored "מקור".
//   'copy'     — always generate "נאמן למקור" inline.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];
  const copyMode: 'auto' | 'original' | 'copy' = body?.copyMode === 'original' || body?.copyMode === 'copy' ? body.copyMode : 'auto';
  if (ids.length === 0) return NextResponse.json({ error: 'no ids' }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: 'too many docs' }, { status: 400 });

  // Pull all docs owned by this user (RLS enforces it too — this is just a
  // friendlier check to fail fast if the caller passed an unowned ID).
  const { data: docs } = await supabase
    .from('documents')
    .select('id, pdf_url, document_type, number, sent_at, issue_date')
    .in('id', ids)
    .eq('user_id', user.id);
  if (!docs || docs.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Order by issue_date asc so the merged PDF reads chronologically.
  const byId = new Map(docs.map((d: any) => [d.id, d]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean).sort((a: any, b: any) => {
    if (a.issue_date < b.issue_date) return -1;
    if (a.issue_date > b.issue_date) return 1;
    return a.number - b.number;
  });

  const merged = await PDFDocument.create();

  for (const doc of ordered as any[]) {
    const wantsCopy =
      copyMode === 'copy' ? true :
      copyMode === 'original' ? false :
      !!doc.sent_at; // auto: already-sent → copy; never-sent → original

    let pdfBytes: Uint8Array | null = null;
    if (!wantsCopy && doc.pdf_url) {
      const { data: signed } = await supabase.storage.from('documents').createSignedUrl(doc.pdf_url, 60 * 10);
      if (signed?.signedUrl) {
        const res = await fetch(signed.signedUrl);
        if (res.ok) pdfBytes = new Uint8Array(await res.arrayBuffer());
      }
    }

    if (!pdfBytes) {
      // Either copyMode demanded a fresh certified copy, OR the original
      // download failed. Generate inline as "copy" using the current data.
      const [{ data: items }, { data: payments }, { data: settings }] = await Promise.all([
        supabase.from('document_items').select('*').eq('document_id', doc.id).order('sort_order'),
        supabase.from('payments').select('*').eq('document_id', doc.id),
        supabase.from('business_settings').select('*').eq('user_id', user.id).maybeSingle(),
      ]);
      const settingsForPdf: any = { ...(settings ?? {}) };
      if (settingsForPdf?.logo_url) {
        const { data: s } = await supabase.storage.from('business').createSignedUrl(settingsForPdf.logo_url, 60 * 60);
        settingsForPdf.logo_url = s?.signedUrl ?? null;
      }
      if (settingsForPdf?.signature_url) {
        const { data: s } = await supabase.storage.from('business').createSignedUrl(settingsForPdf.signature_url, 60 * 60);
        settingsForPdf.signature_url = s?.signedUrl ?? null;
      }
      pdfBytes = await generateDocumentPdf({
        doc,
        copy: wantsCopy ? 'copy' : 'original',
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
        payment: payments && payments.length > 0 ? {
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
        } : null,
        settings: settingsForPdf,
      });
    }

    const srcDoc = await PDFDocument.load(pdfBytes);
    const pages = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  const out = await merged.save();
  return new NextResponse(Buffer.from(out), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(out.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
