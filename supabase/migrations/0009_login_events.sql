-- =========================================================
-- 0009: לוג התחברויות (מי נכנס, מתי, מאיפה, איזה מכשיר)
-- =========================================================

create table if not exists public.login_events (
    id          uuid primary key default uuid_generate_v4(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    ip          text,
    user_agent  text,
    provider    text,   -- 'password' / 'google' / 'recovery' וכו'
    success     boolean not null default true,
    created_at  timestamptz not null default now()
);

create index if not exists login_events_user_idx
    on public.login_events(user_id, created_at desc);

alter table public.login_events enable row level security;

-- המשתמש רואה רק את ההתחברויות של עצמו (קריאה בלבד; INSERT נעשה דרך service role
-- מתוך ה-API route, ולכן לא צריך policy של insert).
create policy "own_login_events_select" on public.login_events
    for select using (auth.uid() = user_id);
