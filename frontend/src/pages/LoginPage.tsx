import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, User, Eye, EyeOff, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Cek apakah kita berada di environment development
  // PERINGATAN KEAMANAN: Tombol shortcut login di bawah HANYA boleh aktif di development/staging.
  // Di environment production, tombol ini WAJIB disembunyikan untuk mencegah akses tidak sah.
  const isDevelopment = (import.meta as any).env?.DEV ?? (window.location.hostname === 'localhost');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email dan password tidak boleh kosong');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      // Redirect berdasarkan role
      if (user.role === 'SUPER_ADMIN') {
        window.location.href = '/?mode=admin';
      } else {
        window.location.href = '/?mode=tenant';
      }
    } catch (err: any) {
      setError(err.message || 'Login gagal. Periksa email dan password Anda.');
    } finally {
      setLoading(false);
    }
  };

  // Fungsi shortcut: langsung isi form dengan kredensial demo
  const loginAsDemo = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
    setLoading(true);
    try {
      const user = await login(demoEmail, demoPassword);
      if (user.role === 'SUPER_ADMIN') {
        window.location.href = '/?mode=admin';
      } else {
        window.location.href = '/?mode=tenant';
      }
    } catch (err: any) {
      setError(err.message || 'Login demo gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blur decorations */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-rose-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md z-10 space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl shadow-lg shadow-indigo-500/20 mb-2">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Ledgery<span className="text-indigo-400">SaaS</span>
          </h1>
          <p className="text-slate-400 text-sm">Akuntansi Multi-Tenant — PT. Anugerah Bakti Prima</p>
        </div>

        {/* Form Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">Masuk ke Akun Anda</h2>

          {error && (
            <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 mb-5 text-sm text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@perusahaan.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-12 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <button type="button" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Lupa Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-600 text-white py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memverifikasi...
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </form>
        </div>

        {/* PERINGATAN KEAMANAN: Shortcut login di bawah HANYA aktif di environment development.
            Di environment production (NODE_ENV=production), blok ini tidak akan dirender.
            Jangan pernah meng-hardcode atau mengekspos kredensial demo di production build. */}
        {isDevelopment && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">Mode Development — Shortcut Login</span>
            </div>
            <p className="text-amber-300/70 text-xs">Tombol ini otomatis tersembunyi di production build.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => loginAsDemo('staf@demo-tenant.id', 'staf123')}
                disabled={loading}
                className="flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 py-2 px-3 rounded-xl text-xs font-medium transition-colors"
              >
                <User className="w-3.5 h-3.5 text-indigo-400" />
                Login sbg Tenant
              </button>
              <button
                onClick={() => loginAsDemo('admin@ledgery.id', 'admin123')}
                disabled={loading}
                className="flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 py-2 px-3 rounded-xl text-xs font-medium transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                Login sbg Super Admin
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
