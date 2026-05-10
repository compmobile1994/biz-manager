-- =========================================================
-- 0005: IMEI ואחריות לכל פריט (למכירת מכשירים)
-- =========================================================

alter table public.document_items
    add column if not exists imei text,
    add column if not exists warranty_months integer;
