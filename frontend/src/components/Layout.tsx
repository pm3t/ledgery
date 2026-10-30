import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Bell,
  BookOpen,
  Users,
  Calendar,
  CheckCircle2,
  BarChart3,
  Calculator,
  SlidersHorizontal,
  Settings,
  Activity,
  Receipt,
  CreditCard,
  FileSpreadsheet,
  FileText,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  LogOut,
  Search,
  X,
  Menu,
  FolderTree,
  History,
  PlusCircle,
  ShieldCheck,
  Building2,
  UserCheck,
} from 'lucide-react';
import { Tenant, api, AppNotification } from '../services/api';
import { AuthUser } from '../context/AuthContext';

export type TenantTab =
  | 'coa'
  | 'business-partners'
  | 'settings'
  | 'journals'
  | 'journals-manual'
  | 'ledger'
  | 'journal-approval'
  | 'approval-history'
  | 'reports'
  | 'dimension-analysis'
  | 'tax'
  | 'integration-log'
  | 'user-management'
  | 'dimensions'
  | 'accounting-periods'
  | 'ar-invoices'
  | 'ar-receipts'
  | 'ar-credit-notes'
  | 'ar-reports'
  | 'ar-opening-balance';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TenantTab;
  setActiveTab: (tab: TenantTab) => void;
  tenants: Tenant[];
  currentTenant: Tenant | null;
  onSelectTenant: (tenant: Tenant) => void;
  onLogout: () => void;
  currentUser?: AuthUser | null;
}

interface MenuItem {
  id: TenantTab;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeVariant?: 'amber' | 'indigo' | 'emerald';
  adminOnly?: boolean;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  colorClass: string;
  items: MenuItem[];
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number>(0);
  const [showNotifPanel, setShowNotifPanel] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Definisi Pengelompokan Menu (Terorganisir Sesuai Domain Fungsional)
  const menuGroups: MenuGroup[] = useMemo(() => {
    return [
      {
        id: 'ar',
        label: 'Piutang & Penjualan (AR)',
        icon: Receipt,
        colorClass: 'text-blue-400',
        items: [
          { id: 'ar-invoices', label: 'Faktur Penjualan', icon: Receipt },
          { id: 'ar-receipts', label: 'Penerimaan Piutang', icon: CreditCard },
          { id: 'ar-credit-notes', label: 'Nota Kredit', icon: FileText },
          { id: 'ar-reports', label: 'Umur & Kartu Piutang', icon: FileSpreadsheet },
          { id: 'ar-opening-balance', label: 'Saldo Awal Piutang', icon: UploadCloud },
        ],
      },
      {
        id: 'gl',
        label: 'Buku Besar & Jurnal',
        icon: BookOpen,
        colorClass: 'text-indigo-400',
        items: [
          { id: 'journals', label: 'Daftar Jurnal', icon: BookOpen },
          { id: 'journals-manual', label: 'Input Jurnal Manual', icon: PlusCircle },
          {
            id: 'journal-approval',
            label: 'Persetujuan Jurnal',
            icon: CheckCircle2,
            badge: pendingApprovalCount > 0 ? pendingApprovalCount : undefined,
            badgeVariant: 'amber',
          },
          { id: 'approval-history', label: 'Riwayat Approval', icon: History },
          { id: 'ledger', label: 'Buku Besar (GL)', icon: Layers },
        ],
      },
      {
        id: 'reports',
        label: 'Laporan & Analisa',
        icon: BarChart3,
        colorClass: 'text-emerald-400',
        items: [
          { id: 'reports', label: 'Laporan Keuangan', icon: BarChart3 },
          { id: 'dimension-analysis', label: 'Analisa Dimensi', icon: SlidersHorizontal },
          { id: 'tax', label: 'Rekapitulasi Pajak', icon: Calculator },
        ],
      },
      {
        id: 'master',
        label: 'Data Master',
        icon: FolderTree,
        colorClass: 'text-violet-400',
        items: [
          { id: 'coa', label: 'Bagan Akun (COA)', icon: FolderTree },
          { id: 'business-partners', label: 'Mitra Bisnis', icon: Users },
          { id: 'dimensions', label: 'Dimensi Keuangan', icon: Layers },
          { id: 'accounting-periods', label: 'Periode Akuntansi', icon: Calendar },
        ],
      },
      {
        id: 'settings',
        label: 'Pengaturan & Sistem',
        icon: Settings,
        colorClass: 'text-slate-400',
        items: [
          { id: 'settings', label: 'Pengaturan Tenant & Subledger', icon: Settings },
          { id: 'integration-log', label: 'Log Integrasi API', icon: Activity },
          {
            id: 'user-management',
            label: 'Manajemen Pengguna',
            icon: UserCheck,
            adminOnly: true,
          },
        ],
      },
    ];
  }, [pendingApprovalCount]);

  // State Accordion Menu Terbuka / Tertutup
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ledgery_menu_expanded');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      ar: true,
      gl: true,
      reports: true,
      master: true,
      settings: true,
    };
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const updated = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem('ledgery_menu_expanded', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Pastikan group yang berisi activeTab otomatis terbuka
  useEffect(() => {
    const parentGroup = menuGroups.find((g) => g.items.some((item) => item.id === activeTab));
    if (parentGroup && !expandedGroups[parentGroup.id]) {
      setExpandedGroups((prev) => ({ ...prev, [parentGroup.id]: true }));
    }
  }, [activeTab, menuGroups]);

  // Pengambilan Notifikasi & Approval Pending
  const fetchNotificationsAndApprovals = useCallback(async () => {
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

  useEffect(() => {
    fetchNotificationsAndApprovals();
    const interval = setInterval(fetchNotificationsAndApprovals, 10000);
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

  // Filter Menu Berdasarkan Pencarian
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return menuGroups;
    const q = searchQuery.toLowerCase();
    return menuGroups
      .map((g) => {
        const matchingItems = g.items.filter((item) => {
          if (item.adminOnly && currentUser?.role !== 'ADMIN_TENANT') return false;
          return item.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q);
        });
        return {
          ...g,
          items: matchingItems,
        };
      })
      .filter((g) => g.items.length > 0);
  }, [menuGroups, searchQuery, currentUser]);

  // Temukan Info Tab Aktif untuk Breadcrumb
  const currentTabInfo = useMemo(() => {
    for (const group of menuGroups) {
      const found = group.items.find((i) => i.id === activeTab);
      if (found) {
        return { groupLabel: group.label, itemLabel: found.label, icon: found.icon };
      }
    }
    return { groupLabel: 'Sistem', itemLabel: 'Dashboard', icon: Layers };
  }, [menuGroups, activeTab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row antialiased">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-base tracking-tight">Ledgery</span>
          {currentTenant && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 truncate max-w-[120px]">
              {currentTenant.nama_perusahaan}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigasi Utama */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen w-72 bg-slate-900/95 border-r border-slate-800/80 flex flex-col justify-between backdrop-blur-xl z-40 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Header Logo & Notifikasi */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-800/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/25 ring-1 ring-white/10">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-base text-white tracking-tight flex items-center gap-1.5">
                  <span>Ledgery</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    V3
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">Enterprise Accounting Engine</p>
              </div>
            </div>

            {/* Tombol Lonceng Notifikasi */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                className="relative p-2 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-slate-800/80 border border-transparent hover:border-slate-700/60"
                title="Notifikasi Sistem"
              >
                <Bell className="w-4 h-4" />
                {notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse ring-2 ring-slate-900" />
                )}
              </button>

              {/* Panel Notifikasi Popover */}
              {showNotifPanel && (
                <div className="absolute top-full mt-2 -right-2 w-80 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl z-50 p-3.5 space-y-2.5 animate-in fade-in zoom-in-95">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-indigo-400" />
                      Notifikasi In-App
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {notifications.length} Belum Dibaca
                      </span>
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllAsRead}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-medium"
                        >
                          Tandai Semua
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">
                        Tidak ada notifikasi baru
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl p-2.5 cursor-pointer transition-all hover:bg-slate-950"
                          onClick={() => handleMarkAsRead(n.id)}
                        >
                          <p className="text-xs font-semibold text-slate-200">{n.judul}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                            {n.pesan}
                          </p>
                          <p className="text-[9px] text-slate-500 mt-1.5">
                            {new Date(n.createdAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tenant Switcher & Quick Menu Search */}
        <div className="px-3 py-3 space-y-2.5 border-b border-slate-800/60 bg-slate-950/30">
          {/* Tenant Selector Card */}
          <div>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-bold px-1 mb-1">
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3 text-indigo-400" /> Tenant Aktif
              </span>
              {currentTenant && (
                <span className="font-mono text-indigo-300 bg-indigo-950/80 px-1.5 py-0.2 rounded border border-indigo-800/50">
                  {currentTenant.mata_uang || 'IDR'}
                </span>
              )}
            </div>
            <div className="relative">
              <select
                value={currentTenant?.id || ''}
                onChange={(e) => {
                  const selected = tenants.find((t) => t.id === e.target.value);
                  if (selected) onSelectTenant(selected);
                }}
                className="w-full appearance-none bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-100 text-xs font-medium rounded-xl px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer shadow-sm truncate"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id} className="bg-slate-900 text-slate-100">
                    {t.nama_perusahaan}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Quick Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-7 py-1.5 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-400 hover:text-white absolute right-1.5 top-1/2 -translate-y-1/2 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Daftar Menu Scrollable */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3.5 custom-scrollbar">
          {filteredGroups.map((group) => {
            const isExpanded = !!expandedGroups[group.id] || !!searchQuery.trim();
            const GroupIcon = group.icon;
            const hasActiveItem = group.items.some((i) => i.id === activeTab);

            return (
              <div key={group.id} className="space-y-1">
                {/* Header Kategori Menu */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-colors group select-none"
                >
                  <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-300">
                    <GroupIcon className={`w-3.5 h-3.5 ${group.colorClass}`} />
                    <span>{group.label}</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    {hasActiveItem && !isExpanded && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 ring-2 ring-indigo-500/20" />
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                        isExpanded ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                  </div>
                </button>

                {/* Sub Menu Items */}
                {isExpanded && (
                  <div className="space-y-0.5 pl-1.5 pr-0.5">
                    {group.items.map((item) => {
                      if (item.adminOnly && currentUser?.role !== 'ADMIN_TENANT') return null;
                      const isActive = activeTab === item.id;
                      const ItemIcon = item.icon;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all relative group ${
                            isActive
                              ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm font-semibold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                          }`}
                        >
                          {/* Accent Bar Left for Active State */}
                          {isActive && (
                            <span className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r" />
                          )}

                          <div className="flex items-center gap-2.5 truncate">
                            <ItemIcon
                              className={`w-4 h-4 shrink-0 transition-colors ${
                                isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>

                          {/* Badge Notification / Pending Counter */}
                          {item.badge !== undefined && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                                item.badgeVariant === 'amber'
                                  ? 'bg-amber-500 text-slate-950 font-mono shadow-sm'
                                  : 'bg-indigo-600 text-white'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer: User Profile & Logout */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
          {currentUser && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-300 shrink-0">
                  {currentUser.nama.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate">
                    {currentUser.nama}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {currentUser.role}
                  </div>
                </div>
              </div>

              <div className="shrink-0" title="Akun Terverifikasi">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-rose-400 transition-colors py-2 px-3 rounded-xl hover:bg-rose-950/30 border border-transparent hover:border-rose-800/40 text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Aplikasi</span>
          </button>
        </div>
      </aside>

      {/* Konten Utama & Breadcrumb Header */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Breadcrumb Bar */}
        <header className="hidden md:flex items-center justify-between px-8 py-3 bg-slate-900/50 border-b border-slate-800/60 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">{currentTabInfo.groupLabel}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-semibold flex items-center gap-1.5">
              <currentTabInfo.icon className="w-3.5 h-3.5 text-indigo-400" />
              {currentTabInfo.itemLabel}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {currentTenant && (
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/70 border border-slate-800 rounded-lg text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-white">{currentTenant.nama_perusahaan}</span>
                <span className="text-slate-500">|</span>
                <span className="font-mono text-indigo-400 font-semibold">
                  {currentTenant.mata_uang || 'IDR'}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};
