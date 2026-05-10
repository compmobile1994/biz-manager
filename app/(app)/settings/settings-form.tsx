'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { BusinessSettings } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Local extension since BusinessSettings type may not yet declare these (added in migration 0002)
type BusinessSettingsExt = BusinessSettings & {
  brand_color?: string | null;
  pdf_theme?: string | null;
};

const DEFAULT_BRAND_COLOR = '#2563eb';
const DEFAULT_PDF_THEME = 'modern';

export function SettingsForm({ initial }: { initial: BusinessSettings | null }) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<BusinessSettingsExt>>(
    (initial as BusinessSettingsExt) ?? {
      business_name: '',
      owner_name: '',
      tax_id: '',
      business_type: 'osek_patur',
      address: '',
      city: '',
      phone: '',
      email: '',
      bank_name: '',
      bank_branch: '',
      bank_account: '',
      accountant_email: '',
      accountant_name: '',
      invoice_footer: 'עוסק פטור',
      brand_color: DEFAULT_BRAND_COLOR,
      pdf_theme: DEFAULT_PDF_THEME,
    },
  );

  // Generate signed URLs for existing logo/signature paths
  useEffect(() => {
    let cancelled = false;
    async function loadSignedUrls() {
      const logoPath = form.logo_url;
      const sigPath = form.signature_url;
      if (logoPath) {
        const { data } = await supabase.storage.from('business').createSignedUrl(logoPath, 3600);
        if (!cancelled && data?.signedUrl) setLogoPreview(data.signedUrl);
      }
      if (sigPath) {
        const { data } = await supabase.storage.from('business').createSignedUrl(sigPath, 3600);
        if (!cancelled && data?.signedUrl) setSignaturePreview(data.signedUrl);
      }
    }
    loadSignedUrls();
    return () => {
      cancelled = true;
    };
    // Run only on initial path values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function bind<K extends keyof BusinessSettingsExt>(key: K) {
    return {
      value: (form[key] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function uploadAsset(
    file: File,
    kind: 'logo' | 'signature',
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: 'destructive', title: 'שגיאה', description: 'משתמש לא מחובר' });
      return;
    }
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${user.id}/${kind}.${ext}`;
    const setBusy = kind === 'logo' ? setUploadingLogo : setUploadingSignature;
    setBusy(true);

    // Local preview while uploading
    const localUrl = URL.createObjectURL(file);
    if (kind === 'logo') setLogoPreview(localUrl);
    else setSignaturePreview(localUrl);

    const { error: uploadError } = await supabase.storage
      .from('business')
      .upload(path, file, { upsert: true, contentType: file.type || 'image/png' });

    if (uploadError) {
      setBusy(false);
      toast({ variant: 'destructive', title: 'העלאה נכשלה', description: uploadError.message });
      return;
    }

    // Persist path to business_settings
    const column = kind === 'logo' ? 'logo_url' : 'signature_url';
    const payload = { ...form, [column]: path, user_id: user.id } as BusinessSettingsExt;
    const { error: dbError } = await supabase
      .from('business_settings')
      .upsert(payload, { onConflict: 'user_id' });

    if (dbError) {
      setBusy(false);
      toast({ variant: 'destructive', title: 'שגיאת שמירה', description: dbError.message });
      return;
    }

    // Update form state and refresh signed URL
    setForm((f) => ({ ...f, [column]: path }));
    const { data: signed } = await supabase.storage.from('business').createSignedUrl(path, 3600);
    if (signed?.signedUrl) {
      if (kind === 'logo') setLogoPreview(signed.signedUrl);
      else setSignaturePreview(signed.signedUrl);
    }

    setBusy(false);
    toast({ title: 'הועלה בהצלחה', description: kind === 'logo' ? 'הלוגו עודכן' : 'החתימה עודכנה' });
    router.refresh();
  }

  async function save() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = { ...form, user_id: user.id } as BusinessSettingsExt;
    const { error } = await supabase
      .from('business_settings')
      .upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'שגיאת שמירה', description: error.message });
    } else {
      toast({ title: 'נשמר', description: 'פרטי העסק עודכנו' });
      router.refresh();
    }
  }

  const brandColor = (form.brand_color as string) || DEFAULT_BRAND_COLOR;
  const pdfTheme = (form.pdf_theme as string) || DEFAULT_PDF_THEME;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>פרטי עסק</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="שם העסק (חובה)" required>
            <Input {...bind('business_name')} />
          </Field>
          <Field label="שם בעל העסק">
            <Input {...bind('owner_name')} />
          </Field>
          <Field label="ת״ז / ח.פ. (חובה)" required>
            <Input {...bind('tax_id')} />
          </Field>
          <Field label="טלפון">
            <Input {...bind('phone')} />
          </Field>
          <Field label="כתובת">
            <Input {...bind('address')} />
          </Field>
          <Field label="עיר">
            <Input {...bind('city')} />
          </Field>
          <Field label="דוא״ל עסקי">
            <Input type="email" {...bind('email')} />
          </Field>
          <Field label="סטטוס במס (יוצג בתחתית)">
            <Input {...bind('invoice_footer')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>לוגו וחתימה</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>לוגו העסק</Label>
            <p className="text-xs text-muted-foreground">
              מומלץ PNG עם רקע שקוף, מרובע
            </p>
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="לוגו" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">אין לוגו</span>
                )}
              </div>
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploadingLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAsset(file, 'logo');
                  }}
                />
                {uploadingLogo && (
                  <p className="text-xs text-muted-foreground mt-1">מעלה…</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>חתימה (תמונה)</Label>
            <p className="text-xs text-muted-foreground">
              מומלץ PNG עם רקע שקוף
            </p>
            <div className="flex items-center gap-4">
              <div className="h-24 w-32 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
                {signaturePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signaturePreview}
                    alt="חתימה"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">אין חתימה</span>
                )}
              </div>
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploadingSignature}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAsset(file, 'signature');
                  }}
                />
                {uploadingSignature && (
                  <p className="text-xs text-muted-foreground mt-1">מעלה…</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>עיצוב מסמכים</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="צבע מותג">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, brand_color: e.target.value }))
                }
                className="h-10 w-14 rounded-md border border-input cursor-pointer bg-background"
              />
              <span
                className="inline-block h-8 w-8 rounded-md border"
                style={{ backgroundColor: brandColor }}
                aria-hidden
              />
              <span className="text-sm font-mono text-muted-foreground">
                {brandColor}
              </span>
            </div>
          </Field>

          <Field label="ערכת עיצוב PDF">
            <Select
              value={pdfTheme}
              onValueChange={(value) =>
                setForm((f) => ({ ...f, pdf_theme: value }))
              }
              dir="rtl"
            >
              <SelectTrigger>
                <SelectValue placeholder="בחר ערכה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modern">מודרני (ברירת מחדל)</SelectItem>
                <SelectItem value="classic">קלאסי</SelectItem>
                <SelectItem value="minimal">מינימליסטי</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>פרטי בנק (אופציונלי - להעברות)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="שם הבנק">
            <Input {...bind('bank_name')} />
          </Field>
          <Field label="סניף">
            <Input {...bind('bank_branch')} />
          </Field>
          <Field label="חשבון">
            <Input {...bind('bank_account')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>רואה חשבון</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="שם רואה חשבון">
            <Input {...bind('accountant_name')} />
          </Field>
          <Field label="דוא״ל רואה חשבון">
            <Input type="email" {...bind('accountant_email')} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? 'שומר…' : 'שמור הגדרות'}
        </Button>
      </div>
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
