import { NextResponse } from 'next/server';
import { createClient as createSsrClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Records a successful login event for the currently-authenticated user.
// Called from the client right after signInWithPassword / OAuth callback.
export async function POST(req: Request) {
  const ssr = await createSsrClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const provider: string = body?.provider ?? 'password';

  // Best-effort IP extraction (Vercel sets x-forwarded-for; fall back to x-real-ip)
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ip = (xff.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;
  const userAgent = req.headers.get('user-agent') ?? null;

  // Use service role to bypass any policy gotchas on insert
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await admin.from('login_events').insert({
    user_id: user.id,
    ip,
    user_agent: userAgent,
    provider,
    success: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
