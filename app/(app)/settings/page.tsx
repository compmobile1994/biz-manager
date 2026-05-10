import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: settings } = await supabase
    .from('business_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">הגדרות עסק</h1>
        <p className="text-muted-foreground">פרטים שיופיעו בכל מסמך שתוציא</p>
      </div>
      <SettingsForm initial={settings} />
    </div>
  );
}
