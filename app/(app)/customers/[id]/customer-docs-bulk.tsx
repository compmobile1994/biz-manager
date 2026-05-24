'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Send, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { documentTypeLabel, formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface DocRow {
  id: string;
  number: number;
  document_type: string;
  issue_date: string;
  total: number;
  status: string;
  sent_at: string | null;
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
      const ids = Array.from(selected);
      const count = ids.length;
      const firstSendIds = ids.filter((id) => {
        const d = docs.find((x) => x.id === id);
        return d && !d.sent_at;
      });

      // Merge server-side into ONE PDF, then share that single file via
      // Web Share API. Clean Hebrew message + merged Hebrew-named file.
      const mergeRes = await fetch('/api/documents/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ids, copyMode: 'auto' }),
      });
      if (!mergeRes.ok) {
        const errJson = await mergeRes.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'איחוד הקבלות נכשל', description: (errJson as any)?.error ?? `HTTP ${mergeRes.status}` });
        return;
      }
      const mergedBlob = await mergeRes.blob();
      // ASCII filename — Hebrew filenames cause Android Chrome's canShare()
      // to return false (silently!), which would drop us into the wa.me +
      // URL fallback. ASCII keeps the file going as a real attachment.
      const singleNumber = docs.find((d) => d.id === ids[0])?.number;
      const filename = count === 1 ? `Kabala-${singleNumber}.pdf` : `Kabalot-${count}.pdf`;
      const mergedFile = new File([mergedBlob], filename, { type: 'application/pdf' });

      const message =
        `היי ${customerName},\n` +
        (count === 1 ? `מצורפת קבלה` : `מצורפות ${count} קבלות`) + `\n` +
        `מ-${businessName}.`;

      async function markFirstSendsAsSent() {
        if (firstSendIds.length === 0) return;
        try {
          const supabase = createClient();
          const nowIso = new Date().toISOString();
          await supabase
            .from('documents')
            .update({ sent_at: nowIso, sent_via: 'whatsapp' })
            .in('id', firstSendIds)
            .is('sent_at', null);
        } catch {
          // non-fatal
        }
      }

      const navAny = navigator as any;
      const canShareFile = navAny.canShare && navAny.canShare({ files: [mergedFile] });
      if (canShareFile) {
        try {
          await navAny.share({ files: [mergedFile], text: message, title: filename });
          await markFirstSendsAsSent();
          toast({ title: `${count} קבלות נשלחו` });
          clearAll();
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return;
        }
      }

      // Desktop fallback: mint a short link, open WhatsApp Web with msg + link
      const linkRes = await fetch('/api/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ids, copyMode: 'auto' }),
      });
      if (linkRes.ok) {
        const { url: shortUrl } = (await linkRes.json()) as { url: string };
        const phone = customerPhone ? customerPhone.replace(/\D/g, '').replace(/^0/, '972') : '';
        const wa = phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(message + '\n\n' + shortUrl)}`
          : `https://wa.me/?text=${encodeURIComponent(message + '\n\n' + shortUrl)}`;
        window.open(wa, '_blank');
        await markFirstSendsAsSent();
        toast({ title: `${count} קבלות מוכנות לשליחה ב-WhatsApp` });
        clearAll();
      } else {
        toast({ variant: 'destructive', title: 'שגיאה — נסה שוב' });
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
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
                    {documentTypeLabel[d.document_type]} {d.number}
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
