-- =========================================================
-- 0008: תאריך פרעון לצ'ק
-- =========================================================
-- (העמודות check_number / check_bank / check_branch / check_account
--  כבר קיימות ב-0001 — מוסיפים רק את תאריך הפרעון)

alter table public.payments
    add column if not exists check_due_date date;
