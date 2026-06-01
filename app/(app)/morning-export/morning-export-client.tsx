'use client';

import { useState } from 'react';
import { Download, Users, Truck, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

interface CustomerRow {
  name: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
}

interface SupplierRow {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
}

// CSV cell escape: wrap in double-quotes if the value contains comma,
// quote, or newline; double any internal quotes per RFC 4180.
function csvCell(v: string | null | undefined): string {
  const s = (v ?? '').toString();
  if (s === '') return '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(headers: string[], rows: (string | null | undefined)[][]): Blob {
  // BOM so Excel-Hebrew opens the file in proper UTF-8.
  const bom = '﻿';
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function MorningExportClient({
  customers,
  suppliers,
  nextReceiptNumber,
}: {
  customers: CustomerRow[];
  suppliers: SupplierRow[];
  nextReceiptNumber: number;
}) {
  const { toast } = useToast();
  const [downloadedCustomers, setDownloadedCustomers] = useState(false);
  const [downloadedSuppliers, setDownloadedSuppliers] = useState(false);

  function downloadCustomers() {
    const headers = ['שם', 'מייל', 'טלפון', 'טלפון נוסף', 'כתובת', 'ת״ז / ח.פ.', 'הערות'];
    const rows = customers.map((c) => [
      c.name,
      c.email,
      c.phone,
      c.phone2,
      c.address,
      c.tax_id,
      c.notes,
    ]);
    const blob = buildCsv(headers, rows);
    download(blob, `morning-customers-${customers.length}.csv`);
    setDownloadedCustomers(true);
    toast({ title: `${customers.length} לקוחות יוצאו` });
  }

  function downloadSuppliers() {
    const headers = ['שם', 'מייל', 'טלפון', 'כתובת', 'ח.פ.', 'הערות'];
    const rows = suppliers.map((s) => [
      s.name,
      s.email,
      s.phone,
      s.address,
      s.tax_id,
      s.notes,
    ]);
    const blob = buildCsv(headers, rows);
    download(blob, `morning-suppliers-${suppliers.length}.csv`);
    setDownloadedSuppliers(true);
    toast({ title: `${suppliers.length} ספקים יוצאו` });
  }

  return (
    <div className="space-y-4">
      {/* Important info card — receipt numbering */}
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <Info className="h-5 w-5" />
            הגדרה חשובה ב-Morning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-amber-900">
          <p>
            <strong>המספור הבא שלך:</strong> כשתפתח חשבון ב-Morning, בקש מהם להגדיר את המספור
            ההתחלתי של הקבלות ל-
            <span className="font-bold text-lg">#{nextReceiptNumber}</span>.
          </p>
          <p className="text-xs">
            ככה המספור ימשיך ברצף מהמערכת שלנו (האחרון אצלנו: #{nextReceiptNumber - 1}). זה דרישה
            חוקית של רשות המיסים — אסור דילוגים במספור.
          </p>
        </CardContent>
      </Card>

      {/* Customers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              לקוחות
              {downloadedCustomers && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {customers.length} רשומות
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            כל הלקוחות שלך — שם, טלפון, מייל, כתובת, ת״ז/ח.פ., הערות. אחרי ההורדה תוכל לעלות אותו
            ל-Morning דרך מסך "ייבוא לקוחות".
          </p>
          <Button onClick={downloadCustomers} disabled={customers.length === 0} className="w-full sm:w-auto">
            <Download className="h-4 w-4" />
            הורד CSV לקוחות
          </Button>
        </CardContent>
      </Card>

      {/* Suppliers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              ספקים
              {downloadedSuppliers && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {suppliers.length} רשומות
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            כל הספקים שלך (PayXpress, מולטיזון, טונוס וכו׳) — שם, טלפון, מייל, כתובת, ח.פ., הערות.
            תעלה ל-Morning דרך מסך "ייבוא ספקים".
          </p>
          <Button onClick={downloadSuppliers} disabled={suppliers.length === 0} className="w-full sm:w-auto">
            <Download className="h-4 w-4" />
            הורד CSV ספקים
          </Button>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>השלבים הבאים</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 list-decimal mr-5">
            <li>הורד את 2 הקבצים מעלה (לקוחות + ספקים)</li>
            <li>פתח את חשבונית ירוקה / Morning</li>
            <li>בקש מהם להגדיר <strong>מספור התחלתי = {nextReceiptNumber}</strong></li>
            <li>כנס ל-<strong>הגדרות → ייבוא נתונים</strong> במורנינג</li>
            <li>העלה את ה-CSV של הלקוחות → אשר את ההתאמת עמודות</li>
            <li>חזור על אותה פעולה עם ה-CSV של הספקים</li>
            <li>מהקבלה הבאה — הוצא אותה <strong>ישירות ב-Morning</strong> (לא אצלנו)</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
            💡 <strong>אם Morning מבקש פורמט עמודות שונה</strong> — פתח את ה-CSV ב-Excel ושנה את שמות הכותרות
            לשמות שהם מצפים. הנתונים עצמם בסדר.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
