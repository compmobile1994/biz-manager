'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from './input';
import { Button } from './button';

/**
 * Date input with explicit prev/next month buttons.
 *   • Up arrow (^)   → previous month
 *   • Down arrow (v) → next month
 *
 * Wraps a native <input type="date"> so day-level editing still works via
 * the picker, but the buttons let users hop a full month in one tap —
 * which is the common case (last month's invoice, next month's expense, etc).
 */
export function DateInput({
  value,
  onChange,
  className,
}: {
  value: string; // YYYY-MM-DD
  onChange: (next: string) => void;
  className?: string;
}) {
  function shiftMonth(delta: number) {
    const base = value ? new Date(value + 'T00:00:00') : new Date();
    if (Number.isNaN(base.getTime())) return;
    const day = base.getDate();
    base.setMonth(base.getMonth() + delta);
    // Handle months with fewer days (Mar 31 + 1 month should land on Apr 30, not May 1)
    if (base.getDate() < day) base.setDate(0);
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, '0');
    const dd = String(base.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
  }

  return (
    <div className={`flex gap-1 items-stretch ${className ?? ''}`}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        title="חודש קודם"
        onClick={() => shiftMonth(-1)}
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Input
        type="date"
        className="flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        title="חודש הבא"
        onClick={() => shiftMonth(+1)}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
