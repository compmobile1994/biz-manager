import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { documentTypeLabel, paymentMethodLabel } from '@/lib/utils';

export async function buildYearPackage(year: number): Promise<{ zip: Buffer; filename: string }> {
  const supabase = await createClient();
  const service = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthorized');

  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;

  const [{ data: docs }, { data: items }, { data: payments }, { data: expenses }, { data: cats }, { data: settings }] = await Promise.all([
    supabase.from('documents').select('*').gte('issue_date', startDate).lt('issue_date', endDate).order('issue_date'),
    supabase.from('document_items').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('expenses').select('*').gte('expense_date', startDate).lt('expense_date', endDate).order('expense_date'),
    supabase.from('expense_categories').select('*'),
    supabase.from('business_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  const itemsByDoc = new Map<string, any[]>();
  for (const it of items ?? []) {
    if (!itemsByDoc.has(it.document_id)) itemsByDoc.set(it.document_id, []);
    itemsByDoc.get(it.document_id)!.push(it);
  }
  const paymentsByDoc = new Map<string, any[]>();
  for (const p of payments ?? []) {
    if (!paymentsByDoc.has(p.document_id)) paymentsByDoc.set(p.document_id, []);
    paymentsByDoc.get(p.document_id)!.push(p);
  }
  const catById = new Map((cats ?? []).map((c) => [c.id, c.name]));

  // ----- אקסל: הכנסות -----
  const wb = new ExcelJS.Workbook();
  wb.creator = settings?.business_name ?? 'ניהול עסק';
  wb.created = new Date();
  wb.views = [{ rightToLeft: true } as any];

  const incomeSheet = wb.addWorksheet('הכנסות', { views: [{ rightToLeft: true }] });
  incomeSheet.columns = [
    { header: 'תאריך', key: 'date', width: 12 },
    { header: 'סוג מסמך', key: 'type', width: 18 },
    { header: 'מספר', key: 'number', width: 10 },
    { header: 'לקוח', key: 'customer', width: 28 },
    { header: 'ת״ז/ח.פ.', key: 'tax', width: 14 },
    { header: 'פריטים', key: 'items', width: 50 },
    { header: 'אופן תשלום', key: 'payment', width: 16 },
    { header: 'סטטוס', key: 'status', width: 10 },
    { header: 'סכום (₪)', key: 'total', width: 14 },
  ];
  let totalIncome = 0;
  for (const d of docs ?? []) {
    const lines = itemsByDoc.get(d.id) ?? [];
    const pays = paymentsByDoc.get(d.id) ?? [];
    if (d.status !== 'cancelled') totalIncome += Number(d.total);
    incomeSheet.addRow({
      date: d.issue_date,
      type: documentTypeLabel[d.document_type] ?? d.document_type,
      number: d.number,
      customer: d.customer_name_snapshot,
      tax: d.customer_tax_id_snapshot ?? '',
      items: lines.map((l) => `${l.description} (${l.quantity}×${l.unit_price})`).join(' | '),
      payment: pays.map((p) => paymentMethodLabel[p.method] ?? p.method).join(', '),
      status: d.status === 'cancelled' ? 'בוטל' : 'פעיל',
      total: Number(d.total),
    });
  }
  incomeSheet.getRow(1).font = { bold: true };
  incomeSheet.addRow({}); // empty row
  const incomeTotalRow = incomeSheet.addRow({ items: 'סה״כ הכנסות (לא כולל מבוטלים)', total: totalIncome });
  incomeTotalRow.font = { bold: true };

  // ----- אקסל: הוצאות -----
  const expSheet = wb.addWorksheet('הוצאות', { views: [{ rightToLeft: true }] });
  expSheet.columns = [
    { header: 'תאריך', key: 'date', width: 12 },
    { header: 'ספק', key: 'vendor', width: 28 },
    { header: 'קטגוריה', key: 'category', width: 20 },
    { header: 'תיאור', key: 'description', width: 40 },
    { header: 'אופן תשלום', key: 'payment', width: 16 },
    { header: 'אסמכתה', key: 'reference', width: 16 },
    { header: 'יש קבלה', key: 'has_receipt', width: 10 },
    { header: 'סכום (₪)', key: 'amount', width: 14 },
  ];
  let totalExpenses = 0;
  for (const e of expenses ?? []) {
    totalExpenses += Number(e.amount);
    expSheet.addRow({
      date: e.expense_date,
      vendor: e.vendor,
      category: e.category_id ? catById.get(e.category_id) ?? '' : '',
      description: e.description ?? '',
      payment: e.payment_method ? paymentMethodLabel[e.payment_method] : '',
      reference: e.reference ?? '',
      has_receipt: e.receipt_url ? 'כן' : 'לא',
      amount: Number(e.amount),
    });
  }
  expSheet.getRow(1).font = { bold: true };
  expSheet.addRow({});
  const expTotalRow = expSheet.addRow({ description: 'סה״כ הוצאות', amount: totalExpenses });
  expTotalRow.font = { bold: true };

  // ----- אקסל: סיכום שנתי -----
  const summary = wb.addWorksheet('סיכום שנתי', { views: [{ rightToLeft: true }] });
  summary.columns = [
    { header: 'חודש', key: 'month', width: 14 },
    { header: 'הכנסות', key: 'income', width: 14 },
    { header: 'הוצאות', key: 'expenses', width: 14 },
    { header: 'רווח נטו', key: 'net', width: 14 },
  ];
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(year, m, 1).toISOString().slice(0, 10);
    const monthEnd = new Date(year, m + 1, 1).toISOString().slice(0, 10);
    const monthIncome = (docs ?? []).filter((d) => d.status !== 'cancelled' && d.issue_date >= monthStart && d.issue_date < monthEnd).reduce((s, d) => s + Number(d.total), 0);
    const monthExpenses = (expenses ?? []).filter((e) => e.expense_date >= monthStart && e.expense_date < monthEnd).reduce((s, e) => s + Number(e.amount), 0);
    summary.addRow({
      month: new Date(year, m, 1).toLocaleDateString('he-IL', { month: 'long' }),
      income: monthIncome,
      expenses: monthExpenses,
      net: monthIncome - monthExpenses,
    });
  }
  summary.getRow(1).font = { bold: true };
  summary.addRow({});
  const sumRow = summary.addRow({
    month: `סה״כ ${year}`,
    income: totalIncome,
    expenses: totalExpenses,
    net: totalIncome - totalExpenses,
  });
  sumRow.font = { bold: true };
  sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };

  const xlsxBuffer = await wb.xlsx.writeBuffer();

  // ----- ZIP -----
  const zip = new JSZip();
  zip.file(`דוח_שנתי_${year}.xlsx`, Buffer.from(xlsxBuffer));

  // הוספת PDFs של מסמכים
  const docsFolder = zip.folder('מסמכים');
  if (docsFolder) {
    for (const d of docs ?? []) {
      if (!d.pdf_url) continue;
      const { data: blob } = await supabase.storage.from('documents').download(d.pdf_url);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        const safeType = (documentTypeLabel[d.document_type] ?? d.document_type).replace(/[\\/]/g, '-');
        docsFolder.file(`${safeType}_${d.number}_${d.customer_name_snapshot}.pdf`, buf);
      }
    }
  }

  // הוספת צילומי קבלות הוצאות
  const expFolder = zip.folder('קבלות_הוצאות');
  if (expFolder) {
    for (const e of expenses ?? []) {
      if (!e.receipt_url) continue;
      const { data: blob } = await supabase.storage.from('expenses').download(e.receipt_url);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        const ext = e.receipt_url.split('.').pop() ?? 'jpg';
        expFolder.file(`${e.expense_date}_${e.vendor.replace(/[\\/]/g, '-')}.${ext}`, buf);
      }
    }
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  return { zip: zipBuffer, filename: `דוח_שנתי_${year}.zip` };
}
