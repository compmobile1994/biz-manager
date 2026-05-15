-- =========================================================
-- 0011: חסימת DELETE על מסמכים שהונפקו (דרישה חוקית לעוסק פטור)
-- =========================================================
--
-- חוק ישראלי: אסור למחוק קבלה שהונפקה. רק אפשר לבטל אותה (status='cancelled').
-- כאן אנחנו מפצלים את ה-policy "for all" לפעולות נפרדות:
--   SELECT - מותר על שלי
--   INSERT - מותר על שלי
--   UPDATE - מותר על שלי (לצורך ביטול ועדכון pdf_url)
--   DELETE - חסום! לא ניתן למחוק מסמך שהונפק
-- ה-API משתמש ב-service role בלבד כשצריך rollback אמיתי.

-- =========================================================
-- documents
-- =========================================================
drop policy if exists "own_documents" on public.documents;

do $$ begin
  create policy "own_documents_select" on public.documents
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own_documents_insert" on public.documents
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own_documents_update" on public.documents
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- שים לב: לא יוצרים policy ל-DELETE — בלעדיו ה-RLS חוסם כל מחיקה.

-- =========================================================
-- document_items
-- =========================================================
drop policy if exists "own_document_items" on public.document_items;

do $$ begin
  create policy "own_items_select" on public.document_items for select using (
    exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own_items_insert" on public.document_items for insert with check (
    exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

-- לא יוצרים DELETE / UPDATE — RLS חוסם

-- =========================================================
-- payments
-- =========================================================
drop policy if exists "own_payments" on public.payments;

do $$ begin
  create policy "own_payments_select" on public.payments for select using (
    exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own_payments_insert" on public.payments for insert with check (
    exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

-- לא יוצרים DELETE / UPDATE - RLS חוסם

notify pgrst, 'reload schema';
