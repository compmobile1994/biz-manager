// HTML template for the receipt — rendered to PDF via puppeteer (Chromium).
// Browser handles Hebrew BiDi natively, so we don't need any custom shaping.

import { documentTypeLabel, paymentMethodLabel, formatCurrency, formatDate } from '@/lib/utils';

interface BuildArgs {
  doc: any;
  copy?: 'original' | 'copy';
  lines: {
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    phone_number?: string | null;
    imei?: string | null;
    warranty_months?: number | null;
    warranty_provider?: string | null;
    importer_type?: 'official' | 'parallel' | null;
  }[];
  payment: {
    method: string;
    amount: number;
    card_last4?: string | null;
    auth_code?: string | null;
    check_number?: string | null;
    check_bank?: string | null;
    check_branch?: string | null;
    check_account?: string | null;
    check_due_date?: string | null;
    transfer_ref?: string | null;
    other_description?: string | null;
  } | null;
  settings: any;
  logoDataUrl?: string | null;
  signatureDataUrl?: string | null;
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHex(c: string | null | undefined, fallback = '#2563eb'): string {
  if (!c) return fallback;
  const m = String(c).trim();
  return /^#?[0-9a-fA-F]{6}$/.test(m.replace(/^#/, '')) ? (m.startsWith('#') ? m : `#${m}`) : fallback;
}

export function buildReceiptHtml({ doc, lines, payment, settings, logoDataUrl, signatureDataUrl, copy = 'original' }: BuildArgs): string {
  const brand = safeHex(settings?.brand_color);
  const docLabel = documentTypeLabel[doc.document_type] ?? 'מסמך';
  const dateStr = formatDate(doc.issue_date);
  const total = lines.reduce((s, l) => s + l.line_total, 0);

  const isSingleSimple = lines.length === 1 && Number(lines[0].quantity) === 1;

  // Calculate warranty expiry date from issue_date + months
  function warrantyExpiry(months: number): string {
    const d = new Date(doc.issue_date + 'T00:00:00');
    d.setMonth(d.getMonth() + months);
    return formatDate(d);
  }

  // For each line, suffix description with phone/IMEI/warranty if present.
  const importerLabel = (t: 'official' | 'parallel' | null | undefined): string =>
    t === 'official' ? 'יבואן רשמי' : t === 'parallel' ? 'יבואן מקביל' : '';
  const renderDesc = (l: BuildArgs['lines'][number]): string => {
    const desc = escapeHtml(l.description);
    const extras: string[] = [];
    if (l.phone_number) extras.push(`טלפון: ${escapeHtml(l.phone_number)}`);
    if (l.imei) extras.push(`IMEI: ${escapeHtml(l.imei)}`);
    if (l.warranty_months && l.warranty_months > 0) {
      const provider = l.warranty_provider ? ` (${escapeHtml(l.warranty_provider)})` : '';
      extras.push(`אחריות: ${l.warranty_months} חודשים${provider} — עד ${warrantyExpiry(l.warranty_months)}`);
    } else if (l.warranty_provider) {
      extras.push(`אחריות: ${escapeHtml(l.warranty_provider)}`);
    }
    if (l.importer_type) extras.push(importerLabel(l.importer_type));
    if (extras.length === 0) return desc;
    return `${desc}<br/><span style="color:#64748b; font-size:9pt;">${extras.join(' · ')}</span>`;
  };

  const itemsBlock = isSingleSimple
    ? `<p style="font-size:14pt; font-weight:700; margin:0;">${renderDesc(lines[0])}</p>`
    : `
      <table style="width:100%; border-collapse:collapse; font-size:10pt;">
        <thead>
          <tr style="background:${brand}1f;">
            <th style="padding:8px; text-align:right; font-weight:600;">תיאור</th>
            <th style="padding:8px; text-align:center; font-weight:600; width:80px;">כמות</th>
            <th style="padding:8px; text-align:left; font-weight:600; width:100px;">מחיר יח׳</th>
            <th style="padding:8px; text-align:left; font-weight:600; width:100px;">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((l, i) => `
            <tr style="${i % 2 === 1 ? 'background:#f8fafc;' : ''}">
              <td style="padding:8px;">${renderDesc(l)}</td>
              <td style="padding:8px; text-align:center;">${l.quantity}</td>
              <td style="padding:8px; text-align:left;">${escapeHtml(formatCurrency(l.unit_price))}</td>
              <td style="padding:8px; text-align:left; font-weight:600;">${escapeHtml(formatCurrency(l.line_total))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  // Detailed check panel (rendered only for method=check, shown under the payment table)
  const checkDetailsBlock = payment && payment.method === 'check'
    ? `
      <div style="margin-top:12px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; font-size:10pt;">
        <p style="font-weight:700; margin:0 0 8px;">פרטי הצ׳ק:</p>
        <table style="width:100%; font-size:10pt; line-height:1.7;">
          <tr>
            <td style="color:#64748b; width:25%;">מספר צ׳ק:</td><td style="width:25%;">${escapeHtml(payment.check_number || '—')}</td>
            <td style="color:#64748b; width:25%;">בנק:</td><td style="width:25%;">${escapeHtml(payment.check_bank || '—')}</td>
          </tr>
          <tr>
            <td style="color:#64748b;">מספר חשבון:</td><td>${escapeHtml(payment.check_account || '—')}</td>
            <td style="color:#64748b;">תאריך פרעון:</td><td>${payment.check_due_date ? escapeHtml(formatDate(payment.check_due_date)) : '—'}</td>
          </tr>
          <tr>
            <td style="color:#64748b;">סכום:</td><td style="font-weight:700;" colspan="3">${escapeHtml(formatCurrency(payment.amount))}</td>
          </tr>
        </table>
      </div>
    `
    : '';

  const paymentBlock = payment
    ? `
      <div style="margin-top:16px;">
        <p style="font-weight:700; font-size:11pt; margin:0 0 8px;">שולם באמצעות:</p>
        <table style="width:100%; border-collapse:collapse; font-size:10pt; border:1px solid #e2e8f0; border-radius:4px; overflow:hidden;">
          <thead>
            <tr style="background:${brand}1f; font-weight:600;">
              <th style="padding:8px; text-align:right;">אמצעי תשלום:</th>
              <th style="padding:8px; text-align:right;">תאריך:</th>
              <th style="padding:8px; text-align:right;">סכום:</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-top:1px solid #e2e8f0;">
              <td style="padding:8px;">${escapeHtml(paymentMethodLabel[payment.method] ?? payment.method)}${
                payment.card_last4 ? ` (${escapeHtml(payment.card_last4)})` : ''
              }${payment.auth_code ? ` · ${escapeHtml(payment.auth_code)}` : ''}${
                payment.check_number ? ` · צ׳ק ${escapeHtml(payment.check_number)}` : ''
              }${payment.transfer_ref ? ` · ${escapeHtml(payment.transfer_ref)}` : ''}${
                payment.method === 'other' && payment.other_description ? ` · ${escapeHtml(payment.other_description)}` : ''
              }</td>
              <td style="padding:8px;">${dateStr}</td>
              <td style="padding:8px;">${escapeHtml(formatCurrency(payment.amount))}</td>
            </tr>
            <tr style="background:${brand}1f; font-weight:700; border-top:1px solid #e2e8f0;">
              <td style="padding:8px;">סה״כ שולם:</td>
              <td style="padding:8px;"></td>
              <td style="padding:8px;">${escapeHtml(formatCurrency(payment.amount))}</td>
            </tr>
          </tbody>
        </table>
        ${checkDetailsBlock}
      </div>
    `
    : '';

  // Israeli law requires "עוסק פטור" + tax_id on every receipt issued by a
  // sole proprietor (עוסק פטור). Render the row even when settings are
  // partial — fall back to a placeholder so the legal label is never hidden.
  const infoRows: { label: string; value: string }[] = [
    { label: 'עוסק פטור', value: settings?.tax_id || '—' },
  ];
  if (settings?.owner_name) infoRows.push({ label: 'בעלים', value: settings.owner_name });
  if (settings?.address || settings?.city) {
    infoRows.push({ label: 'כתובת', value: [settings?.address, settings?.city].filter(Boolean).join(' ') });
  }
  if (settings?.phone) infoRows.push({ label: 'טלפון', value: settings.phone });
  if (settings?.email) infoRows.push({ label: 'דוא"ל', value: settings.email });

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(docLabel)} ${doc.number ?? ''}</title>
<style>
  @page { size: A4; margin: 1cm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Rubik', 'Heebo', 'Arial', sans-serif;
    margin: 0;
    padding: 24px 32px;
    color: #1e293b;
    direction: rtl;
    font-size: 11pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    position: relative;
  }
  .bsd {
    position: absolute;
    top: 6px;
    right: 14px;
    font-size: 11pt;
    font-weight: 700;
    color: #334155;
    letter-spacing: 0.5px;
  }
  /* Diagonal "מבוטל" watermark — only shown when doc.status === 'cancelled'.
     Sits behind the content but stays visible (printed too thanks to
     -webkit-print-color-adjust on body). */
  .cancelled-watermark {
    position: fixed;
    inset: 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }
  .cancelled-watermark span {
    font-size: 120pt;
    font-weight: 900;
    color: rgba(220, 38, 38, 0.18);
    border: 8px solid rgba(220, 38, 38, 0.18);
    padding: 8px 40px;
    border-radius: 12px;
    transform: rotate(-25deg);
    letter-spacing: 8px;
  }
  .cancelled-banner {
    margin: -8px 0 12px;
    padding: 8px 12px;
    text-align: center;
    background: #fee2e2;
    border: 1px solid #dc2626;
    color: #991b1b;
    border-radius: 4px;
    font-weight: 700;
    font-size: 11pt;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-top: 14px; }
  .business-info h1 { margin: 0 0 8px; font-size: 22pt; font-weight: 700; }
  .business-info p { margin: 2px 0; font-size: 10pt; }
  .business-info .label { color: #64748b; }
  .logo { max-width: 150px; max-height: 110px; object-fit: contain; }
  .band {
    margin: 24px 0 16px;
    padding: 12px;
    background: ${brand}29;
    text-align: center;
    border-radius: 4px;
  }
  .band .date { font-size: 10pt; }
  .band .number { font-size: 14pt; font-weight: 700; margin: 4px 0 2px; }
  .band .copy { font-size: 9pt; color: #64748b; }
  .customer { padding: 8px 0 16px; }
  .customer .name { font-weight: 700; font-size: 12pt; }
  .customer .small { font-size: 9pt; color: #64748b; margin-top: 2px; }
  .footer-row { margin-top: 64px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 9pt; color: #64748b; }
  .footer-row .seal-wrap { text-align: center; }
  .footer-row .copy-info { font-size: 8pt; color: #94a3b8; text-align: center; margin-top: 8px; }
  .signature-block { margin-top: 48px; display: flex; justify-content: flex-end; }
  .signature-block .stamp { text-align: center; }
  .signature-block img { max-height: 60px; max-width: 140px; object-fit: contain; }
  .signature-block .label { border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 4px; font-size: 9pt; color: #64748b; min-width: 100px; }
</style>
</head>
<body>
  <div class="bsd">בס&quot;ד</div>
  ${doc.status === 'cancelled' ? `
    <div class="cancelled-watermark"><span>מבוטל</span></div>
    <div class="cancelled-banner">קבלה זו בוטלה — אינה חיוב חוקי</div>
  ` : ''}
  <div class="header">
    <div class="business-info">
      <h1>${escapeHtml(settings?.business_name ?? 'העסק שלי')}</h1>
      ${infoRows.map((r) => `
        <p><span class="label">${escapeHtml(r.label)}:</span> ${escapeHtml(r.value)}</p>
      `).join('')}
    </div>
    ${logoDataUrl ? `<img class="logo" src="${escapeHtml(logoDataUrl)}" alt="לוגו" />` : ''}
  </div>

  <div class="band">
    <div class="date">${dateStr}</div>
    <div class="number">${escapeHtml(docLabel)} מספר ${doc.number ?? '___'}</div>
    <div class="copy">${copy === 'copy' ? 'העתק' : 'מקור'}</div>
  </div>

  <div class="customer">
    <p style="margin:0;"><span style="color:#64748b;">לכבוד:</span> <span class="name">${escapeHtml(doc.customer_name_snapshot)}</span></p>
    ${doc.customer_tax_id_snapshot ? `<p class="small">ת״ז/ח.פ.: ${escapeHtml(doc.customer_tax_id_snapshot)}</p>` : ''}
    ${doc.customer_address_snapshot ? `<p class="small">${escapeHtml(doc.customer_address_snapshot)}</p>` : ''}
    <!-- Summary line — at a glance for the customer / their accountant:
         which receipt this is and who sent it. Receipt number is duplicated
         from the band above intentionally — when the recipient prints or
         clips the customer section alone, all the identifying info is
         still here. -->
    <div style="margin-top:6px; padding-top:6px; border-top:1px dashed #cbd5e1; font-size:10pt;">
      <p style="margin:1px 0;"><span style="color:#64748b;">${escapeHtml(docLabel)} מספר:</span> <strong>${doc.number ?? '___'}</strong></p>
      <p style="margin:1px 0;"><span style="color:#64748b;">מאת:</span> <strong>${escapeHtml(settings?.business_name ?? 'העסק שלי')}</strong></p>
    </div>
  </div>

  <div style="margin-top:8px;">
    ${itemsBlock}
  </div>

  ${paymentBlock}

  <!-- Bank-transfer payment details intentionally NOT shown on the receipt
       itself. The "בקשת העברה" / "בקשת ביט" buttons on the document page
       generate a separate WhatsApp message with the bank info — the
       receipt PDF only documents that payment occurred, not how to pay. -->

  ${doc.notes ? `
    <div style="margin-top:16px; font-size:10pt;">
      <p style="color:#64748b; margin:0 0 4px;">הערות:</p>
      <p style="white-space:pre-wrap; margin:0;">${escapeHtml(doc.notes)}</p>
    </div>
  ` : ''}

  ${signatureDataUrl ? `
    <div class="signature-block">
      <div class="stamp">
        <img src="${escapeHtml(signatureDataUrl)}" alt="חתימה" />
        <div class="label">חתימה</div>
      </div>
    </div>
  ` : ''}

  <div class="footer-row">
    <span>מסמך ממוחשב חתום דיגיטלית</span>
    <div class="seal-wrap">
      <svg width="60" height="60" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <path id="seal-top" d="M 15,50 A 35,35 0 0 1 85,50" fill="none" stroke="none" />
          <path id="seal-bot" d="M 15,50 A 35,35 0 0 0 85,50" fill="none" stroke="none" />
        </defs>
        <circle cx="50" cy="50" r="46" fill="white" stroke="#111" stroke-width="2.5" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="#111" stroke-width="0.5" />
        <text fill="#111" font-size="7" font-weight="700">
          <textPath href="#seal-top" startOffset="50%" text-anchor="middle">מסמך זה חתום דיגיטלית</textPath>
        </text>
        <text fill="#111" font-size="7" font-weight="700">
          <textPath href="#seal-bot" startOffset="50%" text-anchor="middle">ניהול עסק</textPath>
        </text>
        <g transform="translate(50, 50)" fill="#111" stroke="none">
          <path d="M -6 -2 V -6 a 6 6 0 0 1 12 0 V -2" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round" />
          <rect x="-8" y="-2" width="16" height="12" rx="1.8" />
        </g>
      </svg>
    </div>
    <span>הופק במערכת ניהול עסק</span>
  </div>
  <p class="copy-info">${escapeHtml(settings?.invoice_footer ?? 'עוסק פטור')} · עמוד 1 מתוך 1</p>
</body>
</html>`;
}
