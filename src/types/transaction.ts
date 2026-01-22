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
