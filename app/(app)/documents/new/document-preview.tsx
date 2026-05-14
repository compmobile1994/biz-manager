'use client';

import { documentTypeLabel, formatCurrency, formatDate, paymentMethodLabel } from '@/lib/utils';
import type { DocumentType, PaymentMethod } from '@/lib/supabase/types';
import { DigitalSeal } from '@/components/digital-seal';

export interface PreviewSettings {
  business_name: string;
  owner_name: string | null;
  tax_id: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  brand_color: string | null;
  invoice_footer: string | null;
}

export interface PreviewLine {
  description: string;
  quantity: number;
  unit_price: number;
  phone_number?: string;
  imei?: string;
  warranty_months?: number | null;
  warranty_provider?: string | null;
  importer_type?: 'official' | 'parallel' | null;
}

export interface PreviewData {
  document_type: DocumentType;
  issue_date: string;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  notes: string;
  lines: PreviewLine[];
  payment_method: PaymentMethod;
  card_last4: string;
  auth_code: string;
  check_number: string;
  check_bank?: string;
  check_branch?: string;
  check_account?: string;
  check_due_date?: string;
  transfer_ref: string;
  other_description?: string;
  needsPayment: boolean;
  expectedNumber: number;
}

// Convert a hex (#RRGGBB) to a CSS rgba() with alpha (white-mix simulation).
function softTint(hex: string | null | undefined, alpha = 0.16): string {
  const fallback = '#2563eb';
  const h = (hex && /^#?[0-9a-fA-F]{6}$/.test(hex.replace(/^#/, '')) ? hex : fallback).replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function DocumentPreview({
  data,
  settings,
  logoUrl,
  signatureUrl,
}: {
  data: PreviewData;
  settings: PreviewSettings;
  logoUrl: string | null;
  signatureUrl: string | null;
}) {
  const brand = settings.brand_color || '#2563eb';
  const bandBg = softTint(brand, 0.16);
  const total = data.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);
  const docLabel = documentTypeLabel[data.document_type];
  const dateStr = data.issue_date ? formatDate(data.issue_date) : '—';
  const isSingleLine = data.lines.length === 1 && Number(data.lines[0]?.quantity ?? 0) === 1;

  function lineExtras(l: PreviewLine): string[] {
    const extras: string[] = [];
    if (l.phone_number) extras.push(`📱 ${l.phone_number}`);
    if (l.imei) extras.push(`IMEI: ${l.imei}`);
    if (l.warranty_months && l.warranty_months > 0) {
      const d = new Date(data.issue_date + 'T00:00:00');
      d.setMonth(d.getMonth() + l.warranty_months);
      const provider = l.warranty_provider ? ` (${l.warranty_provider})` : '';
      extras.push(`🛡️ אחריות ${l.warranty_months} ח׳${provider} - עד ${formatDate(d)}`);
    } else if (l.warranty_provider) {
      extras.push(`🛡️ אחריות: ${l.warranty_provider}`);
    }
    if (l.importer_type) {
      extras.push(`📦 ${l.importer_type === 'official' ? 'יבואן רשמי' : 'יבואן מקביל'}`);
    }
    return extras;
  }

  const methodSuffix = [
    data.card_last4 ? `(${data.card_last4})` : '',
    data.auth_code ? `· ${data.auth_code}` : '',
    data.check_number ? `· צ׳ק ${data.check_number}` : '',
    data.transfer_ref ? `· ${data.transfer_ref}` : '',
    data.payment_method === 'other' && data.other_description ? `· ${data.other_description}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const methodFull = methodSuffix
    ? `${paymentMethodLabel[data.payment_method]} ${methodSuffix}`
    : paymentMethodLabel[data.payment_method];

  return (
    <div
      className="bg-white text-slate-900 rounded-lg shadow-md border overflow-hidden relative"
      dir="rtl"
      style={{ fontFamily: 'var(--font-rubik), system-ui, sans-serif' }}
    >
      <div className="absolute top-2 right-3 text-sm font-bold text-slate-700 tracking-wider">בס&quot;ד</div>
      {/* Header: business info on right, logo on left */}
      <div className="px-8 pt-10 pb-4 flex items-start justify-between gap-6">
        {/* Right: business identity */}
        <div className="text-right space-y-1.5">
          <h2 className="text-2xl font-bold mb-2">{settings.business_name}</h2>
          <InfoRow label="עוסק פטור" value={settings.tax_id} />
          {(settings.address || settings.city) && (
            <InfoRow label="כתובת" value={[settings.address, settings.city].filter(Boolean).join(' ')} />
          )}
          {settings.phone && <InfoRow label="טלפון" value={settings.phone} />}
          {settings.email && <InfoRow label='דוא"ל' value={settings.email} />}
        </div>

        {/* Left: logo */}
        <div className="shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="לוגו" className="object-contain" style={{ maxWidth: 150, maxHeight: 110 }} />
          ) : (
            <div
              className="rounded border-2 border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 italic"
              style={{ width: 110, height: 80 }}
            >
              לוגו (לא הועלה)
            </div>
          )}
        </div>
      </div>

      {/* Light band: date / number / "מקור" */}
      <div className="mx-8 my-3 py-3 px-4 text-center" style={{ backgroundColor: bandBg, borderRadius: 4 }}>
        <p className="text-xs">{dateStr}</p>
        <p className="text-base font-bold mt-0.5">{docLabel} מספר {data.expectedNumber}</p>
        <p className="text-xs text-slate-500 mt-0.5">מקור</p>
      </div>

      {/* Customer */}
      <div className="px-8 pt-4 pb-2">
        <p className="text-sm">
          <span className="text-slate-500">לכבוד: </span>
          <span className="font-semibold">{data.customer_name || <span className="text-slate-400 italic">— לא הוזן —</span>}</span>
        </p>
        {data.customer_tax_id && <p className="text-xs text-slate-500 mt-1">ת״ז/ח.פ.: {data.customer_tax_id}</p>}
        {data.customer_address && <p className="text-xs text-slate-500">{data.customer_address}</p>}
      </div>

      {/* Items */}
      <div className="px-8 py-4">
        {isSingleLine && data.lines[0]?.description ? (
          <div>
            <p className="text-base font-bold">{data.lines[0].description}</p>
            {lineExtras(data.lines[0]).length > 0 && (
              <p className="text-xs text-slate-500 mt-1">{lineExtras(data.lines[0]).join(' · ')}</p>
            )}
          </div>
        ) : data.lines.length === 0 || data.lines.every((l) => !l.description.trim()) ? (
          <p className="text-sm text-slate-400 italic">— אין שורות —</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: bandBg }} className="text-right">
                <th className="px-3 py-2 font-semibold">תיאור</th>
                <th className="px-3 py-2 font-semibold w-20 text-center">כמות</th>
                <th className="px-3 py-2 font-semibold w-28 text-left">מחיר יח׳</th>
                <th className="px-3 py-2 font-semibold w-28 text-left">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => {
                const lineTotal = Number(l.quantity || 0) * Number(l.unit_price || 0);
                const extras = lineExtras(l);
                return (
                  <tr key={i} className={i % 2 === 1 ? 'bg-slate-50' : ''}>
                    <td className="px-3 py-2">
                      <div>{l.description}</div>
                      {extras.length > 0 && (
                        <div className="text-xs text-slate-500 mt-0.5">{extras.join(' · ')}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{l.quantity}</td>
                    <td className="px-3 py-2 text-left">{formatCurrency(l.unit_price)}</td>
                    <td className="px-3 py-2 text-left font-semibold">{formatCurrency(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment */}
      {data.needsPayment && (
        <div className="px-8 py-4">
          <p className="text-sm font-semibold mb-2">שולם באמצעות:</p>
          <div className="border rounded overflow-hidden">
            <div className="grid grid-cols-3 px-3 py-2 text-sm font-semibold" style={{ backgroundColor: bandBg }}>
              <span>אמצעי תשלום:</span>
              <span>תאריך:</span>
              <span>סכום:</span>
            </div>
            <div className="grid grid-cols-3 px-3 py-2 text-sm border-b">
              <span>{methodFull}</span>
              <span>{dateStr}</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="grid grid-cols-3 px-3 py-2 text-sm font-bold" style={{ backgroundColor: bandBg }}>
              <span>סה״כ שולם:</span>
              <span></span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {data.payment_method === 'check' && (
            <div className="mt-3 rounded-md border bg-slate-50 p-3 text-sm">
              <p className="font-semibold mb-2">פרטי הצ׳ק:</p>
              <div className="grid grid-cols-2 gap-y-1 gap-x-4">
                <div><span className="text-slate-500">מספר צ׳ק: </span>{data.check_number || '—'}</div>
                <div><span className="text-slate-500">בנק: </span>{data.check_bank || '—'}</div>
                <div><span className="text-slate-500">מספר חשבון: </span>{data.check_account || '—'}</div>
                <div><span className="text-slate-500">תאריך פרעון: </span>{data.check_due_date ? formatDate(data.check_due_date) : '—'}</div>
                <div className="col-span-2"><span className="text-slate-500">סכום: </span><span className="font-semibold">{formatCurrency(total)}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {data.notes && (
        <div className="px-8 py-2 text-sm">
          <p className="text-xs text-slate-500">הערות:</p>
          <p className="whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      {/* Signature - left side (LTR-left, opposite of "לכבוד" which is on RTL-right) */}
      {signatureUrl && (
        <div className="px-8 mt-6 mb-2 flex justify-end">
          <div className="text-center">
            <img
              src={signatureUrl}
              alt="חתימה"
              className="object-contain max-h-16 max-w-[140px]"
            />
            <div className="border-t border-slate-300 mt-1 pt-0.5 text-[10px] text-slate-500" style={{ minWidth: 100 }}>
              חתימה
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-8 mt-12 pt-4 border-t text-xs text-slate-500 flex items-center justify-between gap-4">
        <span>מסמך ממוחשב חתום דיגיטלית</span>

        {/* Circular digital signature seal */}
        <DigitalSeal size={70} color="#111111" appName="ניהול עסק" />

        <span>הופק במערכת ניהול עסק</span>
      </div>
      <div className="text-center text-[10px] text-slate-400 py-2">{settings.invoice_footer || 'עוסק פטור'} · Page 1 of 1</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs">
      <span className="text-slate-500">{label}: </span>
      <span>{value}</span>
    </p>
  );
}
