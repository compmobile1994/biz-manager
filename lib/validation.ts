import { z } from 'zod';

export const lineSchema = z.object({
  saved_item_id: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'תיאור חובה'),
  quantity: z.number().positive('כמות חיובית'),
  unit_price: z.number().min(0),
  line_total: z.number().min(0),
  sort_order: z.number().int().nonnegative(),
  phone_number: z.string().nullable().optional(),
  imei: z.string().nullable().optional(),
  warranty_months: z.number().int().nullable().optional(),
  warranty_provider: z.string().nullable().optional(),
  importer_type: z.enum(['official', 'parallel']).nullable().optional(),
});

export const paymentSchema = z.object({
  method: z.enum(['cash', 'credit_card', 'bank_transfer', 'bit', 'check', 'other']),
  amount: z.number().min(0),
  card_last4: z.string().max(4).nullable().optional(),
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
});
