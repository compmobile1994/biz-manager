# 📋 ניהול עסק — תוכנת ניהול לעוסק פטור

PWA בעברית RTL לניהול עסק קטן: קבלות, חשבוניות עסקה, הוצאות ודוח שנתי לרואה חשבון. עובדת גם במחשב וגם בטלפון - אותה תוכנה בדיוק.

## ✨ יכולות

- 🧾 **הוצאת מסמכים** - קבלה / חשבונית עסקה / חשבונית עסקה+קבלה, עם **שורות פריטים מרובות** ומספור רץ אטומי
- 📄 **PDF בעברית RTL** מוכן לשליחה ולהדפסה
- 📤 **שליחה ב-4 ערוצים**: Gmail (מהמייל שלך), Resend, WhatsApp ו-SMS
- 👥 **לקוחות** - מאגר לקוחות עם היסטוריית מסמכים
- 📦 **פריטים שמורים** - תבניות לבחירה מהירה (ללא ניהול מלאי)
- 💰 **הוצאות** - רישום עם קטגוריות וצילום קבלה מהמצלמה
- 📊 **דשבורד** - הכנסות, הוצאות וגרף 12 חודשים
- 📈 **ייצוא שנתי לרואה חשבון** - חבילת ZIP עם 3 גליונות Excel + כל ה-PDFs וצילומי הקבלות
- 📱 **PWA** - התקנה כאפליקציה על Android, iOS, Windows ו-Mac

## 🚀 התקנה ראשונית

### 1. דרישות מקדימות

- [Node.js 18+](https://nodejs.org/)
- חשבון Google (לחיבור Gmail אופציונלי)

### 2. צור פרויקט Supabase (חינמי)

1. היכנס ל-[supabase.com](https://supabase.com) והירשם
2. צור פרויקט חדש (בחר אזור EU)
3. אחרי שהפרויקט מוכן, היכנס ל-**Project Settings → API** והעתק:
   - `Project URL`
   - `anon public` key
   - `service_role` key (סודי!)

### 3. הרץ את ה-Migration

ב-Supabase Studio של הפרויקט:
- היכנס ל-**SQL Editor**
- העתק את התוכן של `supabase/migrations/0001_init.sql`
- הדבק והרץ

### 4. צור את ה-Buckets ל-Storage

ב-Supabase Studio:
- **Storage → New bucket** ויצור 3 דליים פרטיים (private):
  - `documents` (לקבצי PDF של מסמכים)
  - `expenses` (לצילומי קבלות הוצאות)
  - `business` (ללוגו וחתימה - אופציונלי)

### 5. הגדר משתני סביבה

```bash
cp .env.example .env.local
```

ערוך את `.env.local` והדבק את המפתחות מ-Supabase. שאר ההגדרות (Gmail / Resend) הן אופציונליות.

### 6. התקנה והרצה

```bash
npm install
npm run dev
```

האפליקציה זמינה ב-[http://localhost:3000](http://localhost:3000)

### 7. הרשמה ראשונה

- היכנס ל-[http://localhost:3000](http://localhost:3000)
- לחץ "הרשמה" והירשם (כניסת Google זמינה אם הגדרת OAuth ב-Supabase Auth)
- היכנס ל-**הגדרות** ומלא את פרטי העסק (חובה לפני הוצאת מסמך ראשון)

## 📧 חיבור Gmail (אופציונלי)

כדי לשלוח קבלות מהמייל שלך:

1. גש ל-[console.cloud.google.com](https://console.cloud.google.com)
2. צור פרויקט חדש
3. **APIs & Services → Library** והפעל את **Gmail API**
4. **OAuth consent screen** - בחר "External" ומלא פרטי בסיס
5. **Credentials → Create Credentials → OAuth Client ID**:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
6. העתק את ה-Client ID ו-Client Secret ל-`.env.local`
7. בתוך האפליקציה, גש ל-`/api/auth/google/connect` (פעם אחת בלבד) ואשר הרשאות

## 📨 חיבור Resend (אופציונלי, גיבוי לשליחת מייל)

1. הירשם ב-[resend.com](https://resend.com) (חינמי 3000 מיילים/חודש)
2. **API Keys → Create API Key**
3. העתק ל-`RESEND_API_KEY` ב-`.env.local`
4. ברירת מחדל: השליחה תהיה מ-`onboarding@resend.dev`. כדי לשלוח מהדומיין שלך - הוסף דומיין ב-Resend.

## 🌍 פריסה ב-Production

### Vercel (חינמי)

1. דחוף את הקוד ל-GitHub
2. גש ל-[vercel.com](https://vercel.com), חבר את הריפו
3. הוסף את משתני הסביבה (אותם מ-`.env.local`)
4. הוסף את ה-domain שלך כ-redirect URI ב-Supabase Auth ובחיבור Google
5. **Deploy**

האפליקציה תהיה זמינה ב-`https://your-project.vercel.app` וניתן יהיה להתקין אותה כ-PWA במכשיר.

## 📱 התקנה כאפליקציה

### במחשב (Chrome / Edge)
- כשפתוחה האפליקציה - לחץ על הסמל "התקן" בשורת הכתובת
- או: תפריט הדפדפן → **Apps → Install**

### באייפון
- פתח באפליקציית Safari
- שתף → **Add to Home Screen**

### באנדרואיד
- הדפדפן יציע להוסיף לדף הבית אוטומטית
- או: תפריט → **Install app**

## 🗂️ מבנה הפרויקט

```
app/
  (app)/                # Routes שדורשים אימות (כל המסכים)
    page.tsx              דשבורד
    documents/            מסמכים + יצירה + תצוגה
    customers/            ניהול לקוחות
    saved-items/          תבניות פריטים
    expenses/             הוצאות
    reports/              ייצוא שנתי
    settings/             הגדרות עסק
  api/
    documents/route.ts    יצירת מסמך + מספור אטומי
    email/{gmail,resend}  שליחת קבלות
    export/year           ייצוא ZIP שנתי
    auth/                 OAuth (Supabase + Google)
  login/                  כניסה / הרשמה

lib/
  pdf/document-pdf.ts     יצירת PDF בעברית RTL
  export/year-package.ts  בניית חבילת ה-ZIP לרואה חשבון
  supabase/               clients
  validation.ts           Zod schemas

supabase/migrations/      schema + RLS policies
```

## 📝 הערות חוקיות (עוסק פטור)

- מסמכים שהוצאו לא ניתנים למחיקה - רק ביטול דרך מסמך זיכוי
- מספור רץ נשמר אטומית במסד הנתונים (אין דילוגים)
- כל מסמך כולל: שם העסק, ת"ז, פרטי הלקוח, פירוט הפריטים והכיתוב "עוסק פטור"
- חוק חובת ניהול מסמכים: שמור את המסמכים לפחות **7 שנים** (חוק רשות המסים)

## 🔮 פיתוח עתידי

- [ ] חשבוניות חוזרות (אוטומציה חודשית)
- [ ] חיבור סליקת אשראי אמיתית (Cardcom / Tranzila)
- [ ] תזכורות אוטומטיות לתשלום
- [ ] תמיכה במעבר לעוסק מורשה (חשבונית מס + מע"מ + חשבונית ישראל)
