import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from './onboarding-wizard';

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: settings } = await supabase
    .from('business_settings')
    .select('business_name, tax_id')
    .eq('user_id', user.id)
    .maybeSingle();

  // If user already completed onboarding (has both required fields), send them to the dashboard.
  if (settings?.business_name && settings?.tax_id) {
    redirect('/');
  }

  return <OnboardingWizard />;
}
