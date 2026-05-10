import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { documentTypeLabel } from '@/lib/utils';
import { getStoredGoogleTokens } from '@/lib/google-auth';
import { buildDocumentEmailHtml } from '@/lib/email/template';

export const runtime = 'nodejs';

function buildRfc822Mime(opts: {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  filename: string;
  pdfBuffer: Buffer;
}) {
  const boundary = `bnd_${Date.now()}`;
  const subject = `=?UTF-8?B?${Buffer.from(opts.subject, 'utf8').toString('base64')}?=`;
  const html = Buffer.from(opts.htmlBody, 'utf8').toString('base64');
  const pdfB64 = opts.pdfBuffer.toString('base64');

  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    html,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${opts.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${opts.filename}"`,
    '',
    pdfB64,
    '',
    `--${boundary}--`,
  ];
  return lines.join('\r\n');
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const tokens = await getStoredGoogleTokens(user.id);
  if (!tokens) {
    return NextResponse.json(
      { error: 'Gmail לא מחובר. גש ל-/settings וחבר את חשבון Google שלך.' },
      { status: 400 },
    );
  }

  const { document_id, to } = await request.json();
  if (!document_id || !to) return NextResponse.json({ error: 'missing' }, { status: 400 });

  const { data: doc } = await supabase.from('documents').select('*').eq('id', document_id).single();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (!doc.pdf_url) return NextResponse.json({ error: 'PDF טרם נוצר' }, { status: 400 });
  const { data: pdfBlob } = await supabase.storage.from('documents').download(doc.pdf_url);
  if (!pdfBlob) return NextResponse.json({ error: 'PDF download failed' }, { status: 500 });
  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

  const { data: settings } = await supabase
    .from('business_settings')
    .select('business_name, owner_name, tax_id, phone, email, address, city, brand_color, logo_url')
    .eq('user_id', user.id)
    .single();

  // Generate a 24h signed URL for the logo (if configured) so it renders in the email client.
  let logoPublicUrl: string | null = null;
  if (settings?.logo_url) {
    const { data: signedLogo } = await supabase.storage
      .from('business')
      .createSignedUrl(settings.logo_url, 60 * 60 * 24);
    logoPublicUrl = signedLogo?.signedUrl ?? null;
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const subject = `${documentTypeLabel[doc.document_type]} #${doc.number} - ${settings?.business_name ?? ''}`;
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
  const raw = buildRfc822Mime({
    from: settings?.email ?? user.email ?? 'me',
    to,
    subject,
    htmlBody: html,
    filename: `${documentTypeLabel[doc.document_type]}_${doc.number}.pdf`,
    pdfBuffer,
  });
  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  try {
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Gmail send failed' }, { status: 500 });
  }

  await supabase.from('documents').update({ sent_at: new Date().toISOString(), sent_via: 'gmail' }).eq('id', document_id);

  return NextResponse.json({ ok: true });
}
