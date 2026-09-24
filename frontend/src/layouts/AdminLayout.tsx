import React from 'react';
import {
  Building2,
  Settings,
  ShieldCheck,
  ChevronDown,
  Bell,
  CheckCircle2,
  CreditCard,
  KeyRound,
  FileText,
  Users,
  LogOut,
} from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: 'tenants' | 'billing' | 'audit' | 'api-keys' | 'user-management';
  setActiveTab: (tab: 'tenants' | 'billing' | 'audit' | 'api-keys' | 'user-management') => void;
  onLogout: () => void;
}

export function AdminLayout({
  children,
  activeTab,
  setActiveTab,
  onLogout
}: AdminLayoutProps) {
  return (
    <div className="flex h-screen bg-slate-950 text-slate-300 font-sans selection:bg-rose-500/30">
      
      {/* SIDEBAR SUPER ADMIN */}
      <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl z-20">
        
        {/* Brand/Logo Area */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-rose-500 to-orange-500 p-2 rounded-xl shadow-lg shadow-rose-500/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold text-lg tracking-tight leading-none">ABP Admin</span>
              <span className="text-rose-400 text-[10px] font-bold uppercase tracking-wider mt-1">Super User Portal</span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('tenants')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'tenants'
                  ? 'bg-rose-600/15 text-rose-400 border border-rose-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Building2 className="w-5 h-5" />
              Daftar Tenant
            </button>

            <button
              onClick={() => setActiveTab('billing')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'billing'
                  ? 'bg-amber-600/15 text-amber-400 border border-amber-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              Status Langganan
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-5 h-5" />
              Audit Logs Privasi
            </button>

            <div className="pt-4 mt-4 border-t border-slate-800 space-y-1">
              <button
                onClick={() => setActiveTab('api-keys')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'api-keys'
                    ? 'bg-slate-600/15 text-slate-300 border border-slate-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <KeyRound className="w-5 h-5" />
                Global API Keys
              </button>

              <button
                onClick={() => setActiveTab('user-management')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'user-management'
                    ? 'bg-violet-600/15 text-violet-400 border border-violet-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Users className="w-5 h-5" />
                Manajemen User
              </button>
            </div>
          </nav>
        </div>

        {/* Footer info PT ABP */}
        <div className="px-3 py-3 border-t border-slate-800 text-xs text-slate-500 flex flex-col mt-6">
          <button 
            onClick={onLogout}
            className="text-center w-full py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-slate-300 transition-colors font-medium mb-3"
          >
            Kembali ke Portal Tenant
          </button>
          <div className="flex items-center justify-between">
            <span>ABP Super Admin v1.0</span>
            <span className="flex items-center gap-1 text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
              Aktif
            </span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-hidden relative">
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm font-medium">Anda sedang login sebagai:</span>
            <span className="px-3 py-1 bg-rose-500/20 text-rose-400 text-xs font-bold uppercase rounded-lg border border-rose-500/30 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Super Admin ABP
            </span>
          </div>
        </header>

        {/* Page Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {children}
        </div>
      </main>

    </div>
  );
}
