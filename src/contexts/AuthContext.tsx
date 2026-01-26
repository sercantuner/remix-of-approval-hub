import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import api, { setAuthToken, removeAuthToken, getAuthToken, ApiResponse } from '@/lib/api';

interface User {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true, // Start with loading to check existing session
  });

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      
      if (!token) {
        setAuthState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      try {
        const response = await api.get<ApiResponse<User>>('/auth/me');
        
        if (response.data.success && response.data.data) {
          setAuthState({
            user: response.data.data,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          removeAuthToken();
          setAuthState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } catch {
        removeAuthToken();
        setAuthState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await api.post<ApiResponse<{ token: string; user: User }>>('/auth/login', {
        email,
        password,
      });

      if (response.data.success && response.data.data) {
        const { token, user } = response.data.data;
        setAuthToken(token);
        setAuthState({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }

      setAuthState(prev => ({ ...prev, isLoading: false }));
      return false;
    } catch {
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await api.post<ApiResponse<{ token: string; user: User }>>('/auth/register', {
        email,
        password,
        fullName,
      });

      if (response.data.success && response.data.data) {
        const { token, user } = response.data.data;
        setAuthToken(token);
        setAuthState({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }

      setAuthState(prev => ({ ...prev, isLoading: false }));
      return false;
    } catch {
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    removeAuthToken();
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<User>>('/auth/me');
      
      if (response.data.success && response.data.data) {
        setAuthState(prev => ({
          ...prev,
          user: response.data.data!,
        }));
      }
    } catch {
      // Silently fail
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...authState, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
