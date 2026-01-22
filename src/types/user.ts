export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'approver' | 'viewer';
  avatar?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
