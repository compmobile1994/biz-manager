import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// POST { ids: string[], copyMode?: 'auto' | 'original' | 'copy' }
//
// Creates a public share link. Returns { code, url } where url is the
// full public URL (e.g. https://biz-manager-ochre.vercel.app/p/abc12345).
// The link is valid for 90 days; resolving it (GET /p/<code>) streams
// a merged PDF of the included documents.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];
  const copyMode: 'auto' | 'original' | 'copy' =
    body?.copyMode === 'original' || body?.copyMode === 'copy' ? body.copyMode : 'auto';
  if (ids.length === 0) return NextResponse.json({ error: 'no ids' }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: 'too many docs' }, { status: 400 });

  // Verify the user actually owns every requested doc (RLS would catch a
  // wrong id during merge, but we'd rather refuse to mint the link).
  const { data: owned } = await supabase
    .from('documents')
    .select('id')
    .in('id', ids)
    .eq('user_id', user.id);
  if (!owned || owned.length !== ids.length) {
    return NextResponse.json({ error: 'some docs not yours' }, { status: 403 });
  }

  // 8-char URL-safe code (collisions vanishingly rare for this scale).
  // Lowercase letters + digits → 36^8 ≈ 2.8 trillion possible codes.
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const { data: exists } = await supabase.from('share_links').select('code').eq('code', candidate).maybeSingle();
    if (!exists) { code = candidate; break; }
  }
  if (!code) return NextResponse.json({ error: 'failed to allocate code' }, { status: 500 });

  const { error: insErr } = await supabase.from('share_links').insert({
    code,
    user_id: user.id,
    doc_ids: ids,
    copy_mode: copyMode,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://biz-manager-ochre.vercel.app';
  return NextResponse.json({ code, url: `${origin}/p/${code}` });
}
