import { createClient } from '@/lib/supabase/server';
import { SavedItemsClient } from './saved-items-client';

export default async function SavedItemsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('saved_items').select('*').eq('is_active', true).order('name');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">פריטים שמורים</h1>
        <p className="text-muted-foreground">
          תבניות לפריטים תכופים - לחיסכון בהקלדה בעת הוצאת קבלה. <strong>אין כאן מלאי</strong> - רק שם, תיאור ומחיר ברירת מחדל.
        </p>
      </div>
      <SavedItemsClient initial={data ?? []} />
    </div>
  );
}
