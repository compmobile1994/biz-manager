-- =========================================================
-- 0006: טיוטות מסמכים (שמירה לפני הפקה)
-- =========================================================

create table if not exists public.document_drafts (
    id          uuid primary key default uuid_generate_v4(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    label       text,
    data        jsonb not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists document_drafts_user_idx on public.document_drafts(user_id, updated_at desc);

alter table public.document_drafts enable row level security;

create policy "own_drafts" on public.document_drafts for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
