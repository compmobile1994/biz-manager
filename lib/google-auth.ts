// אחסון מאובטח של טוקני Google ב-Supabase (כטבלה נפרדת או ב-user metadata).
// לפשטות - אנחנו מאחסנים ב-auth.users.user_metadata.

import { createClient } from '@/lib/supabase/server';

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
}

export async function getStoredGoogleTokens(userId: string): Promise<GoogleTokens | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return null;
  const tokens = (user.user_metadata as any)?.google_tokens as GoogleTokens | undefined;
  return tokens ?? null;
}

export async function storeGoogleTokens(tokens: GoogleTokens) {
  const supabase = await createClient();
  await supabase.auth.updateUser({ data: { google_tokens: tokens } });
}
