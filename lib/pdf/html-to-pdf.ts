// HTML-to-PDF generator using Puppeteer (headless Chromium).
// The browser handles all Hebrew BiDi natively, so receipts always render
// with proper RTL letter ordering, tangent-correct curved seal text, and
// correct numeral/currency placement.
//
// This module replaces the pdf-lib path. We keep a singleton browser
// instance for the lifetime of the Node process to avoid the ~1s
// chromium startup on every receipt.

import type { Browser } from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReceiptHtml } from './receipt-html';

let browserPromise: Promise<Browser> | null = null;

// Detect serverless environments (Vercel, AWS Lambda) where we need to use
// puppeteer-core + @sparticuz/chromium since the full puppeteer + bundled
// Chromium is too large for the function size limit. In local dev we use
// the regular `puppeteer` package which already has Chromium downloaded.
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      if (isServerless) {
        const chromium = (await import('@sparticuz/chromium')).default;
        const puppeteer = (await import('puppeteer-core')).default;
        return (await puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        })) as unknown as Browser;
      }
      const puppeteer = (await import('puppeteer')).default;
      return (await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })) as unknown as Browser;
    })();
  }
  return browserPromise;
}

// Convert a Supabase storage path or http(s) URL into a base-64 data URL
// that the browser can embed directly. This avoids cross-origin / auth
// issues during the puppeteer render.
async function toDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') ?? 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Read a local font file as base-64 so we can embed it in @font-face for
// reliable Hebrew rendering across environments (the browser's default
// fonts may not include all Hebrew glyphs).
function readLocalFontAsDataUrl(filename: string): string | null {
  try {
    const path = join(process.cwd(), 'public', 'fonts', filename);
    const bytes = readFileSync(path);
    return `data:font/ttf;base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

interface GenerateArgs {
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
  // Either a single payment (legacy, backwards-compatible) or an array of
  // split payments (cash + bit / cash + check / etc.) on the same receipt.
  payment?: PaymentArg | null;
  payments?: PaymentArg[] | null;
  settings: any;
}

interface PaymentArg {
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
}

export async function generateDocumentPdf({ doc, lines, payment, payments, settings, copy }: GenerateArgs): Promise<Uint8Array> {
  // Fetch logo + signature as data URLs so the page can include them inline
  // (avoids any auth / network dependency during the puppeteer render).
  const [logoDataUrl, signatureDataUrl] = await Promise.all([
    toDataUrl(settings?.logo_url),
    toDataUrl(settings?.signature_url),
  ]);

  // Inline Hebrew fonts for guaranteed glyph coverage
  const rubikRegular = readLocalFontAsDataUrl('Rubik-Regular.ttf');
  const rubikBold = readLocalFontAsDataUrl('Rubik-Bold.ttf');
  const fontStyles = `
    ${rubikRegular ? `@font-face { font-family: 'Rubik'; src: url('${rubikRegular}') format('truetype'); font-weight: 400; font-style: normal; }` : ''}
    ${rubikBold ? `@font-face { font-family: 'Rubik'; src: url('${rubikBold}') format('truetype'); font-weight: 700; font-style: normal; }` : ''}
  `;

  const html = buildReceiptHtml({
    doc, lines, payment, payments, settings, copy,
    logoDataUrl, signatureDataUrl,
  }).replace('</style>', `${fontStyles}</style>`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
    });
    return new Uint8Array(pdfBuffer);
  } finally {
    await page.close().catch(() => {});
  }
}
