import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export const documentTypeLabel: Record<string, string> = {
  receipt: 'קבלה',
  invoice: 'חשבונית עסקה',
  invoice_receipt: 'חשבונית עסקה / קבלה',
  credit: 'חשבונית זיכוי',
};

export const paymentMethodLabel: Record<string, string> = {
  cash: 'מזומן',
  credit_card: 'אשראי',
  bank_transfer: 'העברה בנקאית',
  bit: 'ביט',
  check: 'צ׳ק',
  other: 'אחר',
};
