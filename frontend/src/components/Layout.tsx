import React from 'react';
import {
  BookOpen,
  KeyRound,
  Settings,
  Building2,
  ShieldCheck,
  ChevronDown,
  Layers,
  Bell,
  CheckCircle2,
  BarChart3,
  Calculator,
  Activity,
  Users,
  LogOut,
  Calendar,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { Tenant, api, AppNotification } from '../services/api';
import { AuthUser } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'coa' | 'settings' | 'journals' | 'journals-manual' | 'ledger' | 'journal-approval' | 'approval-history' | 'reports' | 'dimension-analysis' | 'tax' | 'integration-log' | 'user-management' | 'dimensions' | 'accounting-periods';
  setActiveTab: (tab: 'coa' | 'settings' | 'journals' | 'journals-manual' | 'ledger' | 'journal-approval' | 'approval-history' | 'reports' | 'dimension-analysis' | 'tax' | 'integration-log' | 'user-management' | 'dimensions' | 'accounting-periods') => void;
  tenants: Tenant[];
  currentTenant: Tenant | null;
  onSelectTenant: (tenant: Tenant) => void;
  onLogout: () => void;
  currentUser?: AuthUser | null;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  tenants,
  currentTenant,
  onSelectTenant,
  onLogout,
  currentUser,
}) => {
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [pendingApprovalCount, setPendingApprovalCount] = React.useState<number>(0);
  const [showNotifPanel, setShowNotifPanel] = React.useState(false);
  
  const [expandedMenus, setExpandedMenus] = React.useState<Record<string, boolean>>({
    master: true,
    transaksi: true,
    laporan: true,
    setting: true
  });

  const toggleMenu = (menu: string) => {
    setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  };

  const fetchNotificationsAndApprovals = React.useCallback(async () => {
    if (currentTenant) {
      try {
        const notifData = await api.getNotifications(currentTenant.id, true);
        setNotifications(notifData);

        const pendingJournals = await api.getPendingJournals(currentTenant.id);
        setPendingApprovalCount(pendingJournals.length);
      } catch (err) {
        console.error('Failed to load notifications or pending approvals', err);
      }
    }
  }, [currentTenant]);

  React.useEffect(() => {
    fetchNotificationsAndApprovals();
    const interval = setInterval(fetchNotificationsAndApprovals, 10000); // poll every 10s
    window.addEventListener('journal-approval-updated', fetchNotificationsAndApprovals);
    return () => {
      clearInterval(interval);
      window.removeEventListener('journal-approval-updated', fetchNotificationsAndApprovals);
    };
  }, [fetchNotificationsAndApprovals]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationAsRead(id);
      fetchNotificationsAndApprovals();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!currentTenant) return;
    try {
      await api.markAllNotificationsAsRead(currentTenant.id);
      fetchNotificationsAndApprovals();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigasi */}
      <aside className="w-full md:w-72 bg-slate-900/80 border-r border-slate-800 flex flex-col justify-between p-4 backdrop-blur-md">
        <div>
          {/* Logo & Header Aplikasi */}
          <div className="flex items-center justify-between px-3 py-4 mb-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-white tracking-tight">Ledgery Engine</h1>
                <p className="text-xs text-slate-400">Multi-Tenant Accounting</p>
              </div>
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                className="relative p-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-800"
              >
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
                )}
              </button>

              {showNotifPanel && (
                <div className="absolute top-full mt-2 -right-4 w-72 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 p-3">
                  <div className="flex justify-between items-center mb-3 px-1">
                    <h3 className="text-sm font-semibold text-white">Notifikasi In-App</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{notifications.length} Unread</span>
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllAsRead}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-medium"
                        >
                          Tandai Semua Dibaca
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">Belum ada notifikasi baru</p>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="bg-slate-950/50 border border-slate-800/80 rounded-lg p-3 group relative cursor-pointer" onClick={() => handleMarkAsRead(n.id)}>
                          <p className="text-xs font-semibold text-slate-200">{n.judul}</p>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{n.pesan}</p>
                          <p className="text-[9px] text-slate-500 mt-2">{new Date(n.createdAt).toLocaleTimeString('id-ID')}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tenant Switcher Selector */}
          <div className="mb-6 px-1">
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold px-2 mb-2 block">
              Tenant Aktif
            </label>
            <div className="relative">
              <select
                value={currentTenant?.id || ''}
                onChange={(e) => {
                  const selected = tenants.find((t) => t.id === e.target.value);
                  if (selected) onSelectTenant(selected);
                }}
                className="w-full appearance-none bg-slate-800/90 border border-slate-700/70 hover:border-slate-600 text-slate-100 text-sm rounded-xl px-3.5 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer font-medium"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id} className="bg-slate-900 text-slate-100">
                    {t.nama_perusahaan}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Navigasi Utama */}
          <nav className="space-y-6">
            
            {/* MASTER */}
            <div>
              <button 
                onClick={() => toggleMenu('master')}
                className="w-full flex items-center justify-between px-3 mb-2 focus:outline-none group"
              >
                <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold group-hover:text-slate-300 transition-colors">Master</h3>
                {expandedMenus.master ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />}
              </button>
              
              {expandedMenus.master && (
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveTab('coa')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'coa'
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <BookOpen className="w-5 h-5" />
                    Chart of Accounts (COA)
                  </button>
                  <button
                    onClick={() => setActiveTab('dimensions')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'dimensions'
                        ? 'bg-pink-600/15 text-pink-400 border border-pink-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Layers className="w-5 h-5" />
                    Manajemen Dimensi
                  </button>
                  <button
                    onClick={() => setActiveTab('accounting-periods')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'accounting-periods'
                        ? 'bg-teal-600/15 text-teal-400 border border-teal-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Calendar className="w-5 h-5" />
                    Manajemen Periode
                  </button>
                </div>
              )}
            </div>

            {/* TRANSAKSI */}
            <div>
              <button 
                onClick={() => toggleMenu('transaksi')}
                className="w-full flex items-center justify-between px-3 mb-2 focus:outline-none group"
              >
                <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold group-hover:text-slate-300 transition-colors">Transaksi</h3>
                {expandedMenus.transaksi ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />}
              </button>

              {expandedMenus.transaksi && (
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveTab('journals')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'journals'
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <BookOpen className="w-5 h-5" />
                    Daftar Jurnal
                  </button>
                  <button
                    onClick={() => setActiveTab('journals-manual')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'journals-manual'
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <BookOpen className="w-5 h-5" />
                    Input Jurnal Manual
                  </button>
                  <button
                    onClick={() => setActiveTab('journal-approval')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'journal-approval'
                        ? 'bg-amber-600/15 text-amber-400 border border-amber-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Persetujuan Jurnal
                    {pendingApprovalCount > 0 && (
                      <span className="ml-auto bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {pendingApprovalCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('approval-history')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'approval-history'
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <BookOpen className="w-5 h-5" />
                    Riwayat Approval
                  </button>
                </div>
              )}
            </div>

            {/* LAPORAN */}
            <div>
              <button 
                onClick={() => toggleMenu('laporan')}
                className="w-full flex items-center justify-between px-3 mb-2 focus:outline-none group"
              >
                <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold group-hover:text-slate-300 transition-colors">Laporan</h3>
                {expandedMenus.laporan ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />}
              </button>

              {expandedMenus.laporan && (
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveTab('ledger')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'ledger'
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Layers className="w-5 h-5" />
                    Buku Besar
                  </button>
                  <button
                    onClick={() => setActiveTab('reports')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'reports'
                        ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <BarChart3 className="w-5 h-5" />
                    Laporan Keuangan
                  </button>
                  <button
                    onClick={() => setActiveTab('dimension-analysis')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'dimension-analysis'
                        ? 'bg-purple-600/15 text-purple-400 border border-purple-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <SlidersHorizontal className="w-5 h-5" />
                    Analisa Dimensi
                  </button>
                  <button
                    onClick={() => setActiveTab('tax')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'tax'
                        ? 'bg-sky-600/15 text-sky-400 border border-sky-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Calculator className="w-5 h-5" />
                    Perpajakan (Rekap)
                  </button>
                </div>
              )}
            </div>

            {/* SETTING */}
            <div>
              <button 
                onClick={() => toggleMenu('setting')}
                className="w-full flex items-center justify-between px-3 mb-2 focus:outline-none group"
              >
                <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold group-hover:text-slate-300 transition-colors">Setting</h3>
                {expandedMenus.setting ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />}
              </button>

              {expandedMenus.setting && (
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'settings'
                        ? 'bg-slate-600/15 text-slate-300 border border-slate-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Settings className="w-5 h-5" />
                    Pengaturan Tenant
                  </button>
                  <button
                    onClick={() => setActiveTab('integration-log')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'integration-log'
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Activity className="w-5 h-5" />
                    Log Integrasi API
                  </button>
                  {/* Menu User Management hanya tampil untuk ADMIN_TENANT */}
                  <button
                    onClick={() => setActiveTab('user-management')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'user-management'
                        ? 'bg-violet-600/15 text-violet-400 border border-violet-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Users className="w-5 h-5" />
                    Manajemen User
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Footer: nama user & logout */}
        <div className="px-3 py-3 border-t border-slate-800 text-xs text-slate-500 mt-4 space-y-2">
          {currentUser && (
            <div className="px-1">
              <div className="text-slate-300 font-medium text-sm truncate">{currentUser.nama}</div>
              <div className="text-slate-500 text-xs truncate">{currentUser.email}</div>
              <div className="text-indigo-400 text-[10px] uppercase font-semibold mt-0.5">{currentUser.role}</div>
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 text-slate-400 hover:text-rose-400 transition-colors py-2 px-2 rounded-lg hover:bg-rose-500/10"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-xs font-medium">Keluar</span>
          </button>
        </div>
      </aside>

      {/* Konten Utama */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">{children}</main>
    </div>
  );
};
