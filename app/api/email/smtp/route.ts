// Send a receipt via SMTP using the user's own Gmail account (App Password).
// This makes the email appear to the recipient as if it was sent personally
// from the business owner's Gmail address — no Resend, no OAuth dance.

import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient as createSsrClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { documentTypeLabel } from '@/lib/utils';
import { buildDocumentEmailHtml } from '@/lib/email/template';

export const runtime = 'nodejs';

export async function POST(request: Request) {
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
    user = { id: null, email: null };
  } else {
    const ssr = await createSsrClient();
    const { data: { user: u } } = await ssr.auth.getUser();
    if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    supabase = ssr;
    user = u;
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    return NextResponse.json(
      { error: 'Gmail SMTP לא מוגדר. הוסף GMAIL_USER ו-GMAIL_APP_PASSWORD ל-.env.local' },
      { status: 500 },
    );
  }

  const { document_id, to } = await request.json();
  if (!document_id || !to) return NextResponse.json({ error: 'missing document_id or to' }, { status: 400 });
  // Validate the recipient address — without this, an attacker (or a buggy
  // client) could exfiltrate the PDF to any arbitrary mailbox.
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim()) || to.length > 254) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 });
  }

  const { data: doc } = await supabase.from('documents').select('*').eq('id', document_id).single();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (isServiceRole) user.id = doc.user_id;

  if (!doc.pdf_url) return NextResponse.json({ error: 'PDF טרם נוצר' }, { status: 400 });
  const { data: pdfBlob, error: dlErr } = await supabase.storage.from('documents').download(doc.pdf_url);
  if (dlErr || !pdfBlob) return NextResponse.json({ error: 'PDF download failed' }, { status: 500 });
  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

  const { data: settings } = await supabase
    .from('business_settings')
    .select('business_name, owner_name, tax_id, phone, email, address, city, brand_color, logo_url')
    .eq('user_id', user.id)
    .single();

  // Logo as signed URL for the email body
  let logoPublicUrl: string | null = null;
  if (settings?.logo_url) {
    const { data: signedLogo } = await supabase.storage
      .from('business')
      .createSignedUrl(settings.logo_url, 60 * 60 * 24);
    logoPublicUrl = signedLogo?.signedUrl ?? null;
  }

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

  const fromName = settings?.business_name ?? settings?.owner_name ?? 'העסק שלי';
  const fromAddress = `"${fromName}" <${gmailUser}>`;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  try {
    await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      attachments: [{ filename, content: pdfBuffer }],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'SMTP send failed' }, { status: 500 });
  }

  await supabase.from('documents').update({ sent_at: new Date().toISOString(), sent_via: 'gmail-smtp' }).eq('id', document_id);

  return NextResponse.json({ ok: true });
}
