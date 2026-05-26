-- =========================================================
-- 0018: ייבוא היסטורי של מסמכים משנים קודמות
-- =========================================================
--
-- המשתמש רוצה להזין קבלות מ-2025 שהונפקו על נייר, עם המספרים
-- המקוריים שלהן (לדוגמה 50-142). הבעיה: ה-unique constraint על
-- (user_id, document_type, number) מונע מאיתנו להוסיף מספרים
-- שכבר נמצאים במערכת מ-2026.
--
-- הפתרון: שדה `is_historical` ו-unique CONSTRAINT חלקי שמחיל את
-- האילוץ רק על המסמכים החיים (לא היסטוריים). היסטוריים יכולים
-- לחיות עם כל מספר, גם כפול של מסמך חי, כי הם רק לארכיון.
--
-- ה-`document_counters` table לא מושפעת — היא מתעדת את המספור
-- הרץ של המסמכים החיים בלבד, וה-import לא קורא לפונקציה
-- next_document_number כך שהמונה לא עולה בעת ייבוא.

alter table public.documents
    add column if not exists is_historical boolean not null default false;

-- הסר את האילוץ הקיים (השם של ה-constraint תלוי איך postgres
-- יצר אותו — שם דיפולטי הוא documents_user_id_document_type_number_key,
-- אבל יש גם וריאציות. דוחף-מנסה את שני הוורסיות הנפוצות).
alter table public.documents
    drop constraint if exists documents_user_id_document_type_number_key;
alter table public.documents
    drop constraint if exists documents_user_id_document_type_number_unique;

-- partial unique — רק מסמכים חיים. היסטוריים פטורים.
create unique index if not exists documents_live_number_uniq
    on public.documents(user_id, document_type, number)
    where is_historical = false;

-- אינדקס לרשימת המסמכים ההיסטוריים (לעמוד דוחות שנתי, סינון, וכו׳).
create index if not exists documents_historical_idx
    on public.documents(user_id, is_historical, issue_date desc)
    where is_historical = true;
