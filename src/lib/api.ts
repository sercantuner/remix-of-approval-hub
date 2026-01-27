import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// API base URL - backend sunucusu
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Token key in localStorage
const TOKEN_KEY = 'auth_token';

// Backend auth middleware'in döndürdüğü 401 mesajları (bunlarda oturum temizlenmeli)
const AUTH_401_ERRORS = new Set<string>([
  'Yetkilendirme başlığı eksik veya hatalı',
  'Token bulunamadı',
  'Oturum süresi doldu, lütfen tekrar giriş yapın',
  'Geçersiz token',
  'Kimlik doğrulama hatası',
  'Kullanıcı bulunamadı',
  'Kimlik doğrulaması gerekli',
]);

function shouldForceLogoutOn401(error: AxiosError): boolean {
  const url = error.config?.url || '';
  // Auth endpointlerinden gelen 401'lerde her zaman logout
  if (url.includes('/auth/')) return true;
  if (url.endsWith('/auth/me')) return true;

  const data = error.response?.data as any;
  const msg = typeof data?.error === 'string' ? data.error : '';
  return AUTH_401_ERRORS.has(msg);
}

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && config.headers) {
      // Axios v1'de headers bazen AxiosHeaders instance'ı olur
      const anyHeaders = config.headers as any;
      if (typeof anyHeaders.set === 'function') {
        anyHeaders.set('Authorization', `Bearer ${token}`);
      } else {
        anyHeaders.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle 401 - ONLY force logout for real session/JWT problems.
    // Note: DIA login gibi iş akışları da 401 döndürebilir (örn. DIA credentials yanlış)
    // ve bu durumda kullanıcıyı uygulamadan atmak istemiyoruz.
    if (error.response?.status === 401 && shouldForceLogoutOn401(error)) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth helpers
export const setAuthToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const removeAuthToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

export const isAuthenticated = (): boolean => {
  return !!getAuthToken();
};

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
}

export default api;
