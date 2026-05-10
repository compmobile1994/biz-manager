import { PDFDocument, rgb, degrees } from 'pdf-lib';
import type { PDFImage, RGB, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { documentTypeLabel, paymentMethodLabel, formatCurrency, formatDate } from '@/lib/utils';
import { rtl } from './bidi';

// ---------------------------------------------------------------------------
// Hebrew fonts: bundled locally at public/fonts/ for stability (Google Fonts
// CDN URLs change with version bumps and break PDF generation).
// ---------------------------------------------------------------------------
let cachedRegular: Uint8Array | null = null;
let cachedBold: Uint8Array | null = null;

function loadLocalFont(filename: string, cache: 'reg' | 'bold'): Uint8Array {
  if (cache === 'reg' && cachedRegular) return cachedRegular;
  if (cache === 'bold' && cachedBold) return cachedBold;
  const path = join(process.cwd(), 'public', 'fonts', filename);
  const bytes = new Uint8Array(readFileSync(path));
  if (cache === 'reg') cachedRegular = bytes;
  else cachedBold = bytes;
  return bytes;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
function hexToRgb(hex: string | null | undefined, fallback: RGB = rgb(0.145, 0.388, 0.922)): RGB {
  if (!hex) return fallback;
  const s = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return fallback;
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function mixWithWhite(c: RGB, alpha: number): RGB {
  const a = Math.max(0, Math.min(1, alpha));
  return rgb(c.red * a + (1 - a), c.green * a + (1 - a), c.blue * a + (1 - a));
}

const COLOR = {
  text: rgb(0.13, 0.13, 0.16),
  muted: rgb(0.45, 0.47, 0.53),
  faint: rgb(0.62, 0.64, 0.69),
  hairline: rgb(0.86, 0.88, 0.92),
  panelLight: rgb(0.98, 0.98, 0.99),
  white: rgb(1, 1, 1),
};

// ---------------------------------------------------------------------------
// Image fetching (only http(s); storage paths must be pre-resolved by caller)
// ---------------------------------------------------------------------------
async function fetchImageBytes(url: string | null | undefined): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') ?? '';
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime };
  } catch {
    return null;
  }
}

async function embedImage(pdfDoc: PDFDocument, src: { bytes: Uint8Array; mime: string }): Promise<PDFImage | null> {
  try {
    if (src.mime.includes('png')) return await pdfDoc.embedPng(src.bytes);
    if (src.mime.includes('jpeg') || src.mime.includes('jpg')) return await pdfDoc.embedJpg(src.bytes);
    try { return await pdfDoc.embedPng(src.bytes); } catch { return await pdfDoc.embedJpg(src.bytes); }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Money formatter (strips locale BiDi marks; adds "₪" sign at end of LTR run)
// ---------------------------------------------------------------------------
function fmtMoney(n: number): string {
  return formatCurrency(n).replace(/[‎‏‪-‮⁦-⁩]/g, '').trim();
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
interface GenerateArgs {
  doc: any;
  lines: { description: string; quantity: number; unit_price: number; line_total: number }[];
  payment: {
    method: string;
    amount: number;
    card_last4?: string | null;
    auth_code?: string | null;
    check_number?: string | null;
    transfer_ref?: string | null;
  } | null;
  settings: any;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export async function generateDocumentPdf({ doc, lines, payment, settings }: GenerateArgs): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regBytes = loadLocalFont('Rubik-Regular.ttf', 'reg');
  let boldBytes: Uint8Array;
  try {
    boldBytes = loadLocalFont('Rubik-Bold.ttf', 'bold');
  } catch {
    boldBytes = regBytes;
  }
  const fontReg = await pdfDoc.embedFont(regBytes, { subset: true });
  const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 40;
  const right = width - margin;
  const left = margin;
  const innerWidth = width - margin * 2;

  const brand = hexToRgb(settings?.brand_color, rgb(0.145, 0.388, 0.922));
  const bandBg = mixWithWhite(brand, 0.16); // light blue band background

  // ---- Drawing primitives ----------------------------------------------------
  function widthOf(text: string, size: number, bold = false): number {
    return (bold ? fontBold : fontReg).widthOfTextAtSize(rtl(text), size);
  }
  function drawTextAt(text: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: RGB } = {}) {
    page.drawText(rtl(text), {
      x, y, size,
      font: opts.bold ? fontBold : fontReg,
      color: opts.color ?? COLOR.text,
    });
  }
  function drawRight(text: string, y: number, size: number, opts: { bold?: boolean; color?: RGB; anchorX?: number } = {}) {
    const x = (opts.anchorX ?? right) - widthOf(text, size, opts.bold);
    drawTextAt(text, x, y, size, opts);
  }
  function drawLeft(text: string, y: number, size: number, opts: { bold?: boolean; color?: RGB; anchorX?: number } = {}) {
    drawTextAt(text, opts.anchorX ?? left, y, size, opts);
  }
  function drawCenter(text: string, y: number, size: number, opts: { bold?: boolean; color?: RGB; cx?: number } = {}) {
    const w = widthOf(text, size, opts.bold);
    drawTextAt(text, (opts.cx ?? width / 2) - w / 2, y, size, opts);
  }

  // ---- Logo (top left) ------------------------------------------------------
  const logoSrc = await fetchImageBytes(settings?.logo_url);
  const logoImg = logoSrc ? await embedImage(pdfDoc, logoSrc) : null;

  let cursorY = height - 50;

  if (logoImg) {
    const maxH = 110;
    const maxW = 150;
    const ratio = logoImg.width / logoImg.height;
    let h = maxH;
    let w = h * ratio;
    if (w > maxW) { w = maxW; h = w / ratio; }
    page.drawImage(logoImg, {
      x: left,
      y: height - 50 - h + 10,
      width: w,
      height: h,
    });
  }

  // ---- Business identity (top right) ----------------------------------------
  const bizName = settings?.business_name ?? 'העסק שלי';
  drawRight(bizName, cursorY - 4, 22, { bold: true });
  cursorY -= 28;

  // Label : value pairs (label on right, value to its left, label first because RTL)
  // For shape: "עוסק פטור: 312250467"
  const infoRows: { label: string; value: string }[] = [];
  if (settings?.tax_id) infoRows.push({ label: 'עוסק פטור', value: settings.tax_id });
  if (settings?.address || settings?.city) {
    const addr = [settings?.address, settings?.city].filter(Boolean).join(' ');
    infoRows.push({ label: 'כתובת', value: addr });
  }
  if (settings?.phone) infoRows.push({ label: 'טלפון', value: settings.phone });
  if (settings?.email) infoRows.push({ label: 'דוא"ל', value: settings.email });

  const labelSize = 10;
  const valueSize = 10;
  const lineGap = 16;
  for (const row of infoRows) {
    // Label on the right (with colon), value to the left of label
    const labelText = `${row.label}:`;
    const labelW = widthOf(labelText, labelSize, false);
    drawRight(labelText, cursorY, labelSize, { color: COLOR.muted });
    // Value drawn to the left of the label
    const valueAnchor = right - labelW - 6;
    drawRight(row.value, cursorY, valueSize, { anchorX: valueAnchor });
    cursorY -= lineGap;
  }

  // ---- Light blue band: date + document number + "מקור" --------------------
  const bandTop = Math.min(cursorY - 18, height - 200);
  const bandH = 60;
  const bandBottom = bandTop - bandH;
  page.drawRectangle({
    x: left,
    y: bandBottom,
    width: innerWidth,
    height: bandH,
    color: bandBg,
  });

  const dateStr = formatDate(doc.issue_date);
  const docTypeLabel = documentTypeLabel[doc.document_type] ?? 'מסמך';
  const docNumberLine = `${docTypeLabel} מספר ${doc.number ?? '___'}`;

  drawCenter(dateStr, bandTop - 18, 10, { color: COLOR.text });
  drawCenter(docNumberLine, bandTop - 35, 15, { bold: true, color: COLOR.text });
  drawCenter('מקור', bandTop - 52, 9, { color: COLOR.muted });

  let y = bandBottom - 30;

  // ---- Customer "לכבוד" line -----------------------------------------------
  const labelToText = 'לכבוד:';
  const labelW = widthOf(labelToText, 11, false);
  drawRight(labelToText, y, 11, { color: COLOR.muted });
  const customerName = doc.customer_name_snapshot || '';
  drawRight(customerName, y, 11, { bold: true, anchorX: right - labelW - 8 });
  y -= 20;

  if (doc.customer_tax_id_snapshot) {
    drawRight(`ת״ז/ח.פ.: ${doc.customer_tax_id_snapshot}`, y, 9, { color: COLOR.muted });
    y -= 14;
  }
  if (doc.customer_address_snapshot) {
    drawRight(doc.customer_address_snapshot, y, 9, { color: COLOR.muted });
    y -= 14;
  }
  y -= 10;

  // ---- Items: single description line OR proper table for multiple ---------
  if (lines.length === 1 && lines[0].quantity === 1) {
    // Single line, qty=1 → render as bold description (matches the reference PDF)
    drawRight(lines[0].description, y, 12, { bold: true });
    y -= 26;
  } else {
    // Multi-line: render a table
    const colDescX = right;             // right (RTL)
    const colQtyX = left + innerWidth * 0.55;
    const colPriceX = left + innerWidth * 0.30;
    const colTotalX = left + 10;

    // Header row
    page.drawRectangle({ x: left, y: y - 6, width: innerWidth, height: 24, color: bandBg });
    drawRight('תיאור', y, 10, { bold: true, anchorX: right - 6, color: COLOR.text });
    drawTextAt('כמות', colQtyX, y, 10, { bold: true });
    drawTextAt('מחיר יח׳', colPriceX, y, 10, { bold: true });
    drawTextAt('סה״כ', colTotalX, y, 10, { bold: true });
    y -= 22;

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (i % 2 === 1) {
        page.drawRectangle({ x: left, y: y - 6, width: innerWidth, height: 20, color: COLOR.panelLight });
      }
      drawRight(ln.description, y, 10, { anchorX: right - 6 });
      drawTextAt(String(ln.quantity), colQtyX, y, 10);
      drawTextAt(fmtMoney(ln.unit_price), colPriceX, y, 10);
      drawTextAt(fmtMoney(ln.line_total), colTotalX, y, 10, { bold: true });
      y -= 20;
    }
    y -= 6;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: COLOR.hairline });
    y -= 18;
  }

  // ---- Payment section -----------------------------------------------------
  if (payment) {
    drawRight('שולם באמצעות:', y, 11, { bold: true });
    y -= 22;

    // 3-column table: אמצעי תשלום | תאריך | סכום
    const colMethodX = right;
    const colDateX = left + innerWidth * 0.45;
    const colAmountX = left;

    // Header row (light blue)
    const rowH = 26;
    page.drawRectangle({ x: left, y: y - 8, width: innerWidth, height: rowH, color: bandBg });
    drawRight('אמצעי תשלום:', y, 10, { bold: true, anchorX: right - 8 });
    drawTextAt('תאריך:', colDateX, y, 10, { bold: true });
    drawTextAt('סכום:', colAmountX + 8, y, 10, { bold: true });
    y -= rowH;

    // Data row
    const methodLabel = paymentMethodLabel[payment.method] ?? payment.method;
    const methodSuffix = [
      payment.card_last4 ? `(${payment.card_last4})` : '',
      payment.auth_code ? `· ${payment.auth_code}` : '',
      payment.check_number ? `· צ׳ק ${payment.check_number}` : '',
      payment.transfer_ref ? `· ${payment.transfer_ref}` : '',
    ].filter(Boolean).join(' ');
    const methodFull = methodSuffix ? `${methodLabel} ${methodSuffix}` : methodLabel;

    drawRight(methodFull, y + 8, 10, { anchorX: right - 8 });
    drawTextAt(formatDate(doc.issue_date), colDateX, y + 8, 10);
    drawTextAt(fmtMoney(payment.amount), colAmountX + 8, y + 8, 10);
    page.drawLine({ start: { x: left, y: y - 4 }, end: { x: right, y: y - 4 }, thickness: 0.4, color: COLOR.hairline });
    y -= rowH;

    // Total row (light blue, bold)
    page.drawRectangle({ x: left, y: y, width: innerWidth, height: rowH, color: bandBg });
    drawRight('סה״כ שולם:', y + 8, 11, { bold: true, anchorX: right - 8 });
    drawTextAt(fmtMoney(payment.amount), colAmountX + 8, y + 8, 11, { bold: true });
    y -= rowH + 12;
  }

  // ---- Notes ---------------------------------------------------------------
  if (doc.notes) {
    drawRight('הערות:', y, 9, { color: COLOR.muted });
    y -= 14;
    drawRight(String(doc.notes).slice(0, 280), y, 9);
    y -= 18;
  }

  // ---- Signature image -----------------------------------------------------
  const signatureSrc = await fetchImageBytes(settings?.signature_url);
  const signatureImg = signatureSrc ? await embedImage(pdfDoc, signatureSrc) : null;
  if (signatureImg) {
    const sigMaxW = 110;
    const sigMaxH = 50;
    const ratio = signatureImg.width / signatureImg.height;
    let w = sigMaxW;
    let h = w / ratio;
    if (h > sigMaxH) { h = sigMaxH; w = h * ratio; }
    // Position: lower-left area (matches reference)
    const sigY = Math.max(y - 30, 130);
    page.drawImage(signatureImg, {
      x: left + 30,
      y: sigY,
      width: w,
      height: h,
    });
  }

  // ---- Footer (3 sections + circular digital-signature seal) ---------------
  const footerY = 80;
  page.drawLine({
    start: { x: left, y: footerY + 38 },
    end: { x: right, y: footerY + 38 },
    thickness: 0.5,
    color: COLOR.hairline,
  });

  drawRight('מסמך ממוחשב חתום דיגיטלית', footerY + 22, 9, { color: COLOR.muted });
  drawLeft('הופק במערכת ניהול עסק', footerY + 22, 9, { color: COLOR.muted });

  // Center: circular digital-signature seal with curved text
  const sealCx = width / 2;
  const sealCy = footerY + 16;
  const sealR = 26; // outer radius

  // Outer + inner rings (black stamp look)
  const stampColor = rgb(0.05, 0.05, 0.07);
  page.drawCircle({
    x: sealCx,
    y: sealCy,
    size: sealR,
    color: COLOR.white,
    borderColor: stampColor,
    borderWidth: 1.6,
  });
  page.drawCircle({
    x: sealCx,
    y: sealCy,
    size: sealR - 3.5,
    borderColor: stampColor,
    borderWidth: 0.4,
  });

  // Curved text helper: places shaped chars along a circular arc.
  drawTextOnArc(page, fontBold, {
    text: 'מסמך זה חתום דיגיטלית',
    cx: sealCx,
    cy: sealCy,
    radius: sealR - 6,
    midAngle: Math.PI / 2, // top of circle (radians; 90° = up)
    fontSize: 4.5,
    color: stampColor,
    direction: 'top',
  });
  drawTextOnArc(page, fontBold, {
    text: 'ניהול עסק',
    cx: sealCx,
    cy: sealCy,
    radius: sealR - 6,
    midAngle: -Math.PI / 2, // bottom of circle
    fontSize: 4.5,
    color: stampColor,
    direction: 'bottom',
  });

  // Lock icon in the center (drawn with rectangles + arc)
  const lockW = 12;
  const lockH = 9;
  const lockX = sealCx - lockW / 2;
  const lockY = sealCy - lockH / 2 - 1;
  // Body
  page.drawRectangle({
    x: lockX,
    y: lockY,
    width: lockW,
    height: lockH,
    color: stampColor,
  });
  // Shackle: two small rectangles forming an arch (approximation)
  page.drawRectangle({
    x: lockX + 1.8,
    y: lockY + lockH,
    width: 1.6,
    height: 4,
    color: stampColor,
  });
  page.drawRectangle({
    x: lockX + lockW - 3.4,
    y: lockY + lockH,
    width: 1.6,
    height: 4,
    color: stampColor,
  });
  page.drawRectangle({
    x: lockX + 1.8,
    y: lockY + lockH + 3,
    width: lockW - 3.6,
    height: 1.6,
    color: stampColor,
  });
  // Keyhole
  page.drawCircle({
    x: sealCx,
    y: lockY + lockH / 2 + 0.5,
    size: 1.2,
    color: COLOR.white,
  });

  drawCenter(settings?.invoice_footer ?? 'עוסק פטור', 38, 8, { color: COLOR.muted });
  drawCenter('Page 1 of 1', 22, 7.5, { color: COLOR.faint });

  return await pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Curved-text helper: draws each character along a circular arc, properly
// rotated tangent to the curve. Hebrew text is shaped through `rtl()` first
// so the visual order matches RTL reading.
// ---------------------------------------------------------------------------
function drawTextOnArc(
  page: PDFPage,
  font: PDFFont,
  opts: {
    text: string;
    cx: number;
    cy: number;
    radius: number;
    midAngle: number; // angle (radians) of the middle of the text along the arc
    fontSize: number;
    color: RGB;
    direction: 'top' | 'bottom';
  },
) {
  const shaped = rtl(opts.text);
  const chars = [...shaped];
  if (chars.length === 0) return;

  // Compute angular width for each character (chord ≈ arc when small).
  const charWidths = chars.map((c) => font.widthOfTextAtSize(c, opts.fontSize));
  const totalWidth = charWidths.reduce((a, b) => a + b, 0);
  const totalAngle = totalWidth / opts.radius;

  // For a 'top' arc, characters read RIGHT-TO-LEFT visually as we move along
  // the arc from larger angle to smaller. For 'bottom' arc we go from smaller
  // to larger so the bottom text reads upright.
  const start = opts.direction === 'top'
    ? opts.midAngle + totalAngle / 2
    : opts.midAngle - totalAngle / 2;

  let cursor = start;
  for (let i = 0; i < chars.length; i++) {
    const aw = charWidths[i] / opts.radius;
    // Step half a char width to get the *center* angle for this char
    const charAngle = opts.direction === 'top' ? cursor - aw / 2 : cursor + aw / 2;

    const x = opts.cx + opts.radius * Math.cos(charAngle);
    const y = opts.cy + opts.radius * Math.sin(charAngle);

    // Glyph rotation:
    //   • Top arc:    glyph-top = OUTWARD radial (visually UP at top)  →  θ - 90°
    //   • Bottom arc: glyph-top = INWARD radial (visually UP at bottom)  →  θ + 90°
    // Both produce upright, readable text — at the bottom this means each
    // glyph is *not* upside-down for an outside viewer.
    const rotDeg =
      opts.direction === 'top'
        ? (charAngle * 180) / Math.PI - 90
        : (charAngle * 180) / Math.PI + 90;

    page.drawText(chars[i], {
      x,
      y,
      size: opts.fontSize,
      font,
      color: opts.color,
      rotate: degrees(rotDeg),
    });

    cursor = opts.direction === 'top' ? cursor - aw : cursor + aw;
  }
}
