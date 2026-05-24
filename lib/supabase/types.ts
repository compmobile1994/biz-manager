// טיפוסי בסיס נתונים. ניתן להחליף על-ידי הרצת `supabase gen types`.

export type DocumentType = 'receipt' | 'invoice' | 'invoice_receipt' | 'credit';
export type DocumentStatus = 'issued' | 'cancelled';
export type PaymentMethod = 'cash' | 'credit_card' | 'bank_transfer' | 'bit' | 'check' | 'other';

export interface BusinessSettings {
  user_id: string;
  business_name: string;
  owner_name: string | null;
  tax_id: string;
  business_type: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  signature_url: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  accountant_email: string | null;
  accountant_name: string | null;
  invoice_footer: string | null;
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface SavedItem {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  default_price: number;
  is_active: boolean;
}

export interface DocumentItem {
  id: string;
  document_id: string;
  saved_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
}

export interface Payment {
  id: string;
  document_id: string;
  method: PaymentMethod;
  amount: number;
  card_last4: string | null;
  card_holder: string | null;
  auth_code: string | null;
  check_number: string | null;
  check_bank: string | null;
  check_branch: string | null;
  check_account: string | null;
  transfer_ref: string | null;
  charged_at: string;
  notes: string | null;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  document_type: DocumentType;
  number: number;
  customer_id: string | null;
  customer_name_snapshot: string;
  customer_tax_id_snapshot: string | null;
  customer_address_snapshot: string | null;
  issue_date: string;
  subtotal: number;
  total: number;
  notes: string | null;
  status: DocumentStatus;
  cancelled_by_doc_id: string | null;
  pdf_url: string | null;
  sent_at: string | null;
  sent_via: string | null;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface Expense {
  id: string;
  user_id: string;
  expense_date: string;
  vendor: string;
  supplier_id: string | null;
  category_id: string | null;
  amount: number;
  description: string | null;
  payment_method: PaymentMethod | null;
  reference: string | null;
  receipt_url: string | null;
}

export interface Supplier {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      business_settings: { Row: BusinessSettings; Insert: BusinessSettings; Update: Partial<BusinessSettings> };
      customers: { Row: Customer; Insert: Omit<Customer, 'id' | 'created_at'> & { id?: string }; Update: Partial<Customer> };
      saved_items: { Row: SavedItem; Insert: Omit<SavedItem, 'id'> & { id?: string }; Update: Partial<SavedItem> };
      documents: { Row: DocumentRow; Insert: Omit<DocumentRow, 'id' | 'created_at'> & { id?: string }; Update: Partial<DocumentRow> };
      document_items: { Row: DocumentItem; Insert: Omit<DocumentItem, 'id'> & { id?: string }; Update: Partial<DocumentItem> };
      payments: { Row: Payment; Insert: Omit<Payment, 'id'> & { id?: string }; Update: Partial<Payment> };
      expense_categories: { Row: ExpenseCategory; Insert: Omit<ExpenseCategory, 'id'> & { id?: string }; Update: Partial<ExpenseCategory> };
      expenses: { Row: Expense; Insert: Omit<Expense, 'id'> & { id?: string }; Update: Partial<Expense> };
      suppliers: { Row: Supplier; Insert: Omit<Supplier, 'id' | 'created_at'> & { id?: string }; Update: Partial<Supplier> };
    };
    Functions: {
      next_document_number: { Args: { p_type: DocumentType }; Returns: number };
    };
  };
};
