'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

type BusinessForm = {
  business_name: string;
  tax_id: string;
  phone: string;
  address: string;
  city: string;
  accountant_name: string;
  accountant_email: string;
};

type CustomerForm = {
  name: string;
  phone: string;
};

const TOTAL_STEPS = 3;

export function OnboardingWizard() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [saving, setSaving] = useState(false);
  const [business, setBusiness] = useState<BusinessForm>({
    business_name: '',
    tax_id: '',
    phone: '',
    address: '',
    city: '',
    accountant_name: '',
    accountant_email: '',
  });
  const [customer, setCustomer] = useState<CustomerForm>({
    name: '',
    phone: '',
  });

  function bindBusiness<K extends keyof BusinessForm>(key: K) {
    return {
      value: business[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setBusiness((b) => ({ ...b, [key]: e.target.value })),
    };
  }

  function bindCustomer<K extends keyof CustomerForm>(key: K) {
    return {
      value: customer[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setCustomer((c) => ({ ...c, [key]: e.target.value })),
    };
  }

  function isStepValid(s: number): boolean {
    if (s === 0) {
      return Boolean(
        business.business_name.trim() &&
          business.tax_id.trim() &&
          business.phone.trim() &&
          business.address.trim() &&
          business.city.trim(),
      );
    }
    return true; // steps 1 & 2 are optional
  }

  async function persistBusinessSettings(): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: 'destructive', title: 'שגיאה', description: 'משתמש לא מחובר' });
      return false;
    }
    const payload: Record<string, unknown> = {
      user_id: user.id,
      business_name: business.business_name.trim(),
      tax_id: business.tax_id.trim(),
      phone: business.phone.trim(),
      address: business.address.trim(),
      city: business.city.trim(),
      business_type: 'osek_patur',
      invoice_footer: 'עוסק פטור',
    };
    if (business.accountant_name.trim()) payload.accountant_name = business.accountant_name.trim();
    if (business.accountant_email.trim())
      payload.accountant_email = business.accountant_email.trim();

    const { error } = await supabase
      .from('business_settings')
      .upsert(payload, { onConflict: 'user_id' });
    if (error) {
      toast({ variant: 'destructive', title: 'שגיאת שמירה', description: error.message });
      return false;
    }
    return true;
  }

  async function persistFirstCustomer(): Promise<boolean> {
    const name = customer.name.trim();
    const phone = customer.phone.trim();
    if (!name && !phone) return true; // nothing to add
    if (!name) return true; // require name to insert; skip silently if missing

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from('customers').insert({
      user_id: user.id,
      name,
      phone: phone || null,
    });
    if (error) {
      toast({
        variant: 'destructive',
        title: 'שגיאה בהוספת לקוח',
        description: error.message,
      });
      return false;
    }
    return true;
  }

  async function handleNext() {
    if (saving) return;
    if (!isStepValid(step)) {
      toast({
        variant: 'destructive',
        title: 'שדות חסרים',
        description: 'יש למלא את כל השדות הנדרשים',
      });
      return;
    }

    if (step === 0) {
      // Save business settings on advancing past step 1 so we don't lose data.
      setSaving(true);
      const ok = await persistBusinessSettings();
      setSaving(false);
      if (!ok) return;
      setStep(1);
      return;
    }

    if (step === 1) {
      // Re-save with accountant fields if filled.
      setSaving(true);
      const ok = await persistBusinessSettings();
      setSaving(false);
      if (!ok) return;
      setStep(2);
      return;
    }

    // step === 2: finish
    setSaving(true);
    const customerOk = await persistFirstCustomer();
    setSaving(false);
    if (!customerOk) return;
    toast({ title: 'הכל מוכן!', description: 'הגדרת העסק הושלמה בהצלחה' });
    router.push('/');
    router.refresh();
  }

  function handleBack() {
    if (step === 0) return;
    setStep((s) => (s - 1) as 0 | 1 | 2);
  }

  function handleSkip() {
    if (step === 0) return; // step 0 is required
    handleNext();
  }

  function onKeyDownAdvance(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      const target = e.target as HTMLElement;
      // Avoid double-trigger when focus is on a button.
      if (target.tagName === 'BUTTON') return;
      e.preventDefault();
      if (isStepValid(step)) handleNext();
    }
  }

  const titles = ['פרטי עסק', 'רואה חשבון (אופציונלי)', 'לקוח ראשון (אופציונלי)'];

  return (
    <div className="mx-auto max-w-2xl py-8" dir="rtl" onKeyDown={onKeyDownAdvance}>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold mb-2">ברוך הבא! בוא נגדיר את העסק שלך</h1>
        <p className="text-sm text-muted-foreground">
          שלב {step + 1} מתוך {TOTAL_STEPS}
        </p>
      </div>

      <ProgressDots current={step} total={TOTAL_STEPS} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{titles[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="שם העסק" required>
                <Input autoFocus {...bindBusiness('business_name')} />
              </Field>
              <Field label='ת"ז / ח.פ.' required>
                <Input {...bindBusiness('tax_id')} />
              </Field>
              <Field label="טלפון" required>
                <Input type="tel" {...bindBusiness('phone')} />
              </Field>
              <Field label="עיר" required>
                <Input {...bindBusiness('city')} />
              </Field>
              <div className="md:col-span-2">
                <Field label="כתובת" required>
                  <Input {...bindBusiness('address')} />
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="שם רואה חשבון">
                <Input autoFocus {...bindBusiness('accountant_name')} />
              </Field>
              <Field label='דוא"ל רואה חשבון'>
                <Input type="email" {...bindBusiness('accountant_email')} />
              </Field>
              <p className="md:col-span-2 text-xs text-muted-foreground">
                ניתן לדלג ולהוסיף מאוחר יותר במסך ההגדרות.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="שם לקוח">
                <Input autoFocus {...bindCustomer('name')} />
              </Field>
              <Field label="טלפון">
                <Input type="tel" {...bindCustomer('phone')} />
              </Field>
              <p className="md:col-span-2 text-xs text-muted-foreground">
                ניתן לדלג ולהוסיף לקוחות בכל עת מתוך מסך הלקוחות.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleBack}
          disabled={step === 0 || saving}
        >
          הקודם
        </Button>

        <div className="flex items-center gap-2">
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <Button type="button" variant="ghost" onClick={handleSkip} disabled={saving}>
              דלג
            </Button>
          )}
          {step === TOTAL_STEPS - 1 && (
            <Button type="button" variant="ghost" onClick={handleSkip} disabled={saving}>
              דלג וסיים
            </Button>
          )}
          <Button type="button" onClick={handleNext} disabled={saving || !isStepValid(step)}>
            {saving ? 'שומר…' : step === TOTAL_STEPS - 1 ? 'סיום' : 'הבא'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <span
            key={i}
            aria-label={`שלב ${i + 1}`}
            aria-current={isActive ? 'step' : undefined}
            className={
              'h-3 w-3 rounded-full border transition-colors ' +
              (isActive
                ? 'bg-primary border-primary'
                : isDone
                  ? 'bg-primary/60 border-primary/60'
                  : 'bg-muted border-input')
            }
          />
        );
      })}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive mr-1">*</span>}
      </Label>
      {children}
    </div>
  );
}
