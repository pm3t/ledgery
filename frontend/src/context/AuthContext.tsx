import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';
import { api } from '../services/api';

// Struktur payload JWT Ledgery
export interface AuthUser {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN_TENANT' | 'STAF_AKUNTANSI';
  tenantId: string | null;
  nama: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Inisialisasi: cek token yang tersimpan di localStorage saat pertama kali load
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const decoded = jwtDecode<any>(token);
        // Cek token sudah expired
        if (decoded.exp * 1000 > Date.now()) {
          setUser({
            userId: decoded.sub,
            email: decoded.email,
            role: decoded.role,
            tenantId: decoded.tenantId,
            nama: decoded.nama,
          });
        } else {
          // Token kadaluarsa, hapus dari storage
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const result = await api.login(email, password);
    const { accessToken, refreshToken, user: userData } = result;

    // Simpan token ke localStorage
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);

    // Hapus mock session lama
    localStorage.removeItem('app_mode');
    localStorage.removeItem('app_role');

    const authUser: AuthUser = {
      userId: userData.id,
      email: userData.email,
      role: userData.role as AuthUser['role'],
      tenantId: userData.tenantId,
      nama: userData.nama,
    };

    setUser(authUser);
    return authUser;
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('app_mode');
    localStorage.removeItem('app_role');
    setUser(null);
    // Redirect ke login page
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Hook untuk menggunakan AuthContext di komponen manapun
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return context;
}
