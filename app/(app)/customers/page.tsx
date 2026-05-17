import { createClient } from '@/lib/supabase/server';
import { CustomersClient } from './customers-client';

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from('customers')
    // Trim away user_id + created_at — not displayed nor edited on this page.
    .select('id, name, email, phone, phone2, address, tax_id, notes, customer_type')
    .order('name', { ascending: true });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">לקוחות</h1>
        <p className="text-muted-foreground">ניהול מאגר הלקוחות</p>
      </div>
      <CustomersClient initial={(customers as any) ?? []} />
    </div>
  );
}
