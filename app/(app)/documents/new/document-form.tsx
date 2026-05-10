'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { documentTypeLabel, formatCurrency, paymentMethodLabel } from '@/lib/utils';
import type { DocumentType, PaymentMethod } from '@/lib/supabase/types';
import { DocumentPreview, type PreviewSettings } from './document-preview';

type CustomerLite = { id: string; name: string; email: string | null; phone: string | null; address: string | null; tax_id: string | null };
type SavedItemLite = { id: string; name: string; description: string | null; default_price: number };

interface Line {
  saved_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

const DOC_TYPES: DocumentType[] = ['receipt', 'invoice', 'invoice_receipt'];
const PAY_METHODS: PaymentMethod[] = ['cash', 'credit_card', 'bank_transfer', 'bit', 'check', 'other'];

function emptyLine(): Line {
  return { saved_item_id: null, description: '', quantity: 1, unit_price: 0 };
}

export function DocumentForm({
  customers,
  savedItems,
  settings,
  logoUrl,
  signatureUrl,
  nextNumbers,
}: {
  customers: CustomerLite[];
  savedItems: SavedItemLite[];
  settings: PreviewSettings;
  logoUrl: string | null;
  signatureUrl: string | null;
  nextNumbers: Record<string, number>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [step, setStep] = useState<'edit' | 'preview'>('edit');

  const [docType, setDocType] = useState<DocumentType>('invoice_receipt');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerTaxId, setCustomerTaxId] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cardLast4, setCardLast4] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkBank, setCheckBank] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0), [lines]);
  const docNeedsPayment = docType === 'receipt' || docType === 'invoice_receipt';

  // אם נבחר לקוח קיים - מילוי שדות הצילום
  useEffect(() => {
    if (!customerId) return;
    const c = customers.find((x) => x.id === customerId);
    if (!c) return;
    setCustomerName(c.name);
    setCustomerTaxId(c.tax_id ?? '');
    setCustomerAddress(c.address ?? '');
    setCustomerEmail(c.email ?? '');
    setCustomerPhone(c.phone ?? '');
  }, [customerId, customers]);

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((curr) => curr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function pickSavedItem(idx: number, savedItemId: string) {
    if (savedItemId === '__none__') {
      updateLine(idx, { saved_item_id: null });
      return;
    }
    const it = savedItems.find((s) => s.id === savedItemId);
    if (!it) return;
    updateLine(idx, {
      saved_item_id: it.id,
      description: it.description ? `${it.name} - ${it.description}` : it.name,
      unit_price: Number(it.default_price),
    });
  }

  function addLine() {
    setLines((l) => [...l, emptyLine()]);
  }

  function removeLine(idx: number) {
    setLines((l) => (l.length === 1 ? l : l.filter((_, i) => i !== idx)));
  }

  function validate(): boolean {
    if (!customerName.trim()) {
      toast({ variant: 'destructive', title: 'שם הלקוח חובה' });
      return false;
    }
    if (lines.some((l) => !l.description.trim() || l.quantity <= 0 || l.unit_price < 0)) {
      toast({ variant: 'destructive', title: 'בכל שורה: תיאור, כמות חיובית ומחיר' });
      return false;
    }
    return true;
  }

  function goToPreview() {
    if (!validate()) return;
    setStep('preview');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: docType,
          issue_date: issueDate,
          customer_id: customerId || null,
          customer_name_snapshot: customerName,
          customer_tax_id_snapshot: customerTaxId || null,
          customer_address_snapshot: customerAddress || null,
          customer_email: customerEmail || null,
          customer_phone: customerPhone || null,
          notes: notes || null,
          lines: lines.map((l, i) => ({
            saved_item_id: l.saved_item_id,
            description: l.description,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            line_total: Number(l.quantity) * Number(l.unit_price),
            sort_order: i,
          })),
          payment: docNeedsPayment
            ? {
                method: paymentMethod,
                amount: total,
                card_last4: cardLast4 || null,
                card_holder: cardHolder || null,
                auth_code: authCode || null,
                check_number: checkNumber || null,
                check_bank: checkBank || null,
                transfer_ref: transferRef || null,
              }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה ביצירת המסמך');
      toast({ title: 'המסמך נוצר', description: `${documentTypeLabel[docType]} #${json.number}` });
      router.push(`/documents/${json.id}`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'preview') {
    return (
      <div className="space-y-6">
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
          <strong>תצוגה מקדימה</strong> — בדוק שהכל נכון. ברגע שתלחץ "אשר והפק" יוקצה מספר רץ ותיווצר קבלה רשמית בלתי ניתנת לעריכה.
        </div>

        <DocumentPreview
          data={{
            document_type: docType,
            issue_date: issueDate,
            customer_name: customerName,
            customer_tax_id: customerTaxId,
            customer_address: customerAddress,
            notes,
            lines,
            payment_method: paymentMethod,
            card_last4: cardLast4,
            auth_code: authCode,
            check_number: checkNumber,
            transfer_ref: transferRef,
            needsPayment: docNeedsPayment,
            expectedNumber: nextNumbers[docType] ?? 1,
          }}
          settings={settings}
          logoUrl={logoUrl}
          signatureUrl={signatureUrl}
        />

        <div className="flex flex-wrap justify-between gap-2 sticky bottom-0 bg-background py-3 border-t">
          <Button variant="ghost" onClick={() => setStep('edit')} disabled={submitting}>
            ← חזור לעריכה
          </Button>
          <Button onClick={submit} disabled={submitting} size="lg">
            {submitting ? 'יוצר…' : 'אשר והפק PDF'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>פרטי מסמך</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>סוג מסמך</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{documentTypeLabel[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>תאריך</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>פרטי לקוח</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>בחר לקוח קיים (אופציונלי)</Label>
            <Select value={customerId || '__new__'} onValueChange={(v) => setCustomerId(v === '__new__' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">— לקוח חדש / חד פעמי —</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.tax_id ? ` · ${c.tax_id}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>שם הלקוח (חובה)</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ת״ז / ח.פ.</Label>
            <Input value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>דוא״ל</Label>
            <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>טלפון</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>כתובת</Label>
            <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>פריטים</CardTitle>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" />
              הוסף שורה
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, idx) => (
            <LineRow
              key={idx}
              idx={idx}
              line={line}
              savedItems={savedItems}
              onChange={(p) => updateLine(idx, p)}
              onPickSaved={(id) => pickSavedItem(idx, id)}
              onRemove={() => removeLine(idx)}
              canRemove={lines.length > 1}
            />
          ))}
          <div className="border-t pt-3 flex justify-between items-center">
            <span className="text-lg font-semibold">סה״כ:</span>
            <span className="text-2xl font-bold">{formatCurrency(total)}</span>
          </div>
        </CardContent>
      </Card>

      {docNeedsPayment && (
        <Card>
          <CardHeader>
            <CardTitle>פרטי תשלום</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>אופן תשלום</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAY_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{paymentMethodLabel[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'credit_card' && (
              <>
                <div className="space-y-1.5">
                  <Label>4 ספרות אחרונות</Label>
                  <Input maxLength={4} pattern="[0-9]{4}" value={cardLast4} onChange={(e) => setCardLast4(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>שם בעל הכרטיס</Label>
                  <Input value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>מס׳ אסמכתה</Label>
                  <Input value={authCode} onChange={(e) => setAuthCode(e.target.value)} />
                </div>
              </>
            )}
            {paymentMethod === 'check' && (
              <>
                <div className="space-y-1.5">
                  <Label>מספר צ׳ק</Label>
                  <Input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>בנק</Label>
                  <Input value={checkBank} onChange={(e) => setCheckBank(e.target.value)} />
                </div>
              </>
            )}
            {paymentMethod === 'bank_transfer' && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>אסמכתת העברה</Label>
                <Input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-1.5">
            <Label>הערות (אופציונלי)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>ביטול</Button>
        <Button onClick={goToPreview} size="lg">
          תצוגה מקדימה ←
        </Button>
      </div>
    </div>
  );
}

function LineRow({
  idx,
  line,
  savedItems,
  onChange,
  onPickSaved,
  onRemove,
  canRemove,
}: {
  idx: number;
  line: Line;
  savedItems: SavedItemLite[];
  onChange: (patch: Partial<Line>) => void;
  onPickSaved: (id: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const lineTotal = Number(line.quantity || 0) * Number(line.unit_price || 0);
  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">שורה #{idx + 1}</span>
        {canRemove && (
          <Button variant="ghost" size="icon" className="mr-auto" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
        {savedItems.length > 0 && (
          <div className="md:col-span-4 space-y-1">
            <Label className="text-xs">בחר מתבניות</Label>
            <Select value={line.saved_item_id ?? '__none__'} onValueChange={onPickSaved}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {savedItems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className={`${savedItems.length > 0 ? 'md:col-span-8' : 'md:col-span-12'} space-y-1`}>
          <Label className="text-xs">תיאור הפריט (חובה)</Label>
          <Input
            placeholder="לדוגמה: ייעוץ עסקי 1 שעה"
            value={line.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
        <div className="md:col-span-3 space-y-1">
          <Label className="text-xs">כמות</Label>
          <Input
            type="number"
            step="0.001"
            min="0"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-4 space-y-1">
          <Label className="text-xs">מחיר יחידה (₪)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={line.unit_price}
            onChange={(e) => onChange({ unit_price: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-5 flex items-end justify-end">
          <span className="text-sm font-semibold">סה״כ שורה: {formatCurrency(lineTotal)}</span>
        </div>
      </div>
    </div>
  );
}
