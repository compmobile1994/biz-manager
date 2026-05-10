import { documentTypeLabel, formatCurrency, formatDate } from '@/lib/utils';

export interface DocumentEmailDoc {
  document_type: string;
  number: number;
  issue_date: string;
  total: number;
  customer_name_snapshot: string;
}

export interface DocumentEmailSettings {
  business_name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  brand_color?: string | null;
  logo_public_url?: string | null;
  owner_name?: string | null;
}

/**
 * HTML escaping for safe inclusion of user-controlled strings in email body.
 */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validate brand color is a hex color string (#RGB or #RRGGBB) to prevent CSS injection.
 */
function safeBrandColor(input?: string | null): string {
  const fallback = '#2563eb';
  if (!input) return fallback;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input.trim()) ? input.trim() : fallback;
}

/**
 * Build a branded transactional HTML email for a document (invoice/receipt/etc).
 * Uses table-based layout, inline CSS, dir="rtl" / lang="he" for maximum email-client compatibility.
 */
export function buildDocumentEmailHtml(opts: {
  doc: DocumentEmailDoc;
  settings: DocumentEmailSettings;
}): string {
  const { doc, settings } = opts;
  const brand = safeBrandColor(settings.brand_color);
  const businessName = settings.business_name || 'העסק שלי';
  const ownerOrBusiness = settings.owner_name || businessName;
  const docLabel = documentTypeLabel[doc.document_type] || doc.document_type;
  const totalText = formatCurrency(Number(doc.total) || 0);
  const dateText = formatDate(doc.issue_date);
  const fontStack = `Arial, 'Helvetica Neue', Helvetica, sans-serif`;

  const logoCell = settings.logo_public_url
    ? `<td align="left" valign="middle" style="width:80px;padding:0;">
         <img src="${esc(settings.logo_public_url)}" alt="${esc(businessName)}" height="60" style="display:block;height:60px;max-height:60px;width:auto;border:0;outline:none;text-decoration:none;background:#ffffff;border-radius:6px;padding:4px;" />
       </td>`
    : '';

  const contactLines: string[] = [];
  if (settings.phone) contactLines.push(`טלפון: ${esc(settings.phone)}`);
  if (settings.email) contactLines.push(`דוא״ל: ${esc(settings.email)}`);
  const fullAddress = [settings.address, settings.city].filter(Boolean).join(', ');
  if (fullAddress) contactLines.push(`כתובת: ${esc(fullAddress)}`);
  if (settings.tax_id) contactLines.push(`ע.מ: ${esc(settings.tax_id)}`);

  const footerContact = contactLines
    .map((line) => `<div style="margin:2px 0;color:#6b7280;font-size:12px;line-height:1.5;">${line}</div>`)
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(docLabel)} #${esc(doc.number)}</title>
  </head>
  <body dir="rtl" lang="he" style="margin:0;padding:0;background-color:#f3f4f6;font-family:${fontStack};color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);" dir="rtl">
            <!-- Header band -->
            <tr>
              <td style="background-color:${brand};padding:20px 24px;" dir="rtl">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="rtl">
                  <tr>
                    <td align="right" valign="middle" style="color:#ffffff;font-family:${fontStack};font-size:24px;font-weight:bold;line-height:1.2;">
                      ${esc(businessName)}
                    </td>
                    ${logoCell}
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 24px 16px 24px;font-family:${fontStack};color:#111827;font-size:16px;line-height:1.6;" dir="rtl" align="right">
                <p style="margin:0 0 16px 0;font-size:18px;font-weight:bold;">שלום,</p>

                <!-- Info box -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;border-collapse:separate;" dir="rtl">
                  <tr>
                    <td style="border-right:4px solid ${brand};background-color:#f9fafb;padding:14px 16px;border-radius:4px;" align="right">
                      <div style="font-size:14px;color:#6b7280;margin:0 0 4px 0;">סוג מסמך</div>
                      <div style="font-size:18px;font-weight:bold;color:#111827;margin:0 0 8px 0;">${esc(docLabel)} #${esc(doc.number)}</div>
                      <div style="font-size:14px;color:#374151;margin:0;">תאריך הפקה: ${esc(dateText)}</div>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 16px 0;">
                  מצורף ${esc(docLabel)} עבור <strong>${esc(doc.customer_name_snapshot)}</strong> בסכום של <strong>${esc(totalText)}</strong>.
                </p>
                <p style="margin:0 0 24px 0;color:#374151;">
                  אנא בדקו את המסמך המצורף. אם יש שאלות, נשמח לעזור.
                </p>

                <p style="margin:24px 0 0 0;">
                  תודה,<br />
                  <strong>${esc(ownerOrBusiness)}</strong>
                </p>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:0 24px;">
                <div style="border-top:1px solid #e5e7eb;height:1px;line-height:1px;font-size:1px;">&nbsp;</div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px 24px 24px;font-family:${fontStack};" dir="rtl" align="right">
                ${footerContact}
                <div style="margin-top:12px;color:#9ca3af;font-size:11px;line-height:1.5;">
                  המסמך הופק על ידי תוכנת ניהול עסק
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
