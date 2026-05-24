import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Returns the raw PDF bytes of a document the caller owns.
//
// Why a server route instead of letting the client fetch the Supabase
// signed URL directly? Two reasons:
//   1. We want browser code to call `await fetch('/api/documents/X/pdf')`
//      without dealing with signed-URL generation or expiry on the client.
//   2. RLS already restricts the caller to their own docs; the route reuses
//      the user's session so no extra check is needed.
//
// Headers include `x-pdf-url` with the signed storage URL so callers can
// fall back to opening the URL directly if the Web Share API isn't
// available.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: doc } = await supabase
    .from('documents')
    .select('id, pdf_url, document_type, number')
    .eq('id', id)
    .maybeSingle();
  if (!doc?.pdf_url) return NextResponse.json({ error: 'no pdf' }, { status: 404 });

  const { data: signed } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.pdf_url, 60 * 10);
  if (!signed?.signedUrl) return NextResponse.json({ error: 'sign failed' }, { status: 500 });

  // Fetch the PDF on the server and stream it back so the browser doesn't
  // need to know about Supabase storage at all.
  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok) return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
  const buf = await upstream.arrayBuffer();

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buf.byteLength),
      'x-pdf-url': signed.signedUrl,
      'Cache-Control': 'private, no-store',
    },
  });
}
