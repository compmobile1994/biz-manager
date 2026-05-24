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
// Flow (when we have a customer phone — the common case):
//   1. User picks receipts, taps "שלח X קבלות ב-WhatsApp"
//   2. We immediately grab a popup window with about:blank (uses the
//      user's gesture so WhatsApp won't be blocked by popup blocker).
//   3. We merge the selected PDFs server-side and download the result
//      into the device's Downloads folder.
//   4. We redirect the popup to wa.me/<customerPhone>?text=... —
//      WhatsApp opens directly in the customer's chat with a clean
//      pre-filled message (no URL, no contact-picker friction).
//   5. User taps the paperclip in WhatsApp and attaches the just-
//      downloaded PDF. One tap to send.
//
// Fallback (no customer phone): keep the Web Share API path which uses
// the OS share sheet so the user can pick any chat.
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
    const all = docs.filter((d) => d.status !== 'cancelled').map((d) => d.id);
    setSelected(new Set(all));
  }
  function clearAll() {
    setSelected(new Set());
  }

  async function markFirstSendsAsSent(firstSendIds: string[]) {
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

  async function sendBulk() {
    if (selected.size === 0) {
      toast({ variant: 'destructive', title: 'לא נבחרו קבלות' });
      return;
    }

    // CRITICAL: grab the popup window NOW, inside the click handler,
    // before any await. Browsers only allow window.open() to bypass
    // popup blockers when invoked from a user gesture; the later
    // async fetch would otherwise lose that permission.
    const popup = customerPhone ? window.open('about:blank', '_blank') : null;

    setSending(true);
    try {
      const ids = Array.from(selected);
      const count = ids.length;
      const firstSendIds = ids.filter((id) => {
        const d = docs.find((x) => x.id === id);
        return d && !d.sent_at;
      });

      const mergeRes = await fetch('/api/documents/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ids, copyMode: 'auto' }),
      });
      if (!mergeRes.ok) {
        if (popup) popup.close();
        const errJson = await mergeRes.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'איחוד הקבלות נכשל', description: (errJson as any)?.error ?? `HTTP ${mergeRes.status}` });
        return;
      }
      const mergedBlob = await mergeRes.blob();
      const singleNumber = docs.find((d) => d.id === ids[0])?.number;
      const filename = count === 1 ? `Kabala-${singleNumber}.pdf` : `Kabalot-${count}.pdf`;

      // User-set message (no name, no hyphen, no period — see commit log).
      const message =
        `היי\n` +
        `מצורף קבלה\n` +
        `מ${businessName}`;

      // PATH A — we have a phone, run the hybrid: download + auto-open chat.
      if (customerPhone && popup) {
        // 1. Trigger device download of the merged PDF
        const objUrl = URL.createObjectURL(mergedBlob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Hold the object URL long enough for the download to start, then revoke.
        setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);

        // 2. Redirect the popup we grabbed earlier to WhatsApp directly.
        const phone = customerPhone.replace(/\D/g, '').replace(/^0/, '972');
        const wa = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        popup.location.href = wa;

        await markFirstSendsAsSent(firstSendIds);
        toast({
          title: `${count} קבלות מוכנות`,
          description: `📎 בוואטסאפ — לחץ על המהדק וצרף את ${filename}`,
        });
        clearAll();
        return;
      }

      // PATH B — no phone available, fall back to Web Share API so the
      // user can pick any chat. The file still attaches as a real file.
      const mergedFile = new File([mergedBlob], filename, { type: 'application/pdf' });
      const navAny = navigator as any;
      const hasShare = typeof navAny.share === 'function';
      if (hasShare) {
        try {
          await navAny.share({ files: [mergedFile], text: message, title: filename });
          await markFirstSendsAsSent(firstSendIds);
          toast({ title: `${count} קבלות נשלחו` });
          clearAll();
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return;
          toast({
            variant: 'destructive',
            title: 'השיתוף נכשל',
            description: shareErr?.message ?? shareErr?.name ?? 'נסה שוב',
          });
        }
        return;
      }

      // Last-resort fallback (no phone, no Web Share): wa.me + short link.
      const linkRes = await fetch('/api/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ids, copyMode: 'auto' }),
      });
      if (linkRes.ok) {
        const { url: shortUrl } = (await linkRes.json()) as { url: string };
        const wa = `https://wa.me/?text=${encodeURIComponent(message + '\n\n' + shortUrl)}`;
        window.open(wa, '_blank');
        await markFirstSendsAsSent(firstSendIds);
        toast({ title: `${count} קבלות מוכנות לשליחה ב-WhatsApp` });
        clearAll();
      } else {
        toast({ variant: 'destructive', title: 'שגיאה — נסה שוב' });
      }
    } catch (e: any) {
      if (popup) popup.close();
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
          onClick={sendBulk}
          disabled={sending || selected.size === 0}
          className="bg-green-600 hover:bg-green-700"
        >
          <Send className="h-4 w-4" />
          {sending ? 'מכין...' : `שלח ${selected.size > 0 ? selected.size + ' ' : ''}קבלות ב-WhatsApp`}
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
