import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { generateDocumentPdf } from '@/lib/pdf/html-to-pdf';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Public route: GET /p/<code>
//
// Resolves a share_links row using the service-role client (the recipient
// is unauthenticated by design — they get the code via WhatsApp). Then
// merges the documents on-the-fly and streams the resulting PDF back as
// an inline-displayable attachment.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!code || !/^[a-z0-9]{4,12}$/.test(code)) {
    return new NextResponse('Invalid link', { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: link } = await admin
    .from('share_links')
    .select('user_id, doc_ids, copy_mode, expires_at')
    .eq('code', code)
    .maybeSingle();
  if (!link) return new NextResponse('הקישור לא נמצא', { status: 404 });
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return new NextResponse('הקישור פג תוקף', { status: 410 });
  }

  const { data: docs } = await admin
    .from('documents')
    .select('id, pdf_url, document_type, number, sent_at, issue_date')
    .in('id', link.doc_ids)
    .eq('user_id', link.user_id);
  if (!docs || docs.length === 0) return new NextResponse('המסמכים לא נמצאו', { status: 404 });

  // Chronological order
  const ordered = [...docs].sort((a: any, b: any) => {
    if (a.issue_date < b.issue_date) return -1;
    if (a.issue_date > b.issue_date) return 1;
    return a.number - b.number;
  });

  const merged = await PDFDocument.create();

  for (const doc of ordered as any[]) {
    const wantsCopy =
      link.copy_mode === 'copy' ? true :
      link.copy_mode === 'original' ? false :
      !!doc.sent_at;

    let pdfBytes: Uint8Array | null = null;
    if (!wantsCopy && doc.pdf_url) {
      const { data: signed } = await admin.storage.from('documents').createSignedUrl(doc.pdf_url, 60 * 10);
      if (signed?.signedUrl) {
        const r = await fetch(signed.signedUrl);
        if (r.ok) pdfBytes = new Uint8Array(await r.arrayBuffer());
      }
    }
    if (!pdfBytes) {
      const [{ data: items }, { data: payments }, { data: settings }] = await Promise.all([
        admin.from('document_items').select('*').eq('document_id', doc.id).order('sort_order'),
        admin.from('payments').select('*').eq('document_id', doc.id),
        admin.from('business_settings').select('*').eq('user_id', link.user_id).maybeSingle(),
      ]);
      const settingsForPdf: any = { ...(settings ?? {}) };
      if (settingsForPdf?.logo_url) {
        const { data: s } = await admin.storage.from('business').createSignedUrl(settingsForPdf.logo_url, 60 * 60);
        settingsForPdf.logo_url = s?.signedUrl ?? null;
      }
      if (settingsForPdf?.signature_url) {
        const { data: s } = await admin.storage.from('business').createSignedUrl(settingsForPdf.signature_url, 60 * 60);
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
          item_number: it.item_number ?? null,
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
  const filename = ordered.length === 1
    ? `Kabala-${(ordered[0] as any).number}.pdf`
    : `Kabalot-${ordered.length}.pdf`;

  return new NextResponse(Buffer.from(out), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(out.byteLength),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'public, max-age=300', // 5 min CDN cache
    },
  });
}
