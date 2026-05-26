import { z } from 'zod';

export const lineSchema = z.object({
  saved_item_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'תיאור חובה').max(500, 'תיאור ארוך מדי'),
  // Integer-only quantity/price/total (the receipts render whole shekels).
  // Server-side enforcement so a hand-crafted request can't bypass the UI rounding.
  quantity: z.number().int().positive('כמות חיובית שלמה'),
  unit_price: z.number().int().min(0, 'מחיר לא יכול להיות שלילי'),
  line_total: z.number().int().min(0),
  sort_order: z.number().int().nonnegative(),
  phone_number: z.string().max(30).nullable().optional(),
  // IMEI is 14-17 digits per the GSMA spec (most are 15). Reject anything else
  // so a malformed barcode read doesn't poison the receipt PDF.
  imei: z
    .string()
    .regex(/^\d{14,17}$/, 'IMEI חייב להיות 14-17 ספרות')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  // Generic free-text identifier per line (serial number, order #, SKU, etc).
  // Separate from IMEI which is digits-only and phone-specific.
  item_number: z.string().max(40).nullable().optional(),
  warranty_months: z.number().int().min(0).max(120).nullable().optional(),
  warranty_provider: z.string().max(120).nullable().optional(),
  importer_type: z.enum(['official', 'parallel']).nullable().optional(),
});

export const paymentSchema = z.object({
  method: z.enum(['cash', 'credit_card', 'bank_transfer', 'bit', 'check', 'other']),
  amount: z.number().int().min(0, 'סכום לא יכול להיות שלילי'),
  card_last4: z
    .string()
    .regex(/^\d{4}$/, '4 ספרות בדיוק')
    .max(4)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  card_holder: z.string().nullable().optional(),
  auth_code: z.string().nullable().optional(),
  check_number: z.string().nullable().optional(),
  check_bank: z.string().nullable().optional(),
  check_branch: z.string().nullable().optional(),
  check_account: z.string().nullable().optional(),
  check_due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  transfer_ref: z.string().nullable().optional(),
  other_description: z.string().nullable().optional(),
});

export const newDocumentSchema = z.object({
  document_type: z.enum(['receipt', 'invoice', 'invoice_receipt', 'credit']),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customer_id: z.string().uuid().nullable().optional(),
  customer_name_snapshot: z.string().min(1, 'שם לקוח חובה'),
  customer_tax_id_snapshot: z.string().nullable().optional(),
  customer_address_snapshot: z.string().nullable().optional(),
  customer_email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  customer_phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1, 'נדרשת לפחות שורה אחת'),
  payment: paymentSchema.nullable().optional(),
  // Split payments — when the user pays with two methods on one receipt
  // (e.g. cash + bit). At least 1 entry, at most 4 (sane upper bound).
  // If provided, the server inserts each entry as its own payments row
  // and ignores the single `payment` field above.
  payments: z.array(paymentSchema).min(1).max(4).optional(),
  // Historical mode — for back-filling past-year paper receipts.
  // When is_historical=true, the server skips next_document_number RPC,
  // uses manual_number as the receipt number, sets is_historical=true on
  // the row, and skips PDF generation.
  is_historical: z.boolean().optional(),
  manual_number: z.number().int().positive().optional(),
});
