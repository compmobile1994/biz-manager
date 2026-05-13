-- =========================================================
-- 0007: ספק האחריות + סוג היבוא (רשמי / מקביל) למכירת מכשירים
-- =========================================================

alter table public.document_items
    add column if not exists warranty_provider text,
    add column if not exists importer_type text;

-- Enforce allowed values for importer_type (NULL is allowed = not applicable)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_items_importer_type_check'
  ) then
    alter table public.document_items
      add constraint document_items_importer_type_check
      check (importer_type is null or importer_type in ('official', 'parallel'));
  end if;
end $$;
