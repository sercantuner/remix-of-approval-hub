// =====================================================
// TİP TANIMLAMALARI
// =====================================================

// Kullanıcı
export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: 'admin' | 'approver' | 'viewer';
  
  // DIA Bağlantı Bilgileri
  dia_sunucu_adi: string | null;
  dia_api_key: string | null;
  dia_ws_kullanici: string | null;
  dia_ws_sifre: string | null;
  dia_session_id: string | null;
  dia_session_expires: Date | null;
  dia_firma_kodu: number;
  dia_donem_kodu: number;
  dia_ust_islem_approve_key: number | null;
  dia_ust_islem_reject_key: number | null;
  dia_ust_islem_analyze_key: number | null;
  
  created_at: Date;
  updated_at: Date;
}

// Auth
export interface AuthPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: string;
  };
}

// İşlem
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

export interface PendingTransaction {
  id: string;
  user_id: string;
  dia_record_id: string;
  dia_firma_kodu: number | null;
  dia_raw_data: Record<string, unknown> | null;
  transaction_type: TransactionType;
  document_no: string;
  description: string | null;
  counterparty: string | null;
  amount: number;
  currency: string;
  transaction_date: Date;
  status: TransactionStatus;
  attachment_url: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  rejected_at: Date | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

// Onay Geçmişi
export interface ApprovalHistory {
  id: string;
  transaction_id: string | null;
  user_id: string;
  action: 'approve' | 'reject' | 'analyze';
  notes: string | null;
  dia_response: Record<string, unknown> | null;
  created_at: Date;
}

// Mail Ayarları
export interface MailSettings {
  id: string;
  user_id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  sender_email: string;
  sender_name: string;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

// Bildirim Ayarları
export interface NotificationSettings {
  id: string;
  user_id: string;
  is_enabled: boolean;
  notification_hours: number[];
  last_notification_sent: Date | null;
  invoice_emails: string[];
  order_emails: string[];
  current_account_emails: string[];
  bank_emails: string[];
  cash_emails: string[];
  check_note_emails: string[];
  created_at: Date;
  updated_at: Date;
}

// DIA API
export interface DiaLoginParams {
  sunucuAdi: string;
  apiKey: string;
  wsKullanici: string;
  wsSifre: string;
  firmaKodu: number;
  donemKodu: number;
}

export interface DiaLoginResponse {
  success: boolean;
  session_id?: string;
  expires?: string;
  error?: string;
}

export interface DiaApiParams {
  action: 'list' | 'list_detail' | 'list_users' | 'list_ust_islem_turu' | 'create' | 'update' | 'delete' | 'approve' | 'reject';
  module: string;
  filters?: Array<{ field: string; operator: string; value: string }>;
  sorts?: Array<{ field: string; sorttype: 'ASC' | 'DESC' }>;
  limit?: number;
  offset?: number;
  data?: Record<string, unknown>;
  recordKey?: string;
  transactionType?: string;
}

export interface DiaApproveParams {
  transactionIds: string[];
  action: 'approve' | 'reject' | 'analyze';
  reason?: string;
}

// API Yanıtları
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Express Request genişletme
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
