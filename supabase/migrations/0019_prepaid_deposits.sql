-- =========================================================
-- 0019: מעקב הפקדות מקדמה לספקים (PayXpress, Tochman, וכו')
-- =========================================================
--
-- תרחיש: המשתמש מעביר 1,950₪ ל-PayXpress, ובמהלך הזמן נצרך מהקרדיט.
-- ה-1,950 הוא לא הוצאה — זו העברת כסף מהבנק לחשבון מקדמה אצל הספק.
-- ההוצאות הן רק מה שנצרך בפועל (לדוגמה 722.65₪).
--
-- הטבלה הזו מתעדת את ההפקדות. היתרה הזמינה לכל ספק מחושבת בזמן אמת:
--     balance = SUM(prepaid_deposits.amount) - SUM(expenses.amount)
--                 WHERE supplier_id = X
--
-- כך המשתמש רואה תמיד כמה יש לו ב-PayXpress / בכל ספק עם מקדמה.

create table if not exists public.prepaid_deposits (
    id            uuid primary key default uuid_generate_v4(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    supplier_id   uuid not null references public.suppliers(id) on delete cascade,
    deposit_date  date not null default current_date,
    amount        numeric(12,2) not null check (amount > 0),
    notes         text,
    receipt_url   text,                                        -- צילום קבלת ההפקדה (אופציונלי)
    created_at    timestamptz not null default now()
);

create index if not exists prepaid_deposits_user_idx on public.prepaid_deposits(user_id);
create index if not exists prepaid_deposits_supplier_idx on public.prepaid_deposits(supplier_id);
create index if not exists prepaid_deposits_date_idx on public.prepaid_deposits(user_id, deposit_date desc);

alter table public.prepaid_deposits enable row level security;

create policy "own_prepaid_deposits" on public.prepaid_deposits for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
