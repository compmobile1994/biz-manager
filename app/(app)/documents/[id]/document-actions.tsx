'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Mail, MessageCircle, Send, Phone, RefreshCw, Smartphone, Landmark, Copy, XCircle } from 'lucide-react';
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
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [emailDialog, setEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState(customerEmail ?? '');
  const [smsTo, setSmsTo] = useState(customerPhone ?? '');
  const [smsDialog, setSmsDialog] = useState(false);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
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
    // Slight delay so the UI settles before the popup
    setTimeout(() => shareWhatsApp(), 300);
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

  const docTitle = `${documentTypeLabel[docType]} #${documentNumber}`;

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

  async function shareWhatsApp() {
    if (!pdfUrl) {
      toast({ variant: 'destructive', title: 'PDF טרם נוצר' });
      return;
    }

    // Short, clean Hebrew message — no emojis (they render as junk
    // characters in some WhatsApp/SMS receivers), no business name spam,
    // no bank/Bit info (those have their own buttons). docTitle already
    // contains "קבלה #185" so we don't repeat the number.
    const message =
      `היי ${customerName},\n` +
      `מצורפת ${docTitle}\n` +
      `מ-${businessName}.`;

    // Try the modern Web Share API first — attaches the actual PDF as a
    // file together with the short Hebrew note. Works on Android Chrome
    // PWA and recent iOS Safari.
    try {
      const res = await fetch(pdfUrl);
      if (res.ok) {
        const blob = await res.blob();
        // ASCII-only filename for the shared file — WhatsApp + some Android/
        // iOS file pickers mangle Hebrew characters in attachment names,
        // making the file look like gibberish to the recipient.
        // The user can still see the doc type + number; the Hebrew context
        // goes in the share `text` instead.
        const asciiType =
          docType === 'invoice' ? 'invoice' :
          docType === 'invoice_receipt' ? 'invoice-receipt' :
          docType === 'credit' ? 'credit' : 'receipt';
        const filename = `${asciiType}-${documentNumber}.pdf`;
        const file = new File([blob], filename, { type: 'application/pdf' });
        const navAny = navigator as any;
        if (navAny.canShare && navAny.canShare({ files: [file] })) {
          await navAny.share({ files: [file], text: message, title: filename });
          return;
        }
      }
    } catch {
      // Fall through to the wa.me link below
    }

    // Fallback: open WhatsApp with the short message + PDF URL on its own
    // line so the link is clearly tap-able.
    const phone = customerPhone ? customerPhone.replace(/\D/g, '').replace(/^0/, '972') : '';
    const msg = encodeURIComponent(message + '\n' + pdfUrl);
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
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

  async function sendSms() {
    if (!smsTo) return toast({ variant: 'destructive', title: 'יש להזין מספר טלפון' });
    if (!pdfUrl) return toast({ variant: 'destructive', title: 'PDF טרם נוצר' });
    const msg = `${docTitle} מ-${businessName}: ${pdfUrl}`;
    const url = `sms:${smsTo}?&body=${encodeURIComponent(msg)}`;
    window.location.href = url;
    setSmsDialog(false);
  }

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
            <Button variant="outline" size="sm" onClick={shareWhatsApp}>
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={shareBitRequest}>
              <Smartphone className="h-4 w-4" />
              בקשת ביט
            </Button>
            <Button variant="outline" size="sm" onClick={shareBankTransferRequest}>
              <Landmark className="h-4 w-4" />
              בקשת העברה
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSmsDialog(true)}>
              <Phone className="h-4 w-4" />
              SMS
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

      {smsDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSmsDialog(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-4">
              <h3 className="font-bold text-lg">שליחה ב-SMS</h3>
              <div className="space-y-1.5">
                <Label>מספר טלפון</Label>
                <Input type="tel" value={smsTo} onChange={(e) => setSmsTo(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                ייפתח אפליקציית ההודעות במכשיר עם הטקסט מוכן לשליחה.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSmsDialog(false)}>ביטול</Button>
                <Button onClick={sendSms}>פתח SMS</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
