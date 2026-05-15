import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { storeGoogleTokens } from '@/lib/google-auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Validates the OAuth `state` against the value we stored in /connect, and
// only then attaches the tokens to the current Supabase session's user. This
// blocks CSRF: an attacker can't trick a victim's browser into binding a
// foreign Gmail account (or vice versa).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateFromUrl = url.searchParams.get('state');
  const stateFromCookie = request.cookies.get('google_oauth_state')?.value;

  if (!code) return NextResponse.redirect(new URL('/settings?gmail_error=no_code', url));
  if (!stateFromUrl || !stateFromCookie || stateFromUrl !== stateFromCookie) {
    return NextResponse.redirect(new URL('/settings?gmail_error=invalid_state', url));
  }

  // Require an authenticated user — same session that started the flow
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', url));

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );

  try {
    const { tokens } = await oauth2.getToken(code);
    await storeGoogleTokens({
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
      scope: tokens.scope ?? undefined,
    });
    const res = NextResponse.redirect(new URL('/settings?gmail_connected=1', url));
    res.cookies.delete('google_oauth_state');
    return res;
  } catch (e: any) {
    const res = NextResponse.redirect(new URL(`/settings?gmail_error=${encodeURIComponent(e.message)}`, url));
    res.cookies.delete('google_oauth_state');
    return res;
  }
}
