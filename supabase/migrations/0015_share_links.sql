-- =========================================================
-- 0015: קישורי שיתוף קצרים לקבלות (מתאחדים ל-PDF אחד)
-- =========================================================
-- כדי ש-WhatsApp ייפתח אוטומטית עם הודעה נקייה, צריך URL קצר.
-- במקום לשלוח את ה-signed URL הארוך של Supabase Storage, אנחנו
-- יוצרים short code (8 תווים) ב-share_links, שולחים
-- biz-manager-ochre.vercel.app/p/<code> ב-WhatsApp, וכשהמקבל
-- לוחץ — השרת מאחד את ה-PDFים בזמן אמת ומחזיר אותם.
-- =========================================================

create table if not exists public.share_links (
    code        text primary key,
    user_id     uuid not null references auth.users(id) on delete cascade,
    doc_ids     uuid[] not null,
    copy_mode   text not null default 'auto' check (copy_mode in ('auto', 'original', 'copy')),
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null default (now() + interval '90 days')
);

create index if not exists share_links_user_idx on public.share_links(user_id, created_at desc);
create index if not exists share_links_expires_idx on public.share_links(expires_at);

alter table public.share_links enable row level security;

-- Only the owner can SELECT / INSERT / DELETE their own links via the JS
-- client. The /p/<code> public route uses the service-role key to read
-- by code without RLS — that's the only way an unauthenticated recipient
-- can resolve the link.
do $$ begin
  create policy "own_share_links" on public.share_links for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
