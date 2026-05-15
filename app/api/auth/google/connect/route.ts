import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Generates a Google OAuth flow with a cryptographically-random `state` token
// stored in an HttpOnly cookie. The callback verifies it before binding the
// returned tokens to the user. Without this, an attacker can lure the user
// into completing OAuth on a URL the attacker initiated, attaching the
// attacker's Gmail tokens to the victim's account (or vice versa).
export async function GET() {
  // Must be authenticated — we're about to attach Gmail to the current account
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Google OAuth לא מוגדר. הגדר GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI ב-.env.local' },
      { status: 500 },
    );
  }

  const state = randomBytes(32).toString('hex');

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    state,
  });

  const res = NextResponse.redirect(url);
  // HttpOnly so JS can't read it; SameSite=Lax so it survives the OAuth redirect; 10 min lifetime
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
  return res;
}
