'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
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
  phone_number: string;
  imei: string;
  warranty_months: string; // kept as string for input handling, parsed to int on submit
}

const DOC_TYPES: DocumentType[] = ['receipt', 'invoice', 'invoice_receipt'];
const PAY_METHODS: PaymentMethod[] = ['cash', 'credit_card', 'bank_transfer', 'bit', 'check', 'other'];

function emptyLine(): Line {
  return { saved_item_id: null, description: '', quantity: 1, unit_price: 0, phone_number: '', imei: '', warranty_months: '' };
}

interface PrefillData {
  document_type: DocumentType;
  customer_id: string | null;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  notes: string;
  lines: { saved_item_id: string | null; description: string; quantity: number; unit_price: number; phone_number?: string; imei?: string; warranty_months?: number | null }[];
  payment: {
    method: PaymentMethod;
    card_last4: string;
    card_holder: string;
    auth_code: string;
    check_number: string;
    check_bank: string;
    transfer_ref: string;
  } | null;
  sourceNumber?: number;
}

export function DocumentForm({
  customers,
  savedItems,
  settings,
  logoUrl,
  signatureUrl,
  nextNumbers,
  prefill,
  customerPhones,
  recentItems,
}: {
  customers: CustomerLite[];
  savedItems: SavedItemLite[];
  settings: PreviewSettings;
  logoUrl: string | null;
  signatureUrl: string | null;
  nextNumbers: Record<string, number>;
  prefill?: PrefillData | null;
  customerPhones: Record<string, string[]>;
  recentItems: { description: string; unit_price: number }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [step, setStep] = useState<'edit' | 'preview'>('edit');

  const [docType, setDocType] = useState<DocumentType>(prefill?.document_type ?? 'receipt');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState<string>(prefill?.customer_id ?? '');
  const [customerName, setCustomerName] = useState(prefill?.customer_name ?? '');
  const [customerTaxId, setCustomerTaxId] = useState(prefill?.customer_tax_id ?? '');
  const [customerAddress, setCustomerAddress] = useState(prefill?.customer_address ?? '');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(
    prefill?.lines && prefill.lines.length > 0
      ? prefill.lines.map((l) => ({
          saved_item_id: l.saved_item_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          phone_number: l.phone_number ?? '',
          imei: l.imei ?? '',
          warranty_months: l.warranty_months ? String(l.warranty_months) : '',
        }))
      : [emptyLine()],
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(prefill?.payment?.method ?? 'cash');
  const [cardLast4, setCardLast4] = useState(prefill?.payment?.card_last4 ?? '');
  const [cardHolder, setCardHolder] = useState(prefill?.payment?.card_holder ?? '');
  const [authCode, setAuthCode] = useState(prefill?.payment?.auth_code ?? '');
  const [checkNumber, setCheckNumber] = useState(prefill?.payment?.check_number ?? '');
  const [checkBank, setCheckBank] = useState(prefill?.payment?.check_bank ?? '');
  const [transferRef, setTransferRef] = useState(prefill?.payment?.transfer_ref ?? '');
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
            phone_number: l.phone_number?.trim() || null,
            imei: l.imei?.trim() || null,
            warranty_months: l.warranty_months && Number(l.warranty_months) > 0 ? Number(l.warranty_months) : null,
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
            lines: lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unit_price: l.unit_price,
              phone_number: l.phone_number,
              imei: l.imei,
              warranty_months: l.warranty_months ? Number(l.warranty_months) : null,
            })),
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
            <DatePicker value={issueDate} onChange={setIssueDate} />
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
              phoneSuggestions={customerId ? customerPhones[customerId] ?? [] : []}
              recentItems={recentItems}
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
  phoneSuggestions,
  recentItems,
}: {
  idx: number;
  line: Line;
  savedItems: SavedItemLite[];
  onChange: (patch: Partial<Line>) => void;
  onPickSaved: (id: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  phoneSuggestions: string[];
  recentItems: { description: string; unit_price: number }[];
}) {
  const phonesListId = `phones-list-${idx}`;
  const itemsListId = `items-list-${idx}`;

  // When user picks/types a description that matches a known item, auto-fill the price.
  function handleDescriptionChange(newDesc: string) {
    const match = recentItems.find((it) => it.description === newDesc);
    if (match) {
      // Pre-fill price only if user hasn't manually set one (or the price was 0)
      const shouldOverride = !line.unit_price || line.unit_price === 0;
      onChange({ description: newDesc, unit_price: shouldOverride ? match.unit_price : line.unit_price });
    } else {
      onChange({ description: newDesc });
    }
  }
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
          <Label className="text-xs">
            תיאור הפריט (חובה)
            {recentItems.length > 0 && (
              <span className="text-blue-600 mr-2">💡 {recentItems.length} פעולות קודמות</span>
            )}
          </Label>
          <Input
            list={itemsListId}
            placeholder="לדוגמה: טוקמן סלקום 70 ש״ח"
            value={line.description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            autoComplete="off"
          />
          {recentItems.length > 0 && (
            <datalist id={itemsListId}>
              {recentItems.map((it) => (
                <option key={it.description} value={it.description} />
              ))}
            </datalist>
          )}
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
        <div className="md:col-span-5 space-y-1">
          <Label className="text-xs">
            מספר טלפון (אופציונלי - לטעינות טוקמן)
            {phoneSuggestions.length > 0 && (
              <span className="text-blue-600 mr-2">💡 {phoneSuggestions.length} טלפונים שמורים ללקוח</span>
            )}
          </Label>
          <Input
            type="tel"
            placeholder="לדוגמה: 052-1234567"
            value={line.phone_number}
            onChange={(e) => onChange({ phone_number: e.target.value })}
            list={phonesListId}
            autoComplete="off"
          />
          {phoneSuggestions.length > 0 && (
            <datalist id={phonesListId}>
              {phoneSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          )}
        </div>
        <div className="md:col-span-6 space-y-1">
          <Label className="text-xs">IMEI (אופציונלי - למכירת מכשיר)</Label>
          <Input
            placeholder="15 ספרות, לדוגמה 351234567890123"
            inputMode="numeric"
            maxLength={20}
            value={line.imei}
            onChange={(e) => onChange({ imei: e.target.value })}
          />
        </div>
        <div className="md:col-span-3 space-y-1">
          <Label className="text-xs">אחריות (חודשים)</Label>
          <Input
            type="number"
            min="0"
            max="120"
            placeholder="12"
            value={line.warranty_months}
            onChange={(e) => onChange({ warranty_months: e.target.value })}
          />
        </div>
        <div className="md:col-span-3 flex items-end justify-end">
          <span className="text-sm font-semibold">סה״כ שורה: {formatCurrency(lineTotal)}</span>
        </div>
      </div>
    </div>
  );
}
