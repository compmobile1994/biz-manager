'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, X, Save } from 'lucide-react';
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
import { ImeiScanner } from '@/components/imei-scanner';

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
  warranty_provider: string;          // מי נותן את האחריות (טקסט חופשי)
  importer_type: '' | 'official' | 'parallel'; // יבואן רשמי / מקביל
}

const DOC_TYPES: DocumentType[] = ['receipt', 'invoice', 'invoice_receipt'];
const PAY_METHODS: PaymentMethod[] = ['cash', 'credit_card', 'bank_transfer', 'bit', 'check', 'other'];

function emptyLine(): Line {
  return {
    saved_item_id: null,
    description: '',
    quantity: 1,
    unit_price: 0,
    phone_number: '',
    imei: '',
    warranty_months: '',
    warranty_provider: '',
    importer_type: '',
  };
}

interface PrefillData {
  document_type: DocumentType;
  customer_id: string | null;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  customer_email?: string;
  customer_phone?: string;
  notes: string;
  lines: { saved_item_id: string | null; description: string; quantity: number; unit_price: number; phone_number?: string; imei?: string; warranty_months?: number | null; warranty_provider?: string | null; importer_type?: 'official' | 'parallel' | null }[];
  payment: {
    method: PaymentMethod;
    card_last4: string;
    card_holder: string;
    auth_code: string;
    check_number: string;
    check_bank: string;
    check_branch?: string;
    check_account?: string;
    check_due_date?: string;
    other_description?: string;
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
  draftId,
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
  draftId?: string | null;
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
  const [customerEmail, setCustomerEmail] = useState(prefill?.customer_email ?? '');
  const [customerPhone, setCustomerPhone] = useState(prefill?.customer_phone ?? '');
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
          warranty_provider: l.warranty_provider ?? '',
          importer_type: (l.importer_type ?? '') as Line['importer_type'],
        }))
      : [emptyLine()],
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(prefill?.payment?.method ?? 'cash');
  const [cardLast4, setCardLast4] = useState(prefill?.payment?.card_last4 ?? '');
  const [cardHolder, setCardHolder] = useState(prefill?.payment?.card_holder ?? '');
  const [authCode, setAuthCode] = useState(prefill?.payment?.auth_code ?? '');
  const [checkNumber, setCheckNumber] = useState(prefill?.payment?.check_number ?? '');
  const [checkBank, setCheckBank] = useState(prefill?.payment?.check_bank ?? '');
  const [checkBranch, setCheckBranch] = useState(prefill?.payment?.check_branch ?? '');
  const [checkAccount, setCheckAccount] = useState(prefill?.payment?.check_account ?? '');
  const [checkDueDate, setCheckDueDate] = useState(prefill?.payment?.check_due_date ?? '');
  const [transferRef, setTransferRef] = useState(prefill?.payment?.transfer_ref ?? '');
  const [otherDescription, setOtherDescription] = useState(prefill?.payment?.other_description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId ?? null);

  async function saveDraft() {
    if (!customerName.trim() && lines.every((l) => !l.description.trim())) {
      toast({ variant: 'destructive', title: 'אין מה לשמור', description: 'מלא לפחות שם לקוח או פריט אחד' });
      return;
    }
    setSavingDraft(true);
    try {
      const draftData = {
        document_type: docType,
        issue_date: issueDate,
        customer_id: customerId || null,
        customer_name: customerName,
        customer_tax_id: customerTaxId,
        customer_address: customerAddress,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        notes,
        lines,
        payment: {
          method: paymentMethod,
          card_last4: cardLast4,
          card_holder: cardHolder,
          auth_code: authCode,
          check_number: checkNumber,
          check_bank: checkBank,
          check_branch: checkBranch,
          check_account: checkAccount,
          check_due_date: checkDueDate,
          transfer_ref: transferRef,
          other_description: otherDescription,
        },
      };
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentDraftId, data: draftData }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שמירה נכשלה');
      setCurrentDraftId(json.id);
      toast({ title: 'נשמר כטיוטה', description: 'תוכל לפתוח אותה שוב מ"מסמכים"' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'שגיאה', description: e.message });
    } finally {
      setSavingDraft(false);
    }
  }

  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0), [lines]);
  const docNeedsPayment = docType === 'receipt' || docType === 'invoice_receipt';

  // Customer auto-fill now happens directly in the search input's onChange below.
  // (Old useEffect from when there was a separate Select picker — no longer needed.)

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

  async function submit(opts: { thenWhatsApp?: boolean } = {}) {
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
            quantity: Math.round(Number(l.quantity)),
            unit_price: Math.round(Number(l.unit_price)),
            line_total: Math.round(Number(l.quantity) * Number(l.unit_price)),
            sort_order: i,
            phone_number: l.phone_number?.trim() || null,
            imei: l.imei?.trim() || null,
            warranty_months: l.warranty_months && Number(l.warranty_months) > 0 ? Number(l.warranty_months) : null,
            warranty_provider: l.warranty_provider?.trim() || null,
            importer_type: l.importer_type || null,
          })),
          payment: docNeedsPayment
            ? {
                method: paymentMethod,
                amount: Math.round(total),
                card_last4: cardLast4 || null,
                card_holder: cardHolder || null,
                auth_code: authCode || null,
                check_number: checkNumber || null,
                check_bank: checkBank || null,
                check_branch: checkBranch || null,
                check_account: checkAccount || null,
                check_due_date: checkDueDate || null,
                transfer_ref: transferRef || null,
                other_description: paymentMethod === 'other' ? otherDescription || null : null,
              }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה ביצירת המסמך');
      toast({ title: 'המסמך נוצר', description: `${documentTypeLabel[docType]} #${json.number}` });
      // Delete the draft (if any) now that the real document was issued.
      // We `await` here so the request reaches the server *before* the
      // navigation tears down the page — otherwise the fetch gets aborted
      // and the draft is left behind in the "טיוטות" list.
      if (currentDraftId) {
        try {
          await fetch(`/api/drafts/${currentDraftId}`, { method: 'DELETE' });
        } catch {
          // Best-effort: if it fails, the user can still delete the draft manually
        }
      }
      // Pass through ?action=whatsapp so the detail page auto-triggers WhatsApp share once the PDF is ready
      const suffix = opts.thenWhatsApp ? '?action=whatsapp' : '';
      router.push(`/documents/${json.id}${suffix}`);
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
              warranty_provider: l.warranty_provider,
              importer_type: l.importer_type || null,
            })),
            payment_method: paymentMethod,
            card_last4: cardLast4,
            auth_code: authCode,
            check_number: checkNumber,
            check_bank: checkBank,
            check_branch: checkBranch,
            check_account: checkAccount,
            check_due_date: checkDueDate,
            transfer_ref: transferRef,
            other_description: otherDescription,
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => submit()} disabled={submitting} size="lg" variant="outline">
              {submitting ? 'יוצר…' : 'אשר והפק'}
            </Button>
            <Button onClick={() => submit({ thenWhatsApp: true })} disabled={submitting} size="lg" className="bg-green-600 hover:bg-green-700">
              {submitting ? 'יוצר…' : '📲 אשר, הפק ושלח ב-WhatsApp'}
            </Button>
          </div>
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
            <Label>
              שם הלקוח (חובה)
              {customers.length > 0 && (
                <span className="text-blue-600 mr-2 text-xs">💡 {customers.length} לקוחות שמורים — הקלד לחיפוש</span>
              )}
            </Label>
            <Input
              list="customers-search-list"
              placeholder="הקלד שם לחיפוש לקוח קיים, או שם חדש"
              value={customerName}
              onChange={(e) => {
                const newName = e.target.value;
                // Check if the typed value matches an existing customer (auto-fill from picker)
                const match = customers.find((c) => c.name === newName);
                if (match) {
                  setCustomerId(match.id);
                  setCustomerName(match.name);
                  setCustomerTaxId(match.tax_id ?? '');
                  setCustomerAddress(match.address ?? '');
                  setCustomerEmail(match.email ?? '');
                  setCustomerPhone(match.phone ?? '');
                } else {
                  // User typing — clear customerId so saved as new
                  if (customerId) setCustomerId('');
                  setCustomerName(newName);
                }
              }}
              autoComplete="off"
            />
            <datalist id="customers-search-list">
              {customers.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.tax_id ? `ת״ז: ${c.tax_id}` : ''}
                </option>
              ))}
            </datalist>
            {customerId && (
              <p className="text-xs text-emerald-600">✓ לקוח קיים נבחר — הפרטים מולאו אוטומטית</p>
            )}
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
                  <Input
                    value={checkBank}
                    onChange={(e) => setCheckBank(e.target.value)}
                    placeholder='לדוגמה: "פועלים" (12)'
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>מספר חשבון</Label>
                  <Input
                    value={checkAccount}
                    onChange={(e) => setCheckAccount(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>תאריך פרעון</Label>
                  <DatePicker value={checkDueDate} onChange={setCheckDueDate} />
                </div>
              </>
            )}
            {paymentMethod === 'bank_transfer' && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>אסמכתת העברה</Label>
                <Input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} />
              </div>
            )}
            {paymentMethod === 'other' && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>איך שולם? (חובה)</Label>
                <Input
                  value={otherDescription}
                  onChange={(e) => setOtherDescription(e.target.value)}
                  placeholder='לדוגמה: "קיזוז חוב", "שובר זיכוי", "החלפה"'
                />
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

      <div className="flex justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => router.back()}>ביטול</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={saveDraft} disabled={savingDraft} size="lg">
            <Save className="h-4 w-4" />
            {savingDraft ? 'שומר…' : currentDraftId ? 'עדכן טיוטה' : 'שמור כטיוטה'}
          </Button>
          <Button onClick={goToPreview} size="lg">
            תצוגה מקדימה ←
          </Button>
        </div>
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
  // IMPORTANT: only include `unit_price` in the patch when we actually want to
  // override it. Sending `unit_price: line.unit_price` from a stale closure
  // (the autocomplete event can fire before React commits a prior price-
  // input change) silently reverts the user's just-typed price.
  function handleDescriptionChange(newDesc: string) {
    const patch: Partial<Line> = { description: newDesc };
    const match = recentItems.find((it) => it.description === newDesc);
    if (match && (!line.unit_price || line.unit_price === 0)) {
      patch.unit_price = match.unit_price;
    }
    onChange(patch);
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
            step="1"
            min="0"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: Math.round(Number(e.target.value)) })}
          />
        </div>
        <div className="md:col-span-4 space-y-1">
          <Label className="text-xs">מחיר יחידה (₪)</Label>
          <Input
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            value={line.unit_price}
            onChange={(e) => onChange({ unit_price: Math.round(Number(e.target.value)) })}
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
          <div className="flex gap-2">
            <Input
              placeholder="15 ספרות, לדוגמה 351234567890123"
              inputMode="numeric"
              maxLength={20}
              value={line.imei}
              onChange={(e) => onChange({ imei: e.target.value })}
              className="flex-1"
            />
            <ImeiScanner onScan={(imei) => onChange({ imei })} />
          </div>
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

        {/* Device-only fields: ספק האחריות + סוג היבוא */}
        {(line.imei || line.warranty_months) && (
          <>
            <div className="md:col-span-6 space-y-1">
              <Label className="text-xs">ספק האחריות (מי אחראי לאחריות)</Label>
              <Input
                placeholder='לדוגמה: יבואן רשמי / החנות / "סלקום"'
                value={line.warranty_provider}
                onChange={(e) => onChange({ warranty_provider: e.target.value })}
              />
            </div>
            <div className="md:col-span-6 space-y-1">
              <Label className="text-xs">סוג היבוא</Label>
              <Select
                value={line.importer_type || '__none__'}
                onValueChange={(v) =>
                  onChange({ importer_type: v === '__none__' ? '' : (v as 'official' | 'parallel') })
                }
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— לא רלוונטי —</SelectItem>
                  <SelectItem value="official">יבואן רשמי</SelectItem>
                  <SelectItem value="parallel">יבואן מקביל</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
