'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { he } from 'date-fns/locale';
import { ChevronRight, ChevronLeft, Calendar as CalendarIcon } from 'lucide-react';
import 'react-day-picker/style.css';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string; // YYYY-MM-DD or empty
  onChange: (next: string) => void;
  className?: string;
}

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const CURRENT_YEAR = new Date().getFullYear();
// 10 years back, 5 years forward — enough for both historical receipts and planning
const YEAR_RANGE = Array.from({ length: 16 }, (_, i) => CURRENT_YEAR - 10 + i);

function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function dateToIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Custom date picker with predictable RTL navigation:
 *   • ↑ Up arrow   → previous month
 *   • ↓ Down arrow → next month
 *
 * Uses react-day-picker under the hood for the calendar grid, but with
 * a custom caption that places navigation buttons exactly where the user
 * expects them.
 */
export function DatePicker({ value, onChange, className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = isoToDate(value);
  const [month, setMonth] = React.useState<Date>(selected ?? new Date());

  React.useEffect(() => {
    if (selected) setMonth(selected);
  }, [value]);

  function pick(d: Date | undefined) {
    if (!d) return;
    onChange(dateToIso(d));
    setOpen(false);
  }

  function shift(delta: number) {
    const d = new Date(month);
    d.setMonth(d.getMonth() + delta);
    setMonth(d);
  }

  const display = selected
    ? selected.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-white px-3 py-2 text-sm',
            'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-ring',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className={display ? '' : 'text-muted-foreground'}>{display || 'בחר תאריך'}</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 rounded-md border bg-white shadow-lg p-3 w-[320px] max-w-[calc(100vw-1rem)]"
          dir="rtl"
          // Avoid the popover stealing the touch from the trigger on iOS
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Custom caption: prev/next month buttons + month/year quick selectors.
              RTL semantics: ChevronRight points right = visually "back" in RTL
              reading direction, so prev month. ChevronLeft = forward = next month.
              Buttons are 44×44 minimum for reliable touch on phones. */}
          <div className="flex items-center justify-between mb-2 px-1 gap-2">
            <button
              type="button"
              className="h-11 w-11 shrink-0 rounded-md flex items-center justify-center hover:bg-slate-100 active:bg-slate-200"
              title="חודש קודם"
              aria-label="חודש קודם"
              onClick={() => shift(-1)}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="flex gap-1 flex-1 min-w-0">
              <select
                className="h-11 rounded border bg-white px-2 text-sm flex-1 min-w-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={month.getMonth()}
                onChange={(e) => {
                  const d = new Date(month);
                  d.setMonth(Number(e.target.value));
                  setMonth(d);
                }}
                aria-label="חודש"
              >
                {HEBREW_MONTHS.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
              <select
                className="h-11 rounded border bg-white px-2 text-sm w-24 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={month.getFullYear()}
                onChange={(e) => {
                  const d = new Date(month);
                  d.setFullYear(Number(e.target.value));
                  setMonth(d);
                }}
                aria-label="שנה"
              >
                {YEAR_RANGE.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="h-11 w-11 shrink-0 rounded-md flex items-center justify-center hover:bg-slate-100 active:bg-slate-200"
              title="חודש הבא"
              aria-label="חודש הבא"
              onClick={() => shift(+1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>

          <DayPicker
            mode="single"
            selected={selected}
            onSelect={pick}
            month={month}
            onMonthChange={setMonth}
            locale={he}
            dir="rtl"
            showOutsideDays
            hideNavigation
            classNames={{
              today: 'rdp-today bg-blue-100 text-blue-900 rounded',
              selected: 'rdp-selected bg-blue-600 text-white rounded',
              // Larger touch targets — 40×40 px (close to the 44px ideal,
              // any larger and the 7-col grid overflows on narrow phones).
              day_button: 'h-10 w-10 p-0 hover:bg-slate-100 rounded-md text-sm font-medium',
              day: 'p-0.5',
              weekday: 'text-xs text-muted-foreground font-semibold pb-1',
              outside: 'text-slate-300',
            }}
          />

          <div className="flex justify-between mt-3 px-1 gap-2">
            <button
              type="button"
              className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
              onClick={() => onChange('')}
            >
              ניקוי
            </button>
            <button
              type="button"
              className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md font-medium"
              onClick={() => {
                const today = new Date();
                onChange(dateToIso(today));
                setOpen(false);
              }}
            >
              היום
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
