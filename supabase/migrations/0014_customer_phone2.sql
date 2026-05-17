-- =========================================================
-- 0014: שדה טלפון נוסף ללקוח (משרד / נייד אישי / וכו')
-- =========================================================

alter table public.customers
    add column if not exists phone2 text;

notify pgrst, 'reload schema';
