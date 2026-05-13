// Drafts API: save/list a draft document (form state preserved as JSONB).
// On issue, the form fetches the draft, pre-fills, then deletes it.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('document_drafts')
    .select('id, label, data, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drafts: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, label, data } = body as { id?: string; label?: string; data: any };
  if (!data) return NextResponse.json({ error: 'missing data' }, { status: 400 });

  // Auto-label from customer name + first item description if not provided
  const autoLabel =
    label ||
    [data?.customer_name, data?.lines?.[0]?.description].filter(Boolean).join(' · ') ||
    'טיוטה';

  if (id) {
    // Update existing
    const { error } = await supabase
      .from('document_drafts')
      .update({ label: autoLabel, data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id });
  }

  const { data: created, error } = await supabase
    .from('document_drafts')
    .insert({ user_id: user.id, label: autoLabel, data })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: created.id });
}
