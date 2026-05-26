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
  item_number: string;                // מספר זיהוי חופשי (סיריאלי / מק"ט / הזמנה), נפרד מ-IMEI
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
    item_number: '',
    warranty_months: '',
    warranty_provider: '',
    importer_type: '',
  };
}

interface PrefillData {
  document_type: DocumentType;
  issue_date?: string;
  customer_id: string | null;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  customer_email?: string;
  customer_phone?: string;
  notes: string;
  lines: { saved_item_id: string | null; description: string; quantity: number; unit_price: number; phone_number?: string; imei?: string; item_number?: string; warranty_months?: number | null; warranty_provider?: string | null; importer_type?: 'official' | 'parallel' | null }[];
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
  customerItemHistory,
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
  // customer_id → (description → most recent unit_price for that customer).
  // Used to auto-suggest the price when the same customer + description
  // combo has been billed before.
  customerItemHistory: Record<string, Record<string, number>>;
  recentItems: { description: string; unit_price: number }[];
  draftId?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [step, setStep] = useState<'edit' | 'preview'>('edit');

  const [docType, setDocType] = useState<DocumentType>(prefill?.document_type ?? 'receipt');
  const [issueDate, setIssueDate] = useState(prefill?.issue_date || new Date().toISOString().slice(0, 10));

  // Belt-and-suspenders: on EVERY first mount of the form, force-sync from
  // prefill once. Combined with the key={params.draft} prop on the page,
  // this guarantees: every navigation to a draft → fresh mount → this
  // effect runs once → state matches prefill. User edits afterwards work
  // normally (this effect never runs again on the same mount).
  useEffect(() => {
    if (prefill?.issue_date) setIssueDate(prefill.issue_date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps = run once on mount only, never again
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
          item_number: l.item_number ?? '',
          warranty_months: l.warranty_months ? String(l.warranty_months) : '',
          warranty_provider: l.warranty_provider ?? '',
          importer_type: (l.importer_type ?? '') as Line['importer_type'],
        }))
      : [emptyLine()],
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(prefill?.payment?.method ?? 'cash');
  // Split-payment support: user can opt to pay with TWO methods on the same
  // receipt (e.g. cash + bit, common in repair shops). When enabled, the
  // user enters the amount for payment #1 explicitly and a 2nd payment
  // block appears.
  const [splitPayment, setSplitPayment] = useState(false);
  const [payment1Amount, setPayment1Amount] = useState<string>('');
  const [payment2Method, setPayment2Method] = useState<PaymentMethod>('bit');
  const [payment2Amount, setPayment2Amount] = useState<string>('');
  const [card2Last4, setCard2Last4] = useState('');
  const [card2Holder, setCard2Holder] = useState('');
  const [auth2Code, setAuth2Code] = useState('');
  const [check2Number, setCheck2Number] = useState('');
  const [check2Bank, setCheck2Bank] = useState('');
  const [check2Account, setCheck2Account] = useState('');
  const [check2DueDate, setCheck2DueDate] = useState('');
  const [transfer2Ref, setTransfer2Ref] = useState('');
  const [other2Description, setOther2Description] = useState('');
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
  // Historical mode — for bulk-entering past-year receipts from a paper
  // booklet. When ON: manual number input, no auto-redirect after save,
  // no PDF generation, no draft, no document-counter bump. After each
  // successful save the form clears (except for date + historical mode +
  // manual number which auto-increments) so the user can chain entries.
  const [isHistorical, setIsHistorical] = useState(false);
  const [manualNumber, setManualNumber] = useState<string>('');

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
    // Only override the unit_price if the user hasn't already typed one.
    // Same defensive pattern as handleDescriptionChange — picking from a
    // template shouldn't silently revert a manual price.
    const currentLine = lines[idx];
    const patch: Partial<Line> = {
      saved_item_id: it.id,
      description: it.description ? `${it.name} - ${it.description}` : it.name,
    };
    if (!currentLine.unit_price || currentLine.unit_price === 0) {
      patch.unit_price = Math.round(Number(it.default_price));
    }
    updateLine(idx, patch);
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
    if (isHistorical) {
      const n = parseInt(manualNumber, 10);
      if (!Number.isInteger(n) || n <= 0) {
        toast({ variant: 'destructive', title: 'מספר קבלה ידני חובה (מספר חיובי)' });
        return false;
      }
    }
    if (docNeedsPayment && splitPayment) {
      const a1 = Math.round(Number(payment1Amount));
      const a2 = Math.round(Number(payment2Amount));
      if (!Number.isFinite(a1) || a1 <= 0) {
        toast({ variant: 'destructive', title: 'סכום תשלום ראשון חובה' });
        return false;
      }
      if (!Number.isFinite(a2) || a2 <= 0) {
        toast({ variant: 'destructive', title: 'סכום תשלום שני חובה' });
        return false;
      }
      if (a1 + a2 !== Math.round(total)) {
        toast({ variant: 'destructive', title: `סכום התשלומים (${a1 + a2}) חייב להיות שווה לסה״כ הקבלה (${Math.round(total)})` });
        return false;
      }
      if (paymentMethod === payment2Method) {
        toast({ variant: 'destructive', title: 'בחר שני אמצעי תשלום שונים' });
        return false;
      }
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
          is_historical: isHistorical || undefined,
          manual_number: isHistorical ? parseInt(manualNumber, 10) : undefined,
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
            item_number: l.item_number?.trim() || null,
            warranty_months: l.warranty_months && Number(l.warranty_months) > 0 ? Number(l.warranty_months) : null,
            warranty_provider: l.warranty_provider?.trim() || null,
            importer_type: l.importer_type || null,
          })),
          payment: docNeedsPayment && !splitPayment
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
          payments: docNeedsPayment && splitPayment
            ? [
                {
                  method: paymentMethod,
                  amount: Math.round(Number(payment1Amount)),
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
                },
                {
                  method: payment2Method,
                  amount: Math.round(Number(payment2Amount)),
                  card_last4: card2Last4 || null,
                  card_holder: card2Holder || null,
                  auth_code: auth2Code || null,
                  check_number: check2Number || null,
                  check_bank: check2Bank || null,
                  check_branch: null,
                  check_account: check2Account || null,
                  check_due_date: check2DueDate || null,
                  transfer_ref: transfer2Ref || null,
                  other_description: payment2Method === 'other' ? other2Description || null : null,
                },
              ]
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה ביצירת המסמך');
      toast({ title: 'המסמך נוצר', description: `${documentTypeLabel[docType]} #${json.number}` });

      // Historical-mode short-circuit: don't redirect. Clear most fields so
      // the user can chain entries, increment the manual number for the
      // next one, and stay on the form. We keep the date (likely same or
      // close to the previous) and the historical toggle ON.
      if (isHistorical) {
        const justSaved = parseInt(manualNumber, 10);
        setManualNumber(String(justSaved + 1));
        setCustomerId('');
        setCustomerName('');
        setCustomerTaxId('');
        setCustomerAddress('');
        setCustomerEmail('');
        setCustomerPhone('');
        setNotes('');
        setLines([emptyLine()]);
        // Reset payment helpers but keep the chosen method (likely repeats)
        setCardLast4('');
        setCardHolder('');
        setAuthCode('');
        setCheckNumber('');
        setCheckBank('');
        setCheckBranch('');
        setCheckAccount('');
        setCheckDueDate('');
        setTransferRef('');
        setOtherDescription('');
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

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
      // Drop the local router cache so the next visit to /documents/new
      // (e.g. via the sidebar "מסמך חדש" link) re-fetches the counter and
      // shows the *next* running number instead of the one we just used.
      router.refresh();
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
              item_number: l.item_number,
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
            // In historical mode the preview must show the user's typed
            // number, not the live counter's next value.
            expectedNumber: isHistorical && manualNumber
              ? Number(manualNumber)
              : (nextNumbers[docType] ?? 1),
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
      {/* Visible confirmation that a draft was loaded with its saved date.
          Disappears once the user changes the date — at that point issueDate
          differs from the original prefill value. */}
      {currentDraftId && prefill?.issue_date && (
        <div className="rounded-md bg-amber-50 border border-amber-300 px-3 py-2 text-sm">
          📋 טיוטה נטענה — תאריך השמירה: <strong>{new Date(prefill.issue_date + 'T00:00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>
        </div>
      )}
      {/* Historical mode toggle — for bulk-entering past-year receipts.
          Doesn't touch the live counter, allows manual numbering, and
          chain-clears the form after each save so the user can keep
          typing the next one. */}
      <Card className={isHistorical ? 'border-amber-400 bg-amber-50/40' : ''}>
        <CardContent className="py-3 flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-amber-600"
              checked={isHistorical}
              onChange={(e) => {
                setIsHistorical(e.target.checked);
                // First-time toggle on: pre-fill manual number with last-used+1
                // suggestion (just an empty string for now — user types whatever).
                if (e.target.checked && !manualNumber) setManualNumber('');
              }}
            />
            <span className="font-medium">מצב היסטורי</span>
          </label>
          <span className="text-xs text-muted-foreground">
            להזנת קבלות מפנקס נייר משנה קודמת — מספור ידני, ללא PDF, בלי לשבור את המספור הרץ
          </span>
        </CardContent>
      </Card>
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
          {isHistorical && (
            <div className="space-y-1.5">
              <Label>מספר קבלה (ידני)</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="לדוגמה: 50"
                value={manualNumber}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^0-9]/g, '');
                  setManualNumber(clean);
                }}
                autoFocus
              />
            </div>
          )}
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
              customerPriceMemory={customerId ? customerItemHistory[customerId] ?? {} : {}}
            />
          ))}
          <div className="border-t pt-3 flex justify-between items-center">
            <span className="text-lg font-semibold">סה״כ:</span>
            <span className="text-2xl font-bold">{total > 0 ? formatCurrency(total) : '—'}</span>
          </div>
        </CardContent>
      </Card>

      {docNeedsPayment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
              <span>פרטי תשלום</span>
              <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-blue-600"
                  checked={splitPayment}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSplitPayment(on);
                    // When turning split ON, default payment-1 amount to the full
                    // total and payment-2 to 0 so the user only has to override
                    // one number. When turning OFF, clear both.
                    if (on) {
                      setPayment1Amount(String(Math.round(total)));
                      setPayment2Amount('');
                    } else {
                      setPayment1Amount('');
                      setPayment2Amount('');
                    }
                  }}
                />
                פצל ל-2 אמצעי תשלום
              </label>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{splitPayment ? 'אמצעי תשלום #1' : 'אופן תשלום'}</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAY_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{paymentMethodLabel[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {splitPayment && (
              <div className="space-y-1.5">
                <Label>סכום תשלום #1 (₪)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={payment1Amount}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    setPayment1Amount(clean);
                    // Auto-fill payment #2 amount to whatever's left so it sums
                    // to the receipt total. User can still override.
                    const remaining = Math.round(total) - Number(clean || 0);
                    if (remaining >= 0) setPayment2Amount(String(remaining));
                  }}
                  placeholder="לדוגמה: 450"
                />
              </div>
            )}

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

            {splitPayment && (
              <>
                <div className="md:col-span-2 border-t pt-3 mt-1">
                  <p className="text-sm font-semibold text-blue-700">אמצעי תשלום #2</p>
                </div>
                <div className="space-y-1.5">
                  <Label>אמצעי תשלום #2</Label>
                  <Select value={payment2Method} onValueChange={(v) => setPayment2Method(v as PaymentMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAY_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{paymentMethodLabel[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>סכום תשלום #2 (₪)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={payment2Amount}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '');
                      setPayment2Amount(clean);
                    }}
                    placeholder="לדוגמה: 300"
                  />
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const a1 = Number(payment1Amount || 0);
                      const a2 = Number(payment2Amount || 0);
                      const sum = a1 + a2;
                      const target = Math.round(total);
                      if (sum === target) return <span className="text-green-700">✓ סכום מתאים לסה״כ הקבלה</span>;
                      return <span className="text-amber-700">⚠ סכום נוכחי {sum} ₪ · יעד {target} ₪</span>;
                    })()}
                  </p>
                </div>
                {payment2Method === 'credit_card' && (
                  <>
                    <div className="space-y-1.5">
                      <Label>4 ספרות אחרונות</Label>
                      <Input maxLength={4} value={card2Last4} onChange={(e) => setCard2Last4(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>שם בעל הכרטיס</Label>
                      <Input value={card2Holder} onChange={(e) => setCard2Holder(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>מס׳ אסמכתה</Label>
                      <Input value={auth2Code} onChange={(e) => setAuth2Code(e.target.value)} />
                    </div>
                  </>
                )}
                {payment2Method === 'check' && (
                  <>
                    <div className="space-y-1.5">
                      <Label>מספר צ׳ק</Label>
                      <Input value={check2Number} onChange={(e) => setCheck2Number(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>בנק</Label>
                      <Input value={check2Bank} onChange={(e) => setCheck2Bank(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>מספר חשבון</Label>
                      <Input value={check2Account} onChange={(e) => setCheck2Account(e.target.value)} inputMode="numeric" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>תאריך פרעון</Label>
                      <DatePicker value={check2DueDate} onChange={setCheck2DueDate} />
                    </div>
                  </>
                )}
                {payment2Method === 'bank_transfer' && (
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>אסמכתת העברה</Label>
                    <Input value={transfer2Ref} onChange={(e) => setTransfer2Ref(e.target.value)} />
                  </div>
                )}
                {payment2Method === 'other' && (
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>איך שולם? (חובה)</Label>
                    <Input value={other2Description} onChange={(e) => setOther2Description(e.target.value)} />
                  </div>
                )}
              </>
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
  customerPriceMemory,
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
  // description → most recent price for the currently-selected customer.
  // Empty {} when no customer is selected.
  customerPriceMemory: Record<string, number>;
}) {
  const phonesListId = `phones-list-${idx}`;
  const itemsListId = `items-list-${idx}`;

  // Description change. Two side effects, both guarded so they never stomp
  // a value the user has explicitly typed:
  //   1. Auto 3-month warranty when "תיקון" appears (except FRP)
  //   2. Auto-fill the price IF this exact description was billed to this
  //      same customer before AND the price field is still empty.
  function handleDescriptionChange(newDesc: string) {
    const patch: Partial<Line> = { description: newDesc };

    // (1) warranty
    const isRepair = newDesc.includes('תיקון');
    const isFrp = /frp/i.test(newDesc);
    if (isRepair && !isFrp && !line.warranty_months) {
      patch.warranty_months = '3';
    }

    // (2) per-customer price memory. Only fills when the field is 0/empty
    // so user-typed prices are NEVER overwritten. Matches by exact
    // description AND only applies when a customer is selected.
    const trimmed = newDesc.trim();
    if (trimmed && (!line.unit_price || line.unit_price === 0)) {
      const remembered = customerPriceMemory[trimmed];
      if (typeof remembered === 'number' && remembered > 0) {
        patch.unit_price = Math.round(remembered);
      }
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
          {/* Suggestions: this customer's past items first (the prices we'll
              actually auto-fill from), then the global recent list. Deduped
              so the same description never appears twice. */}
          {(() => {
            const customerDescs = Object.keys(customerPriceMemory);
            const seen = new Set<string>(customerDescs);
            const merged: string[] = [
              ...customerDescs,
              ...recentItems.map((it) => it.description).filter((d) => !seen.has(d) && (seen.add(d), true)),
            ];
            if (merged.length === 0) return null;
            return (
              <datalist id={itemsListId}>
                {merged.map((d) => (<option key={d} value={d} />))}
              </datalist>
            );
          })()}
        </div>
        <div className="md:col-span-3 space-y-1">
          <Label className="text-xs">כמות</Label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="1"
            value={line.quantity || ''}
            onChange={(e) => {
              // Strip everything that isn't a digit so the browser can't auto-
              // coerce values (the old type="number" sometimes rewrote what
              // the user typed — e.g. 120 → 118 on certain mobile Chromes).
              const clean = e.target.value.replace(/[^0-9]/g, '');
              onChange({ quantity: clean === '' ? 0 : parseInt(clean, 10) });
            }}
          />
        </div>
        <div className="md:col-span-4 space-y-1">
          <Label className="text-xs">מחיר יחידה (₪)</Label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={line.unit_price || ''}
            onChange={(e) => {
              const clean = e.target.value.replace(/[^0-9]/g, '');
              onChange({ unit_price: clean === '' ? 0 : parseInt(clean, 10) });
            }}
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
        <div className="md:col-span-4 space-y-1">
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
          <Label className="text-xs">מספר (סיריאלי / מק״ט / הזמנה — אופציונלי)</Label>
          <Input
            placeholder="לדוגמה: SN-12345 / הזמנה 78"
            maxLength={40}
            value={line.item_number}
            onChange={(e) => onChange({ item_number: e.target.value })}
          />
        </div>
        <div className="md:col-span-2 space-y-1">
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
          <span className="text-sm font-semibold">סה״כ שורה: {lineTotal > 0 ? formatCurrency(lineTotal) : '—'}</span>
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
