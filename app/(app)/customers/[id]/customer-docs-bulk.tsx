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
// Two-step flow because of Web Share API gesture constraints:
//   Step 1 (אסוף ושלח): the user clicks the prepare button. We merge the
//     selected receipts server-side into a single PDF and store it in
//     state along with the message text. NO call to navigator.share here.
//   Step 2 (שתף עכשיו): the prepared button replaces the prepare button.
//     The user clicks it and we call navigator.share() synchronously from
//     the click handler — no awaits, so the browser still sees this as
//     "handling a user gesture" and actually opens the share sheet.
//
// We can't do this in one click because the merge fetch takes a few
// hundred ms and Chrome on Android rejects share() if there's any async
// gap between the click and the share() call.
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
    // Selection changed — invalidate any previously-prepared bundle so we
    // don't share an outdated set of receipts.
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

  // STEP 1: merge server-side and stash the file in state.
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
      const singleNumber = docs.find((d) => d.id === ids[0])?.number;
      const filename = count === 1 ? `Kabala-${singleNumber}.pdf` : `Kabalot-${count}.pdf`;
      const mergedFile = new File([mergedBlob], filename, { type: 'application/pdf' });

      // User-set exact wording — 3 short lines, no customer name, no hyphen,
      // no period. Same text for single or bulk — the merged file is
      // shipped as one PDF either way.
      const message =
        `היי\n` +
        `מצורף קבלה\n` +
        `מ${businessName}`;

      setPrepared({ file: mergedFile, message, filename, ids, firstSendIds, count });

      // If this device has no Web Share API at all (desktop), bypass the
      // 2-click pattern entirely — there's nothing to share to anyway.
      // Mint a short link and pop WhatsApp Web like before.
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
        // Mobile — tell the user to tap the green "שתף עכשיו" button now
        toast({ title: 'מוכן — לחץ "שתף עכשיו"' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e?.message ?? '' });
    } finally {
      setPreparing(false);
    }
  }

  // STEP 2: synchronous click handler — no awaits before share(). This is
  // what makes Chrome on Android happy: it sees the share() call as being
  // inside an active user gesture and actually opens the share sheet.
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
          // STEP 2 BUTTON — synchronous click → share()
          <Button
            size="sm"
            onClick={shareNow}
            className="bg-green-600 hover:bg-green-700 animate-pulse"
            title="לחץ עכשיו כדי לפתוח את WhatsApp"
          >
            <Share2 className="h-4 w-4" />
            שתף עכשיו ({prepared.count})
          </Button>
        ) : (
          // STEP 1 BUTTON — prepare merge
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
