'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Mail, MessageCircle, Send, Phone, RefreshCw, Smartphone, Landmark, Copy } from 'lucide-react';
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
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [emailDialog, setEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState(customerEmail ?? '');
  const [smsTo, setSmsTo] = useState(customerPhone ?? '');
  const [smsDialog, setSmsDialog] = useState(false);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

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

  function shareWhatsApp() {
    if (!pdfUrl) {
      toast({ variant: 'destructive', title: 'PDF טרם נוצר' });
      return;
    }
    const formattedAmount = new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 2,
    }).format(docTotal);

    const lines = [
      `היי ${customerName} 👋`,
      ``,
      `מצורפת ${docTitle} מ-${businessName} בסך ${formattedAmount}:`,
      pdfUrl,
    ];

    if (businessPhone) {
      lines.push('');
      lines.push(`💳 לתשלום בביט:`);
      lines.push(`📱 ${businessPhone}`);
      lines.push(`👤 ${businessName}`);
    }

    lines.push('');
    lines.push('תודה רבה! 🙏');

    const msg = encodeURIComponent(lines.join('\n'));
    const phone = customerPhone ? customerPhone.replace(/\D/g, '').replace(/^0/, '972') : '';
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
        <Button
          variant="default"
          size="sm"
          onClick={() => router.push(`/documents/new?duplicate=${docId}`)}
          title="צור קבלה חדשה עם אותם פרטים (אותו לקוח, אותם פריטים)"
        >
          <Copy className="h-4 w-4" />
          שכפל קבלה
        </Button>
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
