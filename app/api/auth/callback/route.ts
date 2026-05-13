import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Record an OAuth login event (best-effort — never blocks the redirect)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const xff = request.headers.get('x-forwarded-for') ?? '';
        const ip = (xff.split(',')[0] || request.headers.get('x-real-ip') || '').trim() || null;
        const userAgent = request.headers.get('user-agent') ?? null;
        const admin = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        await admin.from('login_events').insert({
          user_id: user.id,
          ip,
          user_agent: userAgent,
          provider: 'google',
          success: true,
        });
      }
    } catch {
      // Don't fail the OAuth redirect if logging fails
    }
  }
  return NextResponse.redirect(new URL('/', url));
}
