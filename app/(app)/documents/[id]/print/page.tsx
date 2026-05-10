import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { documentTypeLabel, formatCurrency, formatDate, paymentMethodLabel } from '@/lib/utils';
import { PrintTrigger } from './print-trigger';

export default async function DocumentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: doc }, { data: items }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).maybeSingle(),
    supabase.from('document_items').select('*').eq('document_id', id).order('sort_order'),
    supabase.from('payments').select('*').eq('document_id', id),
    supabase.from('business_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  if (!doc) notFound();

  const brandColor: string = (settings?.brand_color as string) || '#2563eb';

  // Signed URLs for logo and signature
  let logoUrl: string | null = null;
  if (settings?.logo_url) {
    const { data: signed } = await supabase.storage.from('business').createSignedUrl(settings.logo_url, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }
  let signatureUrl: string | null = null;
  if (settings?.signature_url) {
    const { data: signed } = await supabase.storage.from('business').createSignedUrl(settings.signature_url, 3600);
    signatureUrl = signed?.signedUrl ?? null;
  }

  const businessName: string = settings?.business_name ?? 'העסק שלי';
  const businessTaxId: string | null = settings?.tax_id ?? null;
  const businessAddress: string | null = settings?.address ?? null;
  const businessPhone: string | null = settings?.phone ?? null;
  const businessEmail: string | null = settings?.email ?? null;
  const invoiceFooter: string | null = settings?.invoice_footer ?? null;

  const totalNum = Number(doc.total ?? 0);

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'white',
        zIndex: 100,
        overflow: 'auto',
        color: '#111',
        fontFamily: "'Heebo', system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        @page { size: A4; margin: 1cm; }
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .print-root { position: static !important; inset: auto !important; z-index: auto !important; overflow: visible !important; }
        }
        .print-root { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .print-table th, .print-table td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: right; }
        .print-table thead th { background: #f3f4f6; font-weight: 700; }
        .print-table tbody tr:nth-child(even) td { background: #fafafa; }
      `}</style>

      <div
        className="print-root"
        style={{
          maxWidth: '780px',
          margin: '0 auto',
          padding: '24px',
          background: 'white',
        }}
      >
        {/* Top action bar (hidden on print) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <a
            href={`/documents/${doc.id}`}
            style={{
              padding: '8px 14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#111',
              fontSize: '14px',
            }}
          >
            חזרה למסמך
          </a>
        </div>

        {/* Brand header */}
        <div
          style={{
            background: brandColor,
            color: 'white',
            padding: '18px 22px',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, lineHeight: 1.2 }}>{businessName}</div>
            {businessTaxId && (
              <div style={{ fontSize: '13px', opacity: 0.95, marginTop: '4px' }}>
                ע.מ./ח.פ.: {businessTaxId}
              </div>
            )}
            {(businessPhone || businessEmail) && (
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
                {businessPhone && <span>טל׳: {businessPhone}</span>}
                {businessPhone && businessEmail && <span> · </span>}
                {businessEmail && <span>{businessEmail}</span>}
              </div>
            )}
            {businessAddress && (
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>{businessAddress}</div>
            )}
          </div>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="logo"
              style={{
                maxHeight: '70px',
                maxWidth: '160px',
                objectFit: 'contain',
                background: 'white',
                padding: '4px',
                borderRadius: '6px',
              }}
            />
          )}
        </div>

        {/* Document title */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: '20px',
            marginBottom: '14px',
            borderBottom: `2px solid ${brandColor}`,
            paddingBottom: '8px',
          }}
        >
          <div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: brandColor }}>
              {documentTypeLabel[doc.document_type] ?? doc.document_type}
              {doc.status === 'cancelled' && (
                <span style={{ color: '#dc2626', fontSize: '14px', marginRight: '10px' }}>(בוטל)</span>
              )}
            </div>
            <div style={{ fontSize: '15px', marginTop: '4px' }}>
              מס׳ <strong>{doc.number}</strong>
            </div>
          </div>
          <div style={{ textAlign: 'left', fontSize: '13px' }}>
            <div>תאריך הפקה: <strong>{formatDate(doc.issue_date)}</strong></div>
          </div>
        </div>

        {/* Customer */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '12px 14px',
            marginBottom: '14px',
            background: '#fafafa',
          }}
        >
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>לכבוד</div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{doc.customer_name_snapshot}</div>
          {doc.customer_tax_id_snapshot && (
            <div style={{ fontSize: '12px', marginTop: '2px' }}>
              ת״ז/ח.פ.: {doc.customer_tax_id_snapshot}
            </div>
          )}
          {doc.customer_address_snapshot && (
            <div style={{ fontSize: '12px', marginTop: '2px' }}>{doc.customer_address_snapshot}</div>
          )}
        </div>

        {/* Items */}
        <table className="print-table" style={{ marginBottom: '14px' }}>
          <thead>
            <tr>
              <th style={{ width: '50%' }}>תיאור</th>
              <th style={{ width: '12%' }}>כמות</th>
              <th style={{ width: '19%' }}>מחיר יח׳</th>
              <th style={{ width: '19%' }}>סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it: any) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td>{it.quantity}</td>
                <td>{formatCurrency(Number(it.unit_price))}</td>
                <td style={{ fontWeight: 600 }}>{formatCurrency(Number(it.line_total))}</td>
              </tr>
            ))}
            {(!items || items.length === 0) && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#6b7280' }}>
                  אין פריטים
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={3}
                style={{
                  background: brandColor,
                  color: 'white',
                  fontWeight: 700,
                  textAlign: 'right',
                }}
              >
                סה״כ לתשלום
              </td>
              <td
                style={{
                  background: brandColor,
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '15px',
                }}
              >
                {formatCurrency(totalNum)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Payments */}
        {payments && payments.length > 0 && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '12px 14px',
              marginBottom: '14px',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', color: brandColor }}>
              פרטי תשלום
            </div>
            {payments.map((p: any) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  borderBottom: '1px dashed #e5e7eb',
                  padding: '6px 0',
                }}
              >
                <span>
                  {paymentMethodLabel[p.method] ?? p.method}
                  {p.card_last4 ? ` (${p.card_last4})` : ''}
                  {p.auth_code ? ` · אסמכתה: ${p.auth_code}` : ''}
                </span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(Number(p.amount))}</span>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {doc.notes && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '12px 14px',
              marginBottom: '14px',
              fontSize: '13px',
              whiteSpace: 'pre-wrap',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '4px', color: brandColor }}>הערות</div>
            {doc.notes}
          </div>
        )}

        {/* Signature */}
        {signatureUrl && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginTop: '24px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="signature"
                style={{ maxHeight: '70px', maxWidth: '200px', objectFit: 'contain' }}
              />
              <div style={{ fontSize: '11px', color: '#6b7280', borderTop: '1px solid #d1d5db', paddingTop: '4px', marginTop: '4px' }}>
                חתימה
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {invoiceFooter && (
          <div
            style={{
              marginTop: '28px',
              paddingTop: '12px',
              borderTop: '1px solid #e5e7eb',
              fontSize: '11px',
              color: '#6b7280',
              whiteSpace: 'pre-wrap',
              textAlign: 'center',
            }}
          >
            {invoiceFooter}
          </div>
        )}
      </div>

      <PrintTrigger />
    </div>
  );
}
