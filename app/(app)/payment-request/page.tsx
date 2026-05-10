import { createClient } from '@/lib/supabase/server';
import { PaymentRequestClient } from './payment-request-client';

export default async function PaymentRequestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: settings } = await supabase
    .from('business_settings')
    .select('business_name, owner_name, phone, bank_name, bank_branch, bank_account')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">שליחת פרטי תשלום</h1>
        <p className="text-muted-foreground">
          תבנית מהירה לשליחת פרטי תשלום (ביט / העברה בנקאית) ללקוח ב-WhatsApp.
          לא יוצרת קבלה - רק הודעה.
        </p>
      </div>
      <PaymentRequestClient
        businessName={settings?.business_name ?? 'העסק שלי'}
        ownerName={settings?.owner_name ?? null}
        bitPhone={settings?.phone ?? null}
        bankName={settings?.bank_name ?? null}
        bankBranch={settings?.bank_branch ?? null}
        bankAccount={settings?.bank_account ?? null}
      />
    </div>
  );
}
