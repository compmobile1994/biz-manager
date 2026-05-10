// סקריפט הקמה חד-פעמי: יוצר 3 buckets ב-Supabase Storage.
// אם אתה רוצה גם להריץ את ה-schema migrations ישירות מכאן - ראה הוראות בתחתית.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ חסרים משתני סביבה NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  console.error('   ודא שהורצת את הסקריפט כך:  node --env-file=.env.local scripts/setup.mjs');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

async function ensureBucket(name) {
  // GET /storage/v1/bucket/{name} — 200 if exists, 404 if not
  const checkRes = await fetch(`${url}/storage/v1/bucket/${name}`, { headers });
  if (checkRes.ok) {
    console.log(`  ✓ ${name} (קיים)`);
    return;
  }
  const createRes = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: name, name, public: false }),
  });
  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`failed to create ${name}: ${txt}`);
  }
  console.log(`  ✓ ${name} (נוצר)`);
}

async function main() {
  console.log('📦 יצירת Storage Buckets ב-Supabase...');
  for (const name of ['documents', 'expenses', 'business']) {
    try {
      await ensureBucket(name);
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log('✅ Storage Buckets מוכנים.');
  console.log('');
  console.log('⚠️  עכשיו תריץ את הסכמה ב-SQL Editor של Supabase:');
  console.log('   1. פתח: https://supabase.com/dashboard/project/auvijhjwrumowycrprwe/sql/new');
  console.log('   2. הדבק את הקובץ supabase/migrations/0001_init.sql, לחץ Run');
  console.log('   3. הדבק את הקובץ supabase/migrations/0002_customer_types.sql, לחץ Run');
  console.log('   4. תריץ:   npm run dev');
}

main();
