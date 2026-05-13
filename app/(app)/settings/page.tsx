import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './settings-form';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, ChevronLeft } from 'lucide-react';

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

      {/* Quick links */}
      <Link href="/settings/security" className="block">
        <Card className="hover:bg-muted/50 transition-colors">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-blue-700" />
              <div>
                <p className="font-semibold">אבטחה והתחברויות</p>
                <p className="text-xs text-muted-foreground">צפה בכל ההתחברויות האחרונות + התנתקות מכל המכשירים</p>
              </div>
            </div>
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <SettingsForm initial={settings} />
    </div>
  );
}
