export type TransactionType = 
  | 'invoice' 
  | 'current_account' 
  | 'bank' 
  | 'cash' 
  | 'check_note'
  | 'order';

export type TransactionStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'analyzing';

export type QueueStatus = 'queued' | 'processing' | 'success' | 'failed' | 'partial';

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  currency: string;
  exchangeRate?: number;
  date: string;
  documentNo: string;
  counterparty: string;
  status: TransactionStatus;
  diaRecordId?: string;
  attachmentUrl?: string;
  details?: Record<string, unknown>;

  /**
   * UI-only grouping support (used for bank slips that come as multiple movements).
   * When present, actions (approve/reject) should be applied to these underlying DB row ids.
   */
  sourceTransactionIds?: string[];

  /** Number of movements inside the grouped transaction (mainly for bank). */
  movementCount?: number;

  /** Group key for current_account transactions - same _key_scf_carihesap_fisi share same group */
  groupKey?: string;

  /** Child transactions when this is a grouped parent */
  childTransactions?: Transaction[];

  /** UI-only: indicates the transaction is being processed in the queue */
  _processing?: boolean;

  /** UI-only: status of the queue action for this transaction */
  _queueStatus?: QueueStatus;

  /** UI-only: original status before optimistic update (for rollback) */
  _originalStatus?: TransactionStatus;
}

export interface TransactionGroup {
  type: TransactionType;
  label: string;
  icon: string;
  count: number;
  totalAmount: number;
  transactions: Transaction[];
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  invoice: 'Faturalar',
  current_account: 'Cari Hareketler',
  bank: 'Banka Hareketleri',
  cash: 'Kasa Hareketleri',
  check_note: 'Çek/Senet Hareketleri',
  order: 'Siparişler',
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: 'Beklemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  analyzing: 'İnceleniyor',
};
