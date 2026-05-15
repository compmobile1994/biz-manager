-- =========================================================
-- 0012: ניקיון מסד נתונים — פונקציה אטומית, אינדקסים חסרים, ועוד
-- =========================================================

-- 1) Pin search_path on next_document_number — Supabase linter warns about
--    SECURITY DEFINER functions without a fixed search_path (mutable schema
--    can be a privilege-escalation vector). We rewrite the function to set
--    it explicitly. The function body itself is unchanged.
create or replace function public.next_document_number(p_type text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid;
    v_next bigint;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception 'not authenticated';
    end if;

    insert into public.document_counters (user_id, document_type, last_number)
        values (v_user_id, p_type, 1)
    on conflict (user_id, document_type)
        do update set last_number = public.document_counters.last_number + 1
    returning last_number into v_next;

    return v_next;
end;
$$;

-- 2) Missing FK / lookup indexes — supports CASCADE + filter performance
create index if not exists documents_cancelled_by_idx
    on public.documents(cancelled_by_doc_id)
    where cancelled_by_doc_id is not null;

create index if not exists document_items_saved_item_idx
    on public.document_items(saved_item_id)
    where saved_item_id is not null;

-- 3) Composite index for dashboard's "recent docs" query ordered by created_at
create index if not exists documents_user_created_idx
    on public.documents(user_id, created_at desc);

notify pgrst, 'reload schema';
