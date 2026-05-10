-- =========================================================
-- 0002: סוג לקוח (קבוע / מזדמן) + רשימת תגים אופציונלית
-- =========================================================

-- הוספת סוג לקוח
alter table public.customers
    add column if not exists customer_type text not null default 'occasional'
        check (customer_type in ('regular', 'occasional'));

-- אינדקס לסינון מהיר
create index if not exists customers_type_idx on public.customers(user_id, customer_type);

-- אופציונלי: שדה תגים חופשי (כתובים בנפרד באמצעות פסיקים)
alter table public.customers
    add column if not exists tags text;

-- שדה לזיהוי לקוח קבוע - תאריך תחילת הקשר העסקי (שימושי לסטטיסטיקות)
alter table public.customers
    add column if not exists first_doc_at date;

-- =========================================================
-- שדה צבע ראשי לעיצוב המסמכים (משויך להגדרות עסק)
-- =========================================================
alter table public.business_settings
    add column if not exists brand_color text default '#2563eb';

-- =========================================================
-- שדה תבנית עיצוב למסמכים (modern / classic / minimal)
-- =========================================================
alter table public.business_settings
    add column if not exists pdf_theme text default 'modern'
        check (pdf_theme in ('modern', 'classic', 'minimal'));
