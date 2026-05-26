import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Bulk import of historical (paper-era) receipts from previous years.
// These are flagged is_historical=true so they:
//   1. bypass the live (user_id, document_type, number) unique constraint
//      — historical numbers can coexist with current live ones.
//   2. don't bump the live document_counters sequence.
//   3. don't get a generated PDF (this would be slow for 100+ rows and the
//      original paper is the source of truth anyway).
//
// Input: { rows: Array<{ number, issue_date, customer_name, description,
//          amount, payment_method? }> }
// Output: { inserted, errors: Array<{ row, error }> }
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ error: 'rows array required' }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ error: 'empty input' }, { status: 400 });
  if (rows.length > 500) return NextResponse.json({ error: 'too many rows (max 500)' }, { status: 400 });

  // Pre-fetch existing customers to resolve by name. New customer rows are
  // inserted on the fly so the import works for net-new customers too.
  const { data: existingCustomers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('user_id', user.id);
  const customerIdByName = new Map<string, string>();
  for (const c of existingCustomers ?? []) {
    customerIdByName.set((c as any).name.trim(), (c as any).id);
  }

  // Type the document_type as 'receipt' — the user is importing past
  // קבלות only (per their workflow). Could extend later if needed.
  const DOC_TYPE = 'receipt';

  const inserted: number[] = [];
  const errors: Array<{ row: number; number: any; error: string }> = [];

  // Process row-by-row (not bulk insert) so partial success is possible
  // and per-row errors are surfaced clearly. 93 rows × ~50ms each is
  // ~5 seconds — acceptable for a one-shot import.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    try {
      const num = Number(r.number);
      if (!Number.isInteger(num) || num <= 0) throw new Error('מספר קבלה לא תקין');
      const dateStr = String(r.issue_date ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('תאריך לא תקין (פורמט: YYYY-MM-DD)');
      const customerName = String(r.customer_name ?? '').trim();
      if (!customerName) throw new Error('שם לקוח חובה');
      const description = String(r.description ?? '').trim() || customerName;
      const amount = Math.round(Number(r.amount));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('סכום לא תקין');
      const paymentMethod = r.payment_method && ['cash', 'credit_card', 'bank_transfer', 'bit', 'check', 'other'].includes(r.payment_method)
        ? r.payment_method : 'cash';

      // Resolve / create customer
      let customerId = customerIdByName.get(customerName) ?? null;
      if (!customerId) {
        const { data: newCust, error: custErr } = await supabase
          .from('customers')
          .insert({ user_id: user.id, name: customerName })
          .select('id')
          .single();
        if (custErr || !newCust) throw new Error(`יצירת לקוח נכשלה: ${custErr?.message ?? 'unknown'}`);
        customerId = newCust.id;
        customerIdByName.set(customerName, customerId as string);
      }

      // Insert the historical document. We do NOT call next_document_number
      // so the live counter stays at its current value.
      const { data: doc, error: docErr } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          document_type: DOC_TYPE,
          number: num,
          customer_id: customerId,
          customer_name_snapshot: customerName,
          issue_date: dateStr,
          subtotal: amount,
          total: amount,
          status: 'issued',
          is_historical: true,
        })
        .select('id, number')
        .single();
      if (docErr) {
        if (docErr.message.toLowerCase().includes('duplicate') || docErr.code === '23505') {
          throw new Error(`קבלה ${num} כבר קיימת כהיסטורית — דלג או שנה מספר`);
        }
        throw new Error(docErr.message);
      }

      // Single-line item with description + amount (qty=1, unit_price=amount).
      const { error: itemErr } = await supabase
        .from('document_items')
        .insert({
          document_id: doc!.id,
          description,
          quantity: 1,
          unit_price: amount,
          line_total: amount,
          sort_order: 0,
        });
      if (itemErr) {
        // Roll back the doc — clean failure for this row, others continue.
        await supabase.from('documents').delete().eq('id', doc!.id);
        throw new Error(`שורת פריט נכשלה: ${itemErr.message}`);
      }

      // Payment row (optional — only if amount > 0 which it always is here)
      await supabase.from('payments').insert({
        document_id: doc!.id,
        method: paymentMethod,
        amount,
      });

      inserted.push(num);
    } catch (e: any) {
      errors.push({ row: rowNum, number: r?.number, error: e?.message ?? 'שגיאה לא ידועה' });
    }
  }

  return NextResponse.json({
    inserted: inserted.length,
    insertedNumbers: inserted,
    errors,
  });
}
