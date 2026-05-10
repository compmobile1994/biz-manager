import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { storeGoogleTokens } from '@/lib/google-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/settings?gmail_error=no_code', url));

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
    return NextResponse.redirect(new URL('/settings?gmail_connected=1', url));
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/settings?gmail_error=${encodeURIComponent(e.message)}`, url));
  }
}
