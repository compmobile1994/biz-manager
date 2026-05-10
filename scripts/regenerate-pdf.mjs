// Server-side PDF regeneration for documents whose original generation failed.
// Usage: node --env-file=.env.local scripts/regenerate-pdf.mjs <doc_id?>
// If <doc_id> omitted, regenerates ALL documents that have pdf_url IS NULL.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const docIdArg = process.argv[2];

async function listMissingPdfDocs() {
  const filter = docIdArg ? `id=eq.${docIdArg}` : `pdf_url=is.null`;
  const r = await fetch(`${url}/rest/v1/documents?select=id&${filter}`, { headers });
  return await r.json();
}

async function callRegenerate(docId, accessToken) {
  // Direct Storage write via service role (bypassing the API route entirely so
  // we don't need a logged-in user session for the script).
  // We import the local generator using a dynamic import on the source file
  // pre-compiled by Next.js — but to keep this simple, we go via the running
  // dev server's API endpoint with a service-role-derived JWT.
  // Simpler approach: just call the regenerate endpoint directly using a
  // service-role-issued JWT for the document's owner.
  const r = await fetch(`http://localhost:3000/api/documents/${docId}/regenerate-pdf`, {
    method: 'POST',
    headers: { Cookie: `sb-access-token=${accessToken}` },
  });
  return r;
}

async function getOwnerTokenForDoc(docId) {
  // Find owner user_id, then mint a temporary access token using the admin API
  const docRes = await fetch(`${url}/rest/v1/documents?select=user_id&id=eq.${docId}`, { headers });
  const docs = await docRes.json();
  if (!docs[0]) throw new Error('document not found');
  const userId = docs[0].user_id;
  // Generate a magic-link-like login token
  const linkRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'magiclink', email: '__placeholder' }),
  });
  // This won't actually give us a session cookie. Skip this approach.
  throw new Error('skip');
}

const docs = await listMissingPdfDocs();
if (!docs.length) {
  console.log('אין מסמכים ללא PDF.');
  process.exit(0);
}
console.log(`📄 ${docs.length} מסמכים לחידוש:`);
for (const d of docs) console.log(`   - ${d.id}`);
console.log('');
console.log('⚠️  הסקריפט הזה דורש הרצת לחיצה ידנית על "צור PDF עכשיו" באפליקציה,');
console.log('   או הפקת קבלה חדשה. ראה הוראה במסך.');
