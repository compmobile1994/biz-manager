-- =========================================================
-- 0003: Storage RLS Policies
-- מאפשר למשתמש מאומת להעלות / לקרוא / לעדכן / למחוק רק קבצים
-- שנמצאים בתיקייה השווה ל-user_id שלו, בתוך 3 ה-buckets שלנו.
-- =========================================================

-- bucket: 'business' (לוגו, חתימה)
create policy "business_owner_select" on storage.objects for select
    using (bucket_id = 'business' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "business_owner_insert" on storage.objects for insert
    with check (bucket_id = 'business' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "business_owner_update" on storage.objects for update
    using (bucket_id = 'business' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'business' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "business_owner_delete" on storage.objects for delete
    using (bucket_id = 'business' and (storage.foldername(name))[1] = auth.uid()::text);

-- bucket: 'documents' (PDFs של מסמכים)
create policy "documents_owner_select" on storage.objects for select
    using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_owner_insert" on storage.objects for insert
    with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_owner_update" on storage.objects for update
    using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_owner_delete" on storage.objects for delete
    using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- bucket: 'expenses' (צילומי קבלות הוצאות)
create policy "expenses_owner_select" on storage.objects for select
    using (bucket_id = 'expenses' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "expenses_owner_insert" on storage.objects for insert
    with check (bucket_id = 'expenses' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "expenses_owner_update" on storage.objects for update
    using (bucket_id = 'expenses' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'expenses' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "expenses_owner_delete" on storage.objects for delete
    using (bucket_id = 'expenses' and (storage.foldername(name))[1] = auth.uid()::text);
