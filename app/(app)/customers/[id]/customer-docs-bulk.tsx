'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Send, CheckSquare, Square, Share2 } from 'lucide-react';
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
// Two-step flow (reverted from the auto-target hybrid at user request —
// the auto-open path caused popup-block / wrong-chat issues; user
// prefers the share sheet because the file definitely attaches and
// they can pick the right contact themselves):
//   Step 1 (הכן): we merge the selected receipts server-side into a
//     single PDF and stash the File in component state. No share()
//     call yet — that would lose Chrome's user-gesture lock.
//   Step 2 (שתף עכשיו): the button swaps to a pulsing green one whose
//     click handler calls navigator.share() synchronously, no awaits
//     before it. Chrome still sees the gesture as active so the share
//     sheet opens with the merged PDF as a real attachment.
export function CustomerDocsBulk({ docs, customerName, customerPhone, businessName }: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<{
    file: File;
    message: string;
    filename: string;
    ids: string[];
    firstSendIds: string[];
    count: number;
  } | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Selection changed — invalidate any previously prepared bundle so we
    // never share a stale file set.
    setPrepared(null);
  }

  function selectAll() {
    const all = docs.filter((d) => d.status !== 'cancelled').map((d) => d.id);
    setSelected(new Set(all));
    setPrepared(null);
  }
  function clearAll() {
    setSelected(new Set());
    setPrepared(null);
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

  // STEP 1: merge server-side and stash the file.
  async function prepareSelected() {
    if (selected.size === 0) {
      toast({ variant: 'destructive', title: 'לא נבחרו קבלות' });
      return;
    }
    setPreparing(true);
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
        const errJson = await mergeRes.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'איחוד הקבלות נכשל', description: (errJson as any)?.error ?? `HTTP ${mergeRes.status}` });
        return;
      }
      const mergedBlob = await mergeRes.blob();
      // Compute the sorted receipt numbers once — used for both the
      // ASCII filename and the WhatsApp message body.
      const numbers = ids
        .map((id) => docs.find((d) => d.id === id)?.number)
        .filter((n): n is number => typeof n === 'number')
        .sort((a, b) => a - b);
      // ASCII filename — Hebrew filenames cause Android Chrome's
      // canShare/share to misbehave silently. Numbers join with "-".
      //   1 receipt  → "Kabala-185.pdf"
      //   2+         → "Kabalot-178-186.pdf"
      const filename = numbers.length === 1
        ? `Kabala-${numbers[0]}.pdf`
        : `Kabalot-${numbers.join('-')}.pdf`;
      const mergedFile = new File([mergedBlob], filename, { type: 'application/pdf' });

      // User-set exact wording — 3 short lines, with customer name on greeting
      // and receipt numbers (+ count when >1):
      //   1 receipt  → "קיבלת קבלה מספר 185"
      //   2 receipts → "קיבלת 2 קבלות מספר 178 ו-186"
      //   3+ receipts → "קיבלת 3 קבלות מספר 178, 185 ו-186"
      let numbersStr: string;
      if (numbers.length <= 1) {
        numbersStr = numbers[0]?.toString() ?? '';
      } else if (numbers.length === 2) {
        numbersStr = `${numbers[0]} ו-${numbers[1]}`;
      } else {
        const last = numbers[numbers.length - 1];
        numbersStr = `${numbers.slice(0, -1).join(', ')} ו-${last}`;
      }
      const middle = count === 1
        ? `קיבלת קבלה מספר ${numbersStr}`
        : `קיבלת ${count} קבלות מספר ${numbersStr}`;
      const message =
        `שלום ${customerName}\n` +
        `${middle}\n` +
        `מ${businessName}`;

      setPrepared({ file: mergedFile, message, filename, ids, firstSendIds, count });

      // Desktop (no Web Share API): bypass the 2-click pattern entirely —
      // mint a short link and open WhatsApp Web directly with it.
      const navAny = navigator as any;
      if (typeof navAny.share !== 'function') {
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
          await markFirstSendsAsSent(firstSendIds);
          toast({ title: `${count} קבלות מוכנות לשליחה ב-WhatsApp` });
          setPrepared(null);
          clearAll();
        } else {
          toast({ variant: 'destructive', title: 'שגיאה — נסה שוב' });
        }
      } else {
        toast({ title: 'מוכן — לחץ "שתף עכשיו"' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e?.message ?? '' });
    } finally {
      setPreparing(false);
    }
  }

  // STEP 2: synchronous click handler — no awaits before share().
  // Pure share() call only — matches yesterday's working version exactly.
  // If text doesn't appear in WhatsApp it's WhatsApp's behavior, not ours.
  function shareNow() {
    if (!prepared) return;
    const { file, message, filename, firstSendIds, count } = prepared;
    const navAny = navigator as any;
    navAny.share({ files: [file], text: message, title: filename })
      .then(async () => {
        await markFirstSendsAsSent(firstSendIds);
        toast({ title: `${count} קבלות נשלחו` });
        setPrepared(null);
        clearAll();
      })
      .catch((shareErr: any) => {
        if (shareErr?.name === 'AbortError') return; // user closed sheet
        toast({
          variant: 'destructive',
          title: 'השיתוף נכשל',
          description: shareErr?.message ?? shareErr?.name ?? 'נסה שוב',
        });
      });
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
        {prepared ? (
          // STEP 2 — synchronous click → share()
          <Button
            size="sm"
            onClick={shareNow}
            className="bg-green-600 hover:bg-green-700 animate-pulse"
            title="לחץ עכשיו כדי לפתוח את תפריט השיתוף"
          >
            <Share2 className="h-4 w-4" />
            שתף עכשיו ({prepared.count})
          </Button>
        ) : (
          // STEP 1 — prepare merge
          <Button
            size="sm"
            onClick={prepareSelected}
            disabled={preparing || selected.size === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            <Send className="h-4 w-4" />
            {preparing ? 'מכין...' : `הכן ${selected.size > 0 ? selected.size + ' ' : ''}קבלות לשליחה`}
          </Button>
        )}
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
