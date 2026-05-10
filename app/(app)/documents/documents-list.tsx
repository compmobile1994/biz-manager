'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DocumentRow, DocumentType } from '@/lib/supabase/types';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { documentTypeLabel, formatCurrency, formatDate } from '@/lib/utils';

type StatusFilter = 'all' | 'issued' | 'cancelled';
type TypeFilter = 'all' | DocumentType;

export function DocumentsList({ initial }: { initial: DocumentRow[] }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((d) => {
      if (q && !(d.customer_name_snapshot ?? '').toLowerCase().includes(q)) return false;
      if (typeFilter !== 'all' && d.document_type !== typeFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (fromDate && d.issue_date < fromDate) return false;
      if (toDate && d.issue_date > toDate) return false;
      return true;
    });
  }, [initial, search, typeFilter, statusFilter, fromDate, toDate]);

  const total = filtered.reduce(
    (sum, d) => (d.status === 'cancelled' ? sum : sum + Number(d.total)),
    0,
  );

  const statusButtons: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'הכל' },
    { value: 'issued', label: 'פעיל' },
    { value: 'cancelled', label: 'בוטל' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="חיפוש לפי שם לקוח..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                <SelectItem value="receipt">קבלה</SelectItem>
                <SelectItem value="invoice">חשבונית עסקה</SelectItem>
                <SelectItem value="invoice_receipt">חשבונית עסקה+קבלה</SelectItem>
                <SelectItem value="credit">זיכוי</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              {statusButtons.map((b) => (
                <Button
                  key={b.value}
                  type="button"
                  variant={statusFilter === b.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(b.value)}
                >
                  {b.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">מתאריך</label>
              <div className="w-44">
                <DatePicker value={fromDate} onChange={setFromDate} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">עד תאריך</label>
              <div className="w-44">
                <DatePicker value={toDate} onChange={setToDate} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 flex justify-between items-center flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">
            מציג {filtered.length} מתוך {initial.length} מסמכים
          </span>
          <span className="text-sm">
            <span className="text-muted-foreground">סה״כ: </span>
            <span className="font-bold text-lg">{formatCurrency(total)}</span>
          </span>
        </CardContent>
      </Card>

      {initial.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            עדיין לא הוצאת מסמכים. לחץ "מסמך חדש" כדי להתחיל.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            לא נמצאו מסמכים התואמים את הסינון.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((d) => (
                <Link
                  key={d.id}
                  href={`/documents/${d.id}`}
                  className="flex items-center justify-between p-4 hover:bg-accent/50"
                >
                  <div>
                    <p className="font-semibold">
                      {documentTypeLabel[d.document_type]} #{d.number}
                      {d.status === 'cancelled' && (
                        <span className="text-destructive text-xs mr-2">(בוטל)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.customer_name_snapshot} · {formatDate(d.issue_date)}
                    </p>
                  </div>
                  <span
                    className={
                      d.status === 'cancelled'
                        ? 'line-through text-muted-foreground'
                        : 'font-semibold'
                    }
                  >
                    {formatCurrency(Number(d.total))}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
