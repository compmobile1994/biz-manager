'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { he } from 'date-fns/locale';
import { ChevronUp, ChevronDown, Calendar as CalendarIcon } from 'lucide-react';
import 'react-day-picker/style.css';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string; // YYYY-MM-DD or empty
  onChange: (next: string) => void;
  className?: string;
}

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
          className="z-50 rounded-md border bg-white shadow-lg p-3"
          dir="rtl"
        >
          {/* Custom caption with prev/next month buttons */}
          <div className="flex items-center justify-between mb-2 px-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="חודש קודם"
              onClick={() => shift(-1)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <div className="font-semibold text-sm">
              {month.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="חודש הבא"
              onClick={() => shift(+1)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
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
              day_button: 'h-8 w-8 p-0 hover:bg-slate-100 rounded-md text-sm',
              weekday: 'text-xs text-muted-foreground font-semibold',
              outside: 'text-slate-300',
            }}
          />

          <div className="flex justify-between mt-2 px-1">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-blue-600"
              onClick={() => onChange('')}
            >
              ניקוי
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-blue-600"
              onClick={() => {
                const today = new Date();
                onChange(dateToIso(today));
                setOpen(false);
              }}
            >
              היום
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
