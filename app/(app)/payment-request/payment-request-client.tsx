'use client';

import { useState } from 'react';
import { Smartphone, Landmark, Send, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  businessName: string;
  ownerName: string | null;
  bitPhone: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccount: string | null;
}

export function PaymentRequestClient({
  businessName,
  ownerName,
  bitPhone,
  bankName,
  bankBranch,
  bankAccount,
}: Props) {
  const { toast } = useToast();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [includeBit, setIncludeBit] = useState(true);
  const [includeBank, setIncludeBank] = useState(true);

  const accountOwner = ownerName || businessName;
  const formattedAmount = amount
    ? new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(Number(amount))
    : null;

  // Build the message preview live
  const previewLines: string[] = [];
  previewLines.push(`היי${customerName ? ' ' + customerName : ''} 👋`);
  previewLines.push('');
  if (formattedAmount) {
    previewLines.push(`לתשלום של ${formattedAmount}, אופציות תשלום:`);
  } else {
    previewLines.push(`פרטי תשלום:`);
  }
  if (includeBit && bitPhone) {
    previewLines.push('');
    previewLines.push('📱 בביט:');
    previewLines.push(`   ${bitPhone}`);
    previewLines.push(`   על שם: ${businessName}`);
  }
  if (includeBank && bankName && bankAccount) {
    previewLines.push('');
    previewLines.push('🏦 בהעברה בנקאית:');
    previewLines.push(`   בנק: ${bankName}`);
    if (bankBranch) previewLines.push(`   סניף: ${bankBranch}`);
    previewLines.push(`   חשבון: ${bankAccount}`);
    previewLines.push(`   על שם: ${accountOwner}`);
  }
  previewLines.push('');
  previewLines.push('תודה רבה! 🙏');

  function send() {
    if (!includeBit && !includeBank) {
      toast({ variant: 'destructive', title: 'בחר לפחות אופציה אחת', description: 'ביט או העברה בנקאית' });
      return;
    }
    if (includeBit && !bitPhone) {
      toast({ variant: 'destructive', title: 'חסר מספר טלפון', description: 'הוסף בהגדרות → פרטי עסק → טלפון' });
      return;
    }
    if (includeBank && (!bankName || !bankAccount)) {
      toast({ variant: 'destructive', title: 'חסרים פרטי בנק', description: 'הוסף בהגדרות → פרטי בנק' });
      return;
    }

    const msg = encodeURIComponent(previewLines.join('\n'));
    const phone = customerPhone ? customerPhone.replace(/\D/g, '').replace(/^0/, '972') : '';
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  }

  const hasBit = !!bitPhone;
  const hasBank = !!(bankName && bankAccount);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>פרטי הלקוח</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>שם הלקוח (אופציונלי)</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="השם יופיע בהתחלה של ההודעה"
            />
          </div>
          <div className="space-y-1.5">
            <Label>טלפון הלקוח (אופציונלי)</Label>
            <Input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="אם תזין - WhatsApp ישלח אליו ישירות"
            />
          </div>
          <div className="space-y-1.5">
            <Label>סכום (אופציונלי)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="לדוגמה: 70"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>אופציות תשלום</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer ${includeBit && hasBit ? 'bg-blue-50 border-blue-200' : 'bg-muted/30'}`}>
            <input
              type="checkbox"
              checked={includeBit && hasBit}
              disabled={!hasBit}
              onChange={(e) => setIncludeBit(e.target.checked)}
              className="h-4 w-4"
            />
            <Smartphone className="h-5 w-5 text-blue-600" />
            <div className="flex-1">
              <p className="font-semibold text-sm">ביט</p>
              <p className="text-xs text-muted-foreground">
                {hasBit ? `${bitPhone} (${businessName})` : '⚠️ לא מוגדר - הוסף טלפון בהגדרות'}
              </p>
            </div>
          </label>

          <label className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer ${includeBank && hasBank ? 'bg-emerald-50 border-emerald-200' : 'bg-muted/30'}`}>
            <input
              type="checkbox"
              checked={includeBank && hasBank}
              disabled={!hasBank}
              onChange={(e) => setIncludeBank(e.target.checked)}
              className="h-4 w-4"
            />
            <Landmark className="h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-semibold text-sm">העברה בנקאית</p>
              <p className="text-xs text-muted-foreground">
                {hasBank
                  ? `${bankName}${bankBranch ? ` · סניף ${bankBranch}` : ''} · חשבון ${bankAccount}`
                  : '⚠️ לא מוגדר - הוסף פרטי בנק בהגדרות'}
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>תצוגה מקדימה של ההודעה</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-sm rounded-md border bg-slate-50 p-4 font-mono">
            {previewLines.join('\n')}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 py-3 bg-background border-t flex justify-end">
        <Button size="lg" onClick={send}>
          <Send className="h-4 w-4" />
          שלח ב-WhatsApp
        </Button>
      </div>
    </div>
  );
}
