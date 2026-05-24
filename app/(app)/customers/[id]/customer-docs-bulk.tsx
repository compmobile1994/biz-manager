'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Send, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { documentTypeLabel, formatCurrency, formatDate } from '@/lib/utils';

interface DocRow {
  id: string;
  number: number;
  document_type: string;
  issue_date: string;
  total: number;
  status: string;
}

interface Props {
  docs: DocRow[];
  customerName: string;
  customerPhone: string | null;
  businessName: string;
}

// Bulk-send UI for the customer detail page.
//
// Lets the user tick multiple receipts of THIS customer and ship them all
// at once via WhatsApp using the Web Share API (which supports multiple
// File objects in a single share() call). Falls back to a wa.me link that
// lists all the PDF URLs if Web Share isn't available (older browsers /
// non-PWA Chrome on desktop).
export function CustomerDocsBulk({ docs, customerName, customerPhone, businessName }: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    // Only documents that aren't cancelled (cancelled receipts shouldn't be re-sent)
    const all = docs.filter((d) => d.status !== 'cancelled').map((d) => d.id);
    setSelected(new Set(all));
  }
  function clearAll() {
    setSelected(new Set());
  }

  async function shareSelected() {
    if (selected.size === 0) {
      toast({ variant: 'destructive', title: 'לא נבחרו קבלות' });
      return;
    }
    setSending(true);
    try {
      // Resolve a signed URL for every selected document. We use the existing
      // regenerate-pdf endpoint? No — we just need the current pdf_url. Fetch
      // them via the API. Simpler: fetch via our own /api/documents/{id}/pdf-url
      // endpoint... but that doesn't exist. Use the storage-signed URL the
      // detail-page server already builds.
      //
      // Easiest: hit the storage endpoint via Supabase JS — but that's server-
      // side. From the client we go through /api/documents/[id]/pdf-blob (new).
      const files: File[] = [];
      const urls: string[] = [];
      for (const id of selected) {
        const doc = docs.find((d) => d.id === id);
        if (!doc) continue;
        const res = await fetch(`/api/documents/${id}/pdf`, { credentials: 'same-origin' });
        if (!res.ok) {
          toast({ variant: 'destructive', title: `קבלה #${doc.number} לא נטענה` });
          continue;
        }
        const blob = await res.blob();
        // ASCII-only filename — WhatsApp / Android file picker mangle
        // Hebrew chars in attachment names. Keep it simple: receipt-180.pdf.
        const asciiType =
          doc.document_type === 'invoice' ? 'invoice' :
          doc.document_type === 'invoice_receipt' ? 'invoice-receipt' :
          doc.document_type === 'credit' ? 'credit' : 'receipt';
        const filename = `${asciiType}-${doc.number}.pdf`;
        files.push(new File([blob], filename, { type: 'application/pdf' }));
        const signedUrl = res.headers.get('x-pdf-url');
        if (signedUrl) urls.push(signedUrl);
      }

      const message =
        `היי ${customerName},\n` +
        `מצורפות ${files.length} קבלות\n` +
        `מ-${businessName}.`;

      const navAny = navigator as any;
      if (files.length > 0 && navAny.canShare && navAny.canShare({ files })) {
        await navAny.share({ files, text: message, title: `קבלות מ-${businessName}` });
        toast({ title: `${files.length} קבלות נשלחו` });
        clearAll();
        return;
      }

      // Fallback — open WhatsApp with the message + each URL on its own line
      const phone = customerPhone ? customerPhone.replace(/\D/g, '').replace(/^0/, '972') : '';
      const text = encodeURIComponent(message + '\n\n' + urls.join('\n'));
      const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
      window.open(url, '_blank');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e?.message ?? '' });
    } finally {
      setSending(false);
    }
  }

  const eligibleCount = docs.filter((d) => d.status !== 'cancelled').length;

  if (docs.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={selectAll}>
          <CheckSquare className="h-4 w-4" />
          בחר הכל ({eligibleCount})
        </Button>
        {selected.size > 0 && (
          <Button variant="outline" size="sm" onClick={clearAll}>
            <Square className="h-4 w-4" />
            נקה
          </Button>
        )}
        <Button
          size="sm"
          onClick={shareSelected}
          disabled={sending || selected.size === 0}
          className="bg-green-600 hover:bg-green-700"
        >
          <Send className="h-4 w-4" />
          {sending ? 'שולח...' : `שלח ${selected.size > 0 ? selected.size + ' ' : ''}קבלות ב-WhatsApp`}
        </Button>
      </div>

      <div className="divide-y border rounded-md">
        {docs.map((d) => {
          const isCancelled = d.status === 'cancelled';
          const checked = selected.has(d.id);
          return (
            <div key={d.id} className="flex items-center gap-3 p-3 hover:bg-accent/30">
              <input
                type="checkbox"
                className="h-5 w-5 cursor-pointer accent-blue-600 disabled:opacity-30"
                checked={checked}
                disabled={isCancelled}
                onChange={() => toggle(d.id)}
                aria-label={`בחר קבלה ${d.number}`}
              />
              <Link href={`/documents/${d.id}`} className="flex-1 flex items-center justify-between">
                <div>
                  <p className="font-semibold">
                    {documentTypeLabel[d.document_type]} #{d.number}
                    {isCancelled && <span className="text-destructive text-xs mr-2">(בוטל)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(d.issue_date)}</p>
                </div>
                <span className={isCancelled ? 'line-through text-muted-foreground' : 'font-semibold'}>
                  {formatCurrency(Number(d.total))}
                </span>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
