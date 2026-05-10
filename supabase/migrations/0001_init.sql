-- =========================================================
-- תוכנה לניהול עסק - סכמה ראשונית (עוסק פטור)
-- =========================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- =========================================================
-- 1. הגדרות עסק (רשומה אחת לכל משתמש)
-- =========================================================
create table public.business_settings (
    user_id           uuid primary key references auth.users(id) on delete cascade,
    business_name     text not null,
    owner_name        text,
    tax_id            text not null,                       -- ת"ז / ח.פ.
    business_type     text not null default 'osek_patur',  -- עוסק פטור/מורשה/חברה
    address           text,
    city              text,
    phone             text,
    email             text,
    logo_url          text,
    signature_url     text,
    bank_name         text,
    bank_branch       text,
    bank_account      text,
    accountant_email  text,                                -- מייל רואה חשבון
    accountant_name   text,
    invoice_footer    text default 'עוסק פטור',
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- =========================================================
-- 2. לקוחות
-- =========================================================
create table public.customers (
    id          uuid primary key default uuid_generate_v4(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    name        text not null,
    email       text,
    phone       text,
    address     text,
    tax_id      text,                                     -- ת"ז / ח.פ. של לקוח
    notes       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index customers_user_id_idx on public.customers(user_id);
create index customers_name_idx on public.customers(user_id, name);

-- =========================================================
-- 3. פריטים שמורים (תבניות בלבד - אין מלאי!)
-- =========================================================
create table public.saved_items (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    name            text not null,
    description     text,
    default_price   numeric(12,2) not null default 0,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index saved_items_user_id_idx on public.saved_items(user_id);

-- =========================================================
-- 4. מונה רץ למסמכים (sequence-like, atomic per user+type)
-- =========================================================
create table public.document_counters (
    user_id        uuid not null references auth.users(id) on delete cascade,
    document_type  text not null,                          -- 'receipt' / 'invoice' / 'invoice_receipt' / 'credit'
    last_number    bigint not null default 0,
    primary key (user_id, document_type)
);

-- פונקציה אטומית להקצאת המספר הבא
create or replace function public.next_document_number(p_type text)
returns bigint
language plpgsql
security definer
as $$
declare
    v_uid uuid := auth.uid();
    v_next bigint;
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    insert into public.document_counters (user_id, document_type, last_number)
        values (v_uid, p_type, 1)
        on conflict (user_id, document_type)
        do update set last_number = public.document_counters.last_number + 1
        returning last_number into v_next;

    return v_next;
end;
$$;

-- =========================================================
-- 5. מסמכים (קבלה / חשבונית עסקה / חשבונית עסקה+קבלה / זיכוי)
-- =========================================================
create table public.documents (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    document_type   text not null check (document_type in ('receipt','invoice','invoice_receipt','credit')),
    number          bigint not null,                       -- מספר רץ
    customer_id     uuid references public.customers(id) on delete set null,
    customer_name_snapshot  text not null,                 -- צילום בזמן ההוצאה
    customer_tax_id_snapshot text,
    customer_address_snapshot text,
    issue_date      date not null default current_date,
    subtotal        numeric(12,2) not null default 0,
    total           numeric(12,2) not null default 0,
    notes           text,
    status          text not null default 'issued' check (status in ('issued','cancelled')),
    cancelled_by_doc_id uuid references public.documents(id),  -- אם בוטל ע"י מסמך זיכוי
    pdf_url         text,
    sent_at         timestamptz,
    sent_via        text,                                  -- 'gmail'/'resend'/'whatsapp'/'sms'/'manual'
    created_at      timestamptz not null default now(),
    unique (user_id, document_type, number)
);

create index documents_user_id_idx on public.documents(user_id);
create index documents_date_idx on public.documents(user_id, issue_date desc);
create index documents_customer_idx on public.documents(customer_id);

-- =========================================================
-- 6. שורות מסמך (פריטים מרובים בכל קבלה)
-- =========================================================
create table public.document_items (
    id              uuid primary key default uuid_generate_v4(),
    document_id     uuid not null references public.documents(id) on delete cascade,
    saved_item_id   uuid references public.saved_items(id) on delete set null,
    description     text not null,
    quantity        numeric(12,3) not null default 1,
    unit_price      numeric(12,2) not null default 0,
    line_total      numeric(12,2) not null default 0,
    sort_order      int not null default 0
);

create index document_items_doc_id_idx on public.document_items(document_id);

-- =========================================================
-- 7. תשלומים (פירוט אופן התשלום למסמך)
-- =========================================================
create table public.payments (
    id              uuid primary key default uuid_generate_v4(),
    document_id     uuid not null references public.documents(id) on delete cascade,
    method          text not null check (method in ('cash','credit_card','bank_transfer','bit','check','other')),
    amount          numeric(12,2) not null,
    -- פרטים אופציונליים לפי סוג תשלום:
    card_last4      text,
    card_holder     text,
    auth_code       text,                                  -- אסמכתה
    check_number    text,
    check_bank      text,
    check_branch    text,
    check_account   text,
    transfer_ref    text,
    charged_at      timestamptz not null default now(),
    notes           text
);

create index payments_doc_id_idx on public.payments(document_id);

-- =========================================================
-- 8. קטגוריות הוצאה
-- =========================================================
create table public.expense_categories (
    id          uuid primary key default uuid_generate_v4(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    name        text not null,
    color       text,
    sort_order  int not null default 0,
    created_at  timestamptz not null default now()
);

create index expense_categories_user_idx on public.expense_categories(user_id);

-- =========================================================
-- 9. הוצאות
-- =========================================================
create table public.expenses (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    expense_date    date not null default current_date,
    vendor          text not null,
    category_id     uuid references public.expense_categories(id) on delete set null,
    amount          numeric(12,2) not null,
    description     text,
    payment_method  text check (payment_method in ('cash','credit_card','bank_transfer','bit','check','other')),
    reference       text,
    receipt_url     text,                                 -- צילום קבלה
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index expenses_user_idx on public.expenses(user_id);
create index expenses_date_idx on public.expenses(user_id, expense_date desc);
create index expenses_category_idx on public.expenses(category_id);

-- =========================================================
-- 10. Row Level Security
-- =========================================================
alter table public.business_settings enable row level security;
alter table public.customers enable row level security;
alter table public.saved_items enable row level security;
alter table public.documents enable row level security;
alter table public.document_items enable row level security;
alter table public.payments enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.document_counters enable row level security;

-- מדיניות: כל משתמש רואה רק את הנתונים שלו
create policy "own_business_settings" on public.business_settings for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_customers" on public.customers for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_saved_items" on public.saved_items for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_documents" on public.documents for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_document_items" on public.document_items for all
    using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()))
    with check (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));

create policy "own_payments" on public.payments for all
    using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()))
    with check (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));

create policy "own_expense_categories" on public.expense_categories for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_expenses" on public.expenses for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_document_counters" on public.document_counters for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- 11. Storage buckets (יש ליצור ידנית ב-Supabase Studio)
-- =========================================================
-- 1) bucket: 'documents'  (private) - PDFs של מסמכים
-- 2) bucket: 'expenses'   (private) - צילומי קבלות הוצאות
-- 3) bucket: 'business'   (private) - לוגו וחתימה

-- =========================================================
-- 12. קטגוריות הוצאה ברירת מחדל (יוצרות ב-trigger ראשון)
-- =========================================================
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
as $$
begin
    insert into public.expense_categories (user_id, name, sort_order) values
        (new.id, 'משרד וציוד', 1),
        (new.id, 'רכב ותחבורה', 2),
        (new.id, 'תקשורת ואינטרנט', 3),
        (new.id, 'שיווק ופרסום', 4),
        (new.id, 'ספקים וסחורה', 5),
        (new.id, 'ייעוץ מקצועי', 6),
        (new.id, 'אחזקה', 7),
        (new.id, 'אחר', 99);
    return new;
end;
$$;

-- הטריגר נוסף על auth.users; אם אין הרשאה, אפשר להריץ ידנית למשתמש קיים.
