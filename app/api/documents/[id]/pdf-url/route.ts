import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Returns just the signed storage URL for a document's PDF — no blob
// streaming. Used by the WhatsApp link-share flow (single + bulk) which
// only needs URLs to put in the wa.me message body. Much faster than
// /pdf (which downloads the whole PDF) when the caller only needs the
// link.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: doc } = await supabase
    .from('documents')
    .select('id, pdf_url')
    .eq('id', id)
    .maybeSingle();
  if (!doc?.pdf_url) return NextResponse.json({ error: 'no pdf' }, { status: 404 });

  const { data: signed } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.pdf_url, 60 * 60 * 24); // 24h — long enough for the customer to download
  if (!signed?.signedUrl) return NextResponse.json({ error: 'sign failed' }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl });
}
