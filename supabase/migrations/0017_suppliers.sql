-- =========================================================
-- 0017: טבלת ספקים + קישור הוצאה→ספק
-- =========================================================
--
-- מקביל ל-customers — לכל משתמש (RLS) רשימת ספקים שממנם הוא קונה.
-- expenses.supplier_id מקשר הוצאה לרשומת ספק. ה-vendor (טקסט חופשי)
-- נשאר כ-snapshot של השם בעת ההוצאה, כדי שלא נאבד אינפו אם הספק
-- נמחק אחר כך, ובשביל תאימות לאחור עם הוצאות ישנות שלא היו מקושרות.

create table if not exists public.suppliers (
    id          uuid primary key default uuid_generate_v4(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    name        text not null,
    phone       text,
    email       text,
    address     text,
    tax_id      text,                                     -- ח.פ. של הספק (אם רלוונטי)
    notes       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists suppliers_user_id_idx on public.suppliers(user_id);
create index if not exists suppliers_name_idx on public.suppliers(user_id, name);

alter table public.suppliers enable row level security;

create policy "own_suppliers" on public.suppliers for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- קישור אופציונלי מהוצאה לרשומת ספק. set null כדי לאפשר מחיקת ספק
-- בלי לאבד הוצאות היסטוריות.
alter table public.expenses
    add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists expenses_supplier_idx on public.expenses(supplier_id);

-- Migration helper: לכל vendor טקסט שכבר קיים ב-expenses, נצור רשומת
-- supplier וניקשר אליה. גם הוצאות עתידיות שיוקלדו ידנית יהיו עם
-- supplier_id null עד שהמשתמש יקשר ידנית או יבחר מהרשימה.
do $$
declare
    rec record;
    new_id uuid;
begin
    for rec in
        select user_id, vendor
        from public.expenses
        where vendor is not null and trim(vendor) <> ''
        group by user_id, vendor
    loop
        insert into public.suppliers (user_id, name)
        values (rec.user_id, rec.vendor)
        on conflict do nothing
        returning id into new_id;

        -- on_conflict שולח null ל-returning. ננסה לקבל את ה-id הקיים אם
        -- כבר הייתה רשומה (לא ייקרה כאן כי אין unique constraint, אבל
        -- ה-loop מקובץ לפי vendor יוצר רק אחד לכל ספק).
        if new_id is null then
            select id into new_id
            from public.suppliers
            where user_id = rec.user_id and name = rec.vendor
            limit 1;
        end if;

        update public.expenses
        set supplier_id = new_id
        where user_id = rec.user_id and vendor = rec.vendor and supplier_id is null;
    end loop;
end$$;
