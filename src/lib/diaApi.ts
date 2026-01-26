import api, { ApiResponse } from './api';

// =====================================================
// DIA API TYPES
// =====================================================

interface DiaLoginParams {
  sunucuAdi: string;
  apiKey: string;
  wsKullanici: string;
  wsSifre: string;
  firmaKodu: number;
  donemKodu: number;
}

interface DiaLoginResponse {
  success: boolean;
  session_id?: string;
  expires?: string;
  error?: string;
}

interface DiaApiParams {
  action: "list" | "list_detail" | "list_users" | "create" | "update" | "delete" | "approve" | "reject";
  module: string;
  filters?: Array<{ field: string; operator: string; value: string }>;
  sorts?: Array<{ field: string; sorttype: "ASC" | "DESC" }>;
  limit?: number;
  offset?: number;
  data?: Record<string, unknown>;
  recordKey?: string;
  transactionType?: string;
}

interface DiaApproveResult {
  transactionId: string;
  success: boolean;
  error?: string;
}

interface DiaSyncResult {
  synced: Record<string, number>;
  errors: string[];
}

export interface UstIslemTuru {
  _key: number;
  aciklama: string;
}

// =====================================================
// DIA API FUNCTIONS
// =====================================================

/**
 * Login to DIA ERP
 */
export async function diaLogin(params: DiaLoginParams): Promise<DiaLoginResponse> {
  try {
    const response = await api.post<ApiResponse<DiaLoginResponse>>('/dia/login', params);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    return { success: false, error: response.data.error || 'DIA bağlantısı başarısız' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DIA bağlantı hatası';
    return { success: false, error: message };
  }
}

/**
 * General DIA API call
 */
export async function diaApi(params: DiaApiParams): Promise<any> {
  const response = await api.post<ApiResponse>('/dia/api', params);
  
  if (response.data.success) {
    return response.data.data;
  }
  
  throw new Error(response.data.error || 'DIA API hatası');
}

/**
 * Sync transactions from DIA
 */
export async function diaSync(): Promise<DiaSyncResult> {
  const response = await api.post<ApiResponse<DiaSyncResult>>('/dia/sync');
  
  if (response.data.success && response.data.data) {
    return response.data.data;
  }
  
  throw new Error(response.data.error || 'Senkronizasyon hatası');
}

/**
 * Approve, reject or analyze transactions
 */
export async function diaApprove(
  transactionIds: string[], 
  action: "approve" | "reject" | "analyze", 
  reason?: string
): Promise<{ results: DiaApproveResult[]; message: string }> {
  const response = await api.post<ApiResponse<{ results: DiaApproveResult[]; message: string }>>('/dia/approve', {
    transactionIds,
    action,
    reason,
  });
  
  if (response.data.success && response.data.data) {
    return response.data.data;
  }
  
  throw new Error(response.data.error || 'Onay işlemi başarısız');
}

/**
 * Fetch transaction detail from DIA
 */
export async function diaFetchDetail(transactionType: string, recordKey: string): Promise<any> {
  const response = await api.post<ApiResponse>('/dia/detail', {
    transactionType,
    recordKey,
  });
  
  if (response.data.success) {
    return response.data.data;
  }
  
  throw new Error(response.data.error || 'Detay getirme hatası');
}

// =====================================================
// USER LIST CACHE
// =====================================================

let userListCache: Record<number, string> | null = null;
let userListLoading = false;
let userListPromise: Promise<Record<number, string>> | null = null;
let userListFetched = false;

/**
 * Fetch user list from DIA for name resolution
 */
export async function diaFetchUserList(): Promise<Record<number, string>> {
  // Return from cache if available
  if (userListCache && Object.keys(userListCache).length > 0) {
    return userListCache;
  }

  // If already tried and failed, don't retry infinitely
  if (userListFetched && (!userListCache || Object.keys(userListCache).length === 0)) {
    return {};
  }

  // If already loading, wait for the existing promise
  if (userListLoading && userListPromise) {
    return userListPromise;
  }

  userListLoading = true;
  userListFetched = true;

  userListPromise = (async () => {
    try {
      console.log('[diaApi] Fetching user list from backend...');

      const response = await api.get<ApiResponse<Record<number, string>>>('/dia/users');

      if (response.data.success && response.data.data) {
        userListCache = response.data.data;
        console.log(`[diaApi] Cached ${Object.keys(userListCache).length} users`);
        return userListCache;
      }

      return {};
    } finally {
      userListLoading = false;
    }
  })();

  return userListPromise;
}

/**
 * Get cached user name
 */
export function getCachedUserName(userId: number): string | null {
  return userListCache?.[userId] || null;
}

/**
 * Fetch üst işlem türleri from DIA
 */
export async function diaFetchUstIslemTurleri(): Promise<UstIslemTuru[]> {
  const response = await api.get<ApiResponse<UstIslemTuru[]>>('/dia/ust-islem-turleri');
  
  if (response.data.success && response.data.data) {
    return response.data.data;
  }
  
  throw new Error(response.data.error || 'Üst işlem türleri getirilemedi');
}
