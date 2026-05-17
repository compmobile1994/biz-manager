-- =========================================================
-- 0013: cancel_document RPC — single canonical path to cancel a receipt
-- =========================================================
-- The previous `own_documents_update` policy allowed the authenticated user
-- to UPDATE any column on any of their docs, which legally is too broad:
--   - could un-cancel a cancelled doc (status='cancelled' → 'issued')
--   - could mutate number / issue_date / total / customer_name_snapshot
--     on an already-issued receipt
-- Israeli עוסק פטור law: an issued receipt is immutable. Only cancellation
-- via a counter-receipt is allowed.
--
-- This RPC enforces the only legitimate state transition: status='issued'
-- → 'cancelled'. The app's cancel button now calls this RPC instead of
-- doing a direct UPDATE on the documents row.

create or replace function public.cancel_document(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user uuid;
    v_status text;
    v_owner uuid;
begin
    v_user := auth.uid();
    if v_user is null then
        raise exception 'not authenticated' using errcode = '42501';
    end if;

    select user_id, status into v_owner, v_status
    from public.documents where id = p_id;

    if v_owner is null then
        raise exception 'document not found' using errcode = 'P0002';
    end if;
    if v_owner <> v_user then
        raise exception 'forbidden' using errcode = '42501';
    end if;
    if v_status <> 'issued' then
        raise exception 'cannot cancel — current status %', v_status using errcode = 'P0001';
    end if;

    update public.documents
       set status = 'cancelled'
     where id = p_id;
end;
$$;

grant execute on function public.cancel_document(uuid) to authenticated;

notify pgrst, 'reload schema';
