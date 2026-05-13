// One-shot debug script: fetch document by number + all its child rows.
// Run: node --env-file=.env.local scripts/check-doc.mjs 154
import { createClient } from '@supabase/supabase-js';

const number = Number(process.argv[2] ?? 154);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: docs } = await supabase
  .from('documents')
  .select('*')
  .eq('number', number)
  .order('created_at', { ascending: false });

if (!docs?.length) {
  console.log(`No document with number ${number}`);
  process.exit(0);
}

for (const doc of docs) {
  console.log('==================================================');
  console.log(`Document #${doc.number} (${doc.document_type})  status=${doc.status}`);
  console.log(`  id           = ${doc.id}`);
  console.log(`  created_at   = ${doc.created_at}`);
  console.log(`  issue_date   = ${doc.issue_date}`);
  console.log(`  customer     = ${doc.customer_name_snapshot}`);
  console.log(`  total        = ${doc.total}`);
  console.log(`  pdf_url      = ${doc.pdf_url ?? '(none)'}`);
  console.log(`  notes        = ${doc.notes ?? '(none)'}`);

  const { data: items } = await supabase
    .from('document_items')
    .select('*')
    .eq('document_id', doc.id)
    .order('sort_order');
  console.log(`  --- LINES (${items?.length ?? 0}) ---`);
  for (const it of items ?? []) {
    console.log(`    • ${it.description}  qty=${it.quantity}  price=${it.unit_price}  total=${it.line_total}`);
    if (it.phone_number)     console.log(`        📱 phone: ${it.phone_number}`);
    if (it.imei)             console.log(`        IMEI:    ${it.imei}`);
    if (it.warranty_months)  console.log(`        🛡️ warranty: ${it.warranty_months} months`);
    if (it.warranty_provider)console.log(`        🛡️ provider: ${it.warranty_provider}`);
    if (it.importer_type)    console.log(`        📦 importer: ${it.importer_type}`);
  }

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('document_id', doc.id);
  console.log(`  --- PAYMENTS (${payments?.length ?? 0}) ---`);
  for (const p of payments ?? []) {
    console.log(`    method=${p.method}  amount=${p.amount}`);
    if (p.card_last4)      console.log(`        card_last4: ${p.card_last4}`);
    if (p.auth_code)       console.log(`        auth_code:  ${p.auth_code}`);
    if (p.check_number)    console.log(`        check_no:   ${p.check_number}`);
    if (p.check_bank)      console.log(`        check_bank: ${p.check_bank}`);
    if (p.check_branch)    console.log(`        check_branch: ${p.check_branch}`);
    if (p.check_account)   console.log(`        check_account: ${p.check_account}`);
    if (p.check_due_date)  console.log(`        check_due_date: ${p.check_due_date}`);
    if (p.transfer_ref)    console.log(`        transfer_ref: ${p.transfer_ref}`);
  }
  console.log();
}
