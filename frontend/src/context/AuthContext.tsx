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

function getSsoCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)abp_sso_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setSsoCookie(token: string) {
  if (typeof document === 'undefined') return;
  const isAbpDomain = window.location.hostname.endsWith('abpcloud.my.id');
  const domainPart = isAbpDomain ? '; domain=.abpcloud.my.id; Secure' : '';
  document.cookie = `abp_sso_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax${domainPart}`;
}

function clearSsoCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'abp_sso_token=; path=/; max-age=0';
  document.cookie = 'abp_sso_token=; path=/; domain=.abpcloud.my.id; max-age=0';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Inisialisasi: cek token di localStorage atau cookie SSO lintas-subdomain (*.abpcloud.my.id)
  useEffect(() => {
    let token = localStorage.getItem('access_token');
    const ssoToken = getSsoCookie();
    if (!token && ssoToken) {
      token = ssoToken;
      localStorage.setItem('access_token', ssoToken);
    }
    if (token) {
      try {
        const decoded = jwtDecode<any>(token);
        if (decoded.exp * 1000 > Date.now()) {
          setUser({
            userId: decoded.sub,
            email: decoded.email,
            role: decoded.role || 'ADMIN_TENANT',
            tenantId: decoded.tenantId || '00000000-0000-0000-0000-000000000001',
            nama: decoded.nama || decoded.name || decoded.email,
          });
        } else {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          clearSsoCookie();
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

    // Simpan token ke localStorage & Cookie SSO (*.abpcloud.my.id)
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    setSsoCookie(accessToken);

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
    clearSsoCookie();
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
