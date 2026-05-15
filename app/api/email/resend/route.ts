import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient as createSsrClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { documentTypeLabel } from '@/lib/utils';
import { buildDocumentEmailHtml } from '@/lib/email/template';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Two auth modes: user session (cookies) or service-role bearer token
  // (for CLI / debug calls).
  const authHeader = request.headers.get('authorization') ?? '';
  const isServiceRole =
    authHeader.startsWith('Bearer ') &&
    authHeader.slice(7) === process.env.SUPABASE_SERVICE_ROLE_KEY;

  let supabase: any;
  let user: any;
  if (isServiceRole) {
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    user = { id: null, email: null }; // resolved per-document below
  } else {
    const ssr = await createSsrClient();
    const { data: { user: u } } = await ssr.auth.getUser();
    if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    supabase = ssr;
    user = u;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Resend לא מוגדר. הוסף RESEND_API_KEY ל-.env.local או השתמש ב-Gmail.' },
      { status: 500 },
    );
  }

  const { document_id, to } = await request.json();
  if (!document_id || !to) return NextResponse.json({ error: 'missing' }, { status: 400 });
  // Validate recipient email format + length (prevents arbitrary exfiltration)
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim()) || to.length > 254) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 });
  }

  const { data: doc } = await supabase.from('documents').select('*').eq('id', document_id).single();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // For service-role calls we resolve the owner from the document
  if (isServiceRole) user.id = doc.user_id;

  const { data: settings } = await supabase
    .from('business_settings')
    .select('business_name, owner_name, tax_id, phone, email, address, city, brand_color, logo_url')
    .eq('user_id', user.id)
    .single();

  // Download PDF
  if (!doc.pdf_url) return NextResponse.json({ error: 'PDF טרם נוצר' }, { status: 400 });
  const { data: pdfBlob, error: dlErr } = await supabase.storage.from('documents').download(doc.pdf_url);
  if (dlErr || !pdfBlob) return NextResponse.json({ error: 'PDF download failed' }, { status: 500 });
  const buf = Buffer.from(await pdfBlob.arrayBuffer());

  // Generate a 24h signed URL for the logo (if configured) so it renders in the email client.
  let logoPublicUrl: string | null = null;
  if (settings?.logo_url) {
    const { data: signedLogo } = await supabase.storage
      .from('business')
      .createSignedUrl(settings.logo_url, 60 * 60 * 24);
    logoPublicUrl = signedLogo?.signedUrl ?? null;
  }

  const resend = new Resend(apiKey);
  const subject = `${documentTypeLabel[doc.document_type]} #${doc.number} - ${settings?.business_name ?? ''}`;
  const filename = `${documentTypeLabel[doc.document_type]}_${doc.number}.pdf`;

  const html = buildDocumentEmailHtml({
    doc: {
      document_type: doc.document_type,
      number: doc.number,
      issue_date: doc.issue_date,
      total: doc.total,
      customer_name_snapshot: doc.customer_name_snapshot,
    },
    settings: {
      business_name: settings?.business_name ?? null,
      owner_name: settings?.owner_name ?? null,
      tax_id: settings?.tax_id ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      address: settings?.address ?? null,
      city: settings?.city ?? null,
      brand_color: settings?.brand_color ?? null,
      logo_public_url: logoPublicUrl,
    },
  });

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to,
    subject,
    html,
    attachments: [{ filename, content: buf }],
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('documents').update({ sent_at: new Date().toISOString(), sent_via: 'resend' }).eq('id', document_id);

  return NextResponse.json({ ok: true });
}
