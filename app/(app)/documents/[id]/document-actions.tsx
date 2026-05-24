'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Mail, MessageCircle, Send, RefreshCw, Smartphone, Landmark, Copy, XCircle, Share2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { documentTypeLabel } from '@/lib/utils';

export function DocumentActions({
  docId,
  pdfUrl,
  customerEmail,
  customerPhone,
  businessName,
  businessPhone,
  businessBankName,
  businessBankBranch,
  businessBankAccount,
  businessOwnerName,
  documentNumber,
  docType,
  docTotal,
  customerName,
  status,
  sentAt,
}: {
  docId: string;
  pdfUrl: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  businessName: string;
  businessPhone: string | null;
  businessBankName: string | null;
  businessBankBranch: string | null;
  businessBankAccount: string | null;
  businessOwnerName: string | null;
  documentNumber: number;
  docType: string;
  docTotal: number;
  customerName: string;
  status: string;
  // null = never sent → first share uses the "מקור" from storage and we
  // record the timestamp. non-null = re-send → share a fresh "נאמן למקור".
  sentAt: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [emailDialog, setEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState(customerEmail ?? '');
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Separate loading state for the WhatsApp button so the icon spins +
  // button disables instantly on tap — user feedback that the share is
  // actually being prepared (PDF fetch can take a second or two).
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  // Two-step prep for Web Share. After step 1 the PDF blob is stashed
  // here; the green "שתף עכשיו" button calls share() synchronously from
  // its click handler so the browser doesn't reject for losing the user
  // gesture across our network fetch.
  const [preparedShare, setPreparedShare] = useState<{
    file: File;
    message: string;
    filename: string;
    wasFirstSend: boolean;
  } | null>(null);
  // Local mirror of sent_at — flipped to "now" on the first successful share
  // so the next share (in the same session) correctly picks "נאמן למקור".
  const [localSentAt, setLocalSentAt] = useState<string | null>(sentAt);
  const autoTriggered = useRef(false);

  // If we landed here with ?action=whatsapp (set by the "issue + send" button
  // on the form), automatically open the WhatsApp share flow once the PDF
  // URL is available. Guarded so we only run once per page load.
  useEffect(() => {
    if (autoTriggered.current) return;
    if (searchParams.get('action') !== 'whatsapp') return;
    if (!pdfUrl) return;
    autoTriggered.current = true;
    // Strip the ?action=whatsapp so a refresh doesn't fire it again
    router.replace(`/documents/${docId}`);
    // Slight delay so the UI settles before we start preparing
    setTimeout(() => prepareShare(), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, searchParams]);

  async function cancelDoc() {
    if (
      !confirm(
        `לבטל את ${docTitle}?\n\n` +
          `הקבלה תישאר במערכת אבל תסומן כ"בוטל" - לא ניתן למחוק קבלות לפי חוק.\n` +
          `המספור הרץ נשמר (הקבלה הבאה תהיה #${documentNumber + 1} כרגיל).\n\n` +
          `להמשיך?`,
      )
    ) return;
    try {
      const supabase = createClient();
      // Call the dedicated RPC instead of a direct UPDATE. The RPC enforces
      // status='issued' → 'cancelled' only, so a buggy/double-tap UPDATE can
      // never accidentally un-cancel a doc or mutate other columns.
      const { error } = await supabase.rpc('cancel_document', { p_id: docId });
      if (error) throw error;
      toast({ title: 'הקבלה בוטלה' });
      router.refresh();
    } catch (e: any) {
      const raw = (e?.message ?? '').toLowerCase();
      const msg =
        raw.includes('cannot cancel') ? 'הקבלה כבר בוטלה' :
        raw.includes('forbidden') ? 'אין הרשאה' :
        raw.includes('not found') ? 'הקבלה לא נמצאה' :
        e?.message ?? 'שגיאה לא ידועה';
      toast({ variant: 'destructive', title: 'שגיאה', description: msg });
    }
  }

  async function regeneratePdf() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/documents/${docId}/regenerate-pdf`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'נכשל');
      toast({ title: 'PDF נוצר מחדש', description: 'רענן את הדף' });
      router.refresh();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message });
    } finally {
      setRegenerating(false);
    }
  }

  // Plain "קבלה 185" (no # prefix) — user prefers it this way for messages
  // and toast titles. The PDF itself shows "קבלה מספר 185" in its band.
  const docTitle = `${documentTypeLabel[docType]} ${documentNumber}`;

  async function sendEmail(provider: 'smtp' | 'gmail' | 'resend') {
    if (!emailTo) return toast({ variant: 'destructive', title: 'יש להזין דוא״ל' });
    setSending(true);
    try {
      const res = await fetch(`/api/email/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId, to: emailTo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'נכשל');
      toast({ title: 'נשלח בהצלחה', description: `${docTitle} נשלח ל-${emailTo}` });
      setEmailDialog(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message });
    } finally {
      setSending(false);
    }
  }

  // STEP 1: fetch the PDF and stash it. No call to navigator.share() here —
  // it would throw on Android Chrome because the user gesture is gone by
  // the time the fetch resolves.
  async function prepareShare() {
    if (sharingWhatsapp) return;
    if (!pdfUrl) {
      toast({ variant: 'destructive', title: 'PDF טרם נוצר' });
      return;
    }
    setSharingWhatsapp(true);

    // User-set exact wording — 3 short lines, with customer name on greeting
    // and the receipt number after "מצורף קבלה".
    const message =
      `היי ${customerName}\n` +
      `מצורף קבלה ${documentNumber}\n` +
      `מ${businessName}`;

    const isFirstSend = !localSentAt;
    const sourceUrl = isFirstSend
      ? pdfUrl                                // direct signed storage URL ("מקור")
      : `/api/documents/${docId}/pdf-copy`;   // inline "נאמן למקור"

    const navAny = navigator as any;
    const hasShare = typeof navAny.share === 'function';

    try {
      // Desktop (no Web Share API): straight to wa.me + short link.
      if (!hasShare) {
        const linkRes = await fetch('/api/share-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ids: [docId], copyMode: isFirstSend ? 'original' : 'copy' }),
        });
        if (linkRes.ok) {
          const { url: shortUrl } = (await linkRes.json()) as { url: string };
          const phone = customerPhone ? customerPhone.replace(/\D/g, '').replace(/^0/, '972') : '';
          const fallbackMsg = encodeURIComponent(message + '\n\n' + shortUrl);
          const wa = phone ? `https://wa.me/${phone}?text=${fallbackMsg}` : `https://wa.me/?text=${fallbackMsg}`;
          window.open(wa, '_blank');
          if (isFirstSend) await markSent('whatsapp');
        } else {
          toast({ variant: 'destructive', title: 'שגיאה — נסה שוב' });
        }
        return;
      }

      // Mobile — fetch the PDF and stash it. The user will click the green
      // "שתף עכשיו" button next, and THAT click handler calls share() with
      // no awaits in between so Chrome's user-gesture check passes.
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error(`PDF fetch failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const asciiType =
        docType === 'invoice' ? 'Invoice' :
        docType === 'invoice_receipt' ? 'Invoice-Receipt' :
        docType === 'credit' ? 'Credit' : 'Kabala';
      const filename = `${asciiType}-${documentNumber}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });
      setPreparedShare({ file, message, filename, wasFirstSend: isFirstSend });
      toast({ title: 'מוכן — לחץ "שתף עכשיו"' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e?.message ?? '' });
    } finally {
      setSharingWhatsapp(false);
    }
  }

  // STEP 2: synchronous click handler — no awaits before share().
  function shareNow() {
    if (!preparedShare) return;
    const { file, message, filename, wasFirstSend } = preparedShare;
    const navAny = navigator as any;
    navAny.share({ files: [file], text: message, title: filename })
      .then(async () => {
        if (wasFirstSend) await markSent('whatsapp');
        setPreparedShare(null);
      })
      .catch((shareErr: any) => {
        if (shareErr?.name === 'AbortError') return;
        toast({
          variant: 'destructive',
          title: 'השיתוף נכשל',
          description: shareErr?.message ?? shareErr?.name ?? 'נסה שוב',
        });
      });
  }

  // Record that the document was sent (first time only). The server-side
  // unique field is `sent_at`; we only set it if it's still null so we
  // preserve the original send timestamp across multiple re-sends.
  async function markSent(via: string) {
    if (localSentAt) return;
    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('documents')
        .update({ sent_at: nowIso, sent_via: via })
        .eq('id', docId)
        .is('sent_at', null); // race-safe: only the first call wins
      if (!error) setLocalSentAt(nowIso);
    } catch {
      // Non-fatal — re-send logic just won't switch to "נאמן למקור" until
      // the user reloads the page.
    }
  }

  function shareBitRequest() {
    if (!businessPhone) {
      toast({
        variant: 'destructive',
        title: 'חסר מספר טלפון',
        description: 'הוסף טלפון של העסק בהגדרות כדי לשלוח בקשת ביט',
      });
      return;
    }
    const cleanPhone = businessPhone.replace(/\D/g, '');
    const formattedAmount = new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 2,
    }).format(docTotal);

    const text = `היי ${customerName} 👋

לתשלום של ${formattedAmount} בביט:
📱 ${businessPhone}
👤 ${businessName}

תודה רבה! 🙏`;

    const msg = encodeURIComponent(text);
    const phone = customerPhone ? customerPhone.replace(/\D/g, '').replace(/^0/, '972') : '';
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  }

  function shareBankTransferRequest() {
    if (!businessBankAccount || !businessBankName) {
      toast({
        variant: 'destructive',
        title: 'חסרים פרטי בנק',
        description: 'הוסף שם בנק ומספר חשבון בהגדרות (הם לא מוצגים בקבלה - רק נשלחים ב-WhatsApp)',
      });
      return;
    }
    const formattedAmount = new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 2,
    }).format(docTotal);
    const accountOwner = businessOwnerName || businessName;

    const lines = [
      `היי ${customerName} 👋`,
      ``,
      `לתשלום של ${formattedAmount} בהעברה בנקאית:`,
      `🏦 ${businessBankName}`,
    ];
    if (businessBankBranch) lines.push(`📍 סניף: ${businessBankBranch}`);
    lines.push(`💳 חשבון: ${businessBankAccount}`);
    lines.push(`👤 על שם: ${accountOwner}`);
    lines.push('');
    lines.push('תודה רבה! 🙏');

    const msg = encodeURIComponent(lines.join('\n'));
    const phone = customerPhone ? customerPhone.replace(/\D/g, '').replace(/^0/, '972') : '';
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  }

  // SMS send was removed at the user's request — WhatsApp covers their
  // use case and SMS doesn't support file attachments anyway, only links.

  const isCancelled = status === 'cancelled';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              הורד PDF
            </Button>
          </a>
        ) : (
          <Button variant="default" size="sm" onClick={regeneratePdf} disabled={regenerating}>
            <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? 'יוצר…' : 'צור PDF עכשיו'}
          </Button>
        )}
        {/*
          A cancelled receipt should never be re-sent to a customer — it's
          legally void. Hide all "send" actions and keep only the download
          + duplicate. The cancel button itself was already hidden via the
          existing `status !== 'cancelled'` guard.
        */}
        {!isCancelled && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEmailDialog(true)}>
              <Mail className="h-4 w-4" />
              שלח במייל
            </Button>
            {preparedShare ? (
              // STEP 2 — synchronous click → share()
              <Button
                size="sm"
                onClick={shareNow}
                className="bg-green-600 hover:bg-green-700 animate-pulse"
                title="לחץ עכשיו כדי לפתוח את תפריט השיתוף"
              >
                <Share2 className="h-4 w-4" />
                שתף עכשיו
              </Button>
            ) : (
              // STEP 1 — prepare the PDF
              <Button variant="outline" size="sm" onClick={prepareShare} disabled={sharingWhatsapp}>
                <MessageCircle className={`h-4 w-4 ${sharingWhatsapp ? 'animate-pulse' : ''}`} />
                {sharingWhatsapp ? 'מכין...' : 'WhatsApp'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={shareBitRequest}>
              <Smartphone className="h-4 w-4" />
              בקשת ביט
            </Button>
            <Button variant="outline" size="sm" onClick={shareBankTransferRequest}>
              <Landmark className="h-4 w-4" />
              בקשת העברה
            </Button>
          </>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={() => router.push(`/documents/new?duplicate=${docId}`)}
          title="צור קבלה חדשה עם אותם פרטים (אותו לקוח, אותם פריטים)"
        >
          <Copy className="h-4 w-4" />
          שכפל קבלה
        </Button>
        {!isCancelled && (
          <Button
            variant="destructive"
            size="sm"
            onClick={cancelDoc}
            title="סמן את הקבלה כבוטלת (לא נמחקת - מסומנת בלבד)"
          >
            <XCircle className="h-4 w-4" />
            בטל קבלה
          </Button>
        )}
      </div>

      {emailDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEmailDialog(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-4">
              <h3 className="font-bold text-lg">שליחת המסמך במייל</h3>
              <div className="space-y-1.5">
                <Label>כתובת דוא״ל</Label>
                <Input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
              </div>
              <div className="space-y-2 pt-2">
                <Button onClick={() => sendEmail('smtp')} disabled={sending} className="w-full">
                  <Send className="h-4 w-4" />
                  שלח מהמייל שלי (Gmail)
                </Button>
                <Button variant="outline" onClick={() => sendEmail('resend')} disabled={sending} className="w-full">
                  שלח דרך Resend (גיבוי)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                "שלח מהמייל שלי" - הלקוח יראה את המייל מגיע מהמייל העסקי שלך.
                "Resend" - שליחה דרך שירות חיצוני (אם Gmail לא מוגדר).
              </p>
            </CardContent>
          </Card>
        </div>
      )}

    </>
  );
}
