import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { buildYearPackage } from '@/lib/export/year-package';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Resend לא מוגדר. הגדר RESEND_API_KEY ב-.env.local' }, { status: 500 });

  const { year, to } = await request.json();
  if (!year || !to) return NextResponse.json({ error: 'missing' }, { status: 400 });

  const { data: settings } = await supabase.from('business_settings').select('business_name, accountant_name').eq('user_id', user.id).maybeSingle();

  const { zip, filename } = await buildYearPackage(Number(year));

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to,
    subject: `דוח שנתי ${year} - ${settings?.business_name ?? ''}`,
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
        <p>שלום${settings?.accountant_name ? ' ' + settings.accountant_name : ''},</p>
        <p>מצורף הדוח השנתי של ${year} עבור <strong>${settings?.business_name ?? 'העסק'}</strong>.</p>
        <p>הקובץ כולל:</p>
        <ul>
          <li>גליון אקסל עם הכנסות, הוצאות וסיכום שנתי</li>
          <li>תיקייה עם כל הקבלות שהוצאתי</li>
          <li>תיקייה עם צילומי קבלות הוצאות</li>
        </ul>
        <p>תודה רבה,</p>
      </div>
    `,
    attachments: [{ filename, content: zip }],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
