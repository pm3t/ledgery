import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  FolderTree,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldAlert,
  X,
  History,
  Calendar,
  Layers,
  RefreshCw,
  Loader2,
  Filter,
  FileText,
  Building2,
  ArrowRightLeft,
  Columns3,
} from 'lucide-react';
import {
  api,
  ChartOfAccount,
  Tenant,
  LedgerResponse,
  Dimension,
} from '../services/api';

interface ChartOfAccountsPageProps {
  currentTenant: Tenant | null;
}

interface ColumnVisibility {
  kode_akun: boolean;
  nama_akun: boolean;
  kategori: boolean;
  controlType: boolean;
  parent: boolean;
  saldo: boolean;
  status: boolean;
  aksi: boolean;
}

const DEFAULT_COLUMNS: ColumnVisibility = {
  kode_akun: true,
  nama_akun: true,
  kategori: true,
  controlType: true,
  parent: true,
  saldo: true,
  status: true,
  aksi: true,
};

const COLUMN_DEFINITIONS: { key: keyof ColumnVisibility; label: string }[] = [
  { key: 'kode_akun', label: 'Kode Akun' },
  { key: 'nama_akun', label: 'Nama Akun' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'controlType', label: 'Tipe Kontrol' },
  { key: 'parent', label: 'Akun Induk' },
  { key: 'saldo', label: 'Saldo' },
  { key: 'status', label: 'Status' },
  { key: 'aksi', label: 'Aksi' },
];

export const ChartOfAccountsPage: React.FC<ChartOfAccountsPageProps> = ({ currentTenant }) => {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedKategori, setSelectedKategori] = useState<string>('ALL');

  // State Pilihan Kolom (Column Visibility)
  const [showColumnPicker, setShowColumnPicker] = useState<boolean>(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>(() => {
    try {
      const saved = localStorage.getItem('ledgery_coa_columns');
      if (saved) return { ...DEFAULT_COLUMNS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_COLUMNS;
  });

  const toggleColumn = (key: keyof ColumnVisibility) => {
    setVisibleColumns((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      const hasVisible = Object.values(updated).some((v) => v);
      if (!hasVisible) return prev;
      try {
        localStorage.setItem('ledgery_coa_columns', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_COLUMNS);
    try {
      localStorage.setItem('ledgery_coa_columns', JSON.stringify(DEFAULT_COLUMNS));
    } catch (e) {}
  };

  // State Filter Saldo COA (As of vs Mutasi)
  const [tipeSaldo, setTipeSaldo] = useState<'AS_OF' | 'MUTASI'>('AS_OF');
  const [asOfDate, setAsOfDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [mutasiStartDate, setMutasiStartDate] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10),
  );
  const [mutasiEndDate, setMutasiEndDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [balanceMap, setBalanceMap] = useState<Record<string, number>>({});
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false);

  const fetchBalances = async () => {
    if (!currentTenant) return;
    setBalanceLoading(true);
    try {
      const res = await api.getTrialBalance(
        currentTenant.id,
        tipeSaldo === 'MUTASI' ? mutasiStartDate : undefined,
        tipeSaldo === 'MUTASI' ? mutasiEndDate : asOfDate,
      );
      const map: Record<string, number> = {};
      res.items.forEach((item) => {
        map[item.coa.id] = item.saldo;
      });
      setBalanceMap(map);
    } catch (err) {
      console.error('Gagal mengambil saldo COA:', err);
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [currentTenant, tipeSaldo, asOfDate, mutasiStartDate, mutasiEndDate]);

  useEffect(() => {
    window.addEventListener('journal-approval-updated', fetchBalances);
    return () => {
      window.removeEventListener('journal-approval-updated', fetchBalances);
    };
  }, []);

  const formatSaldo = (val: number | undefined) => {
    if (val === undefined || val === null) return '-';
    if (val === 0) return '0';
    const isNegative = val < 0;
    const formatted = Math.abs(val).toLocaleString('id-ID');
    return isNegative ? `(${formatted})` : formatted;
  };

  // State Modal Form
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [formData, setFormData] = useState<{
    kode_akun: string;
    nama_akun: string;
    kategori: 'ASET' | 'LIABILITAS' | 'EKUITAS' | 'PENDAPATAN' | 'BEBAN';
    parentId: string;
    isActive: boolean;
    isControlAccount: boolean;
    controlType: 'NONE' | 'AR' | 'AP' | 'INVENTORY';
  }>({
    kode_akun: '',
    nama_akun: '',
    kategori: 'ASET',
    parentId: '',
    isActive: true,
    isControlAccount: false,
    controlType: 'NONE',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // State Modal Mutasi Akun (Buku Besar Akun)
  const [isMutationModalOpen, setIsMutationModalOpen] = useState<boolean>(false);
  const [mutationAccount, setMutationAccount] = useState<ChartOfAccount | null>(null);
  const [mutationData, setMutationData] = useState<LedgerResponse | null>(null);
  const [mutationLoading, setMutationLoading] = useState<boolean>(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Filter Mutasi Modal: Tanggal, Deskripsi, Dimensi
  const [mutationStartDate, setMutationStartDate] = useState<string>('');
  const [mutationEndDate, setMutationEndDate] = useState<string>('');
  const [mutationDeskripsi, setMutationDeskripsi] = useState<string>('');
  const [mutationDimensionValue, setMutationDimensionValue] = useState<string>('');

  // Master Dimensi untuk dropdown filter
  const [dimensions, setDimensions] = useState<Dimension[]>([]);

  useEffect(() => {
    if (currentTenant) {
      api
        .getDimensions()
        .then((res) => setDimensions(res.filter((d) => d.isActive)))
        .catch(console.error);
    }
  }, [currentTenant]);

  const fetchAccountMutation = async (accId?: string) => {
    const id = accId || mutationAccount?.id;
    if (!currentTenant || !id) return;
    setMutationLoading(true);
    setMutationError(null);
    try {
      const data = await api.getAccountLedger(
        currentTenant.id,
        id,
        mutationStartDate || undefined,
        mutationEndDate || undefined,
        mutationDimensionValue || undefined,
        mutationDeskripsi || undefined,
      );
      setMutationData(data);
    } catch (err: any) {
      setMutationError(err.message || 'Gagal memuat mutasi akun');
    } finally {
      setMutationLoading(false);
    }
  };

  const handleOpenMutationModal = (acc: ChartOfAccount) => {
    setMutationAccount(acc);
    setMutationData(null);
    setMutationStartDate('');
    setMutationEndDate('');
    setMutationDeskripsi('');
    setMutationDimensionValue('');
    setMutationError(null);
    setIsMutationModalOpen(true);
    fetchAccountMutation(acc.id);
  };

  const handleApplyMutationFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    fetchAccountMutation();
  };

  const handleResetMutationFilters = () => {
    setMutationStartDate('');
    setMutationEndDate('');
    setMutationDeskripsi('');
    setMutationDimensionValue('');
    if (mutationAccount && currentTenant) {
      setMutationLoading(true);
      api
        .getAccountLedger(currentTenant.id, mutationAccount.id)
        .then(setMutationData)
        .catch((err) => setMutationError(err.message))
        .finally(() => setMutationLoading(false));
    }
  };

  const fetchCoa = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getCoaByTenant(currentTenant.id, selectedKategori, searchQuery);
      setAccounts(data);
    } catch (err: any) {
      console.error('Gagal mengambil data COA:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoa();
  }, [currentTenant, selectedKategori, searchQuery]);

  // Membuka modal tambah akun baru
  const handleOpenAddModal = () => {
    setEditingAccount(null);
    setFormData({
      kode_akun: '',
      nama_akun: '',
      kategori: 'ASET',
      parentId: '',
      isActive: true,
      isControlAccount: false,
      controlType: 'NONE',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Membuka modal edit akun
  const handleOpenEditModal = (acc: ChartOfAccount) => {
    setEditingAccount(acc);
    setFormData({
      kode_akun: acc.kode_akun,
      nama_akun: acc.nama_akun,
      kategori: acc.kategori,
      parentId: acc.parentId || '',
      isActive: acc.isActive,
      isControlAccount: !!acc.isControlAccount,
      controlType: (acc.controlType || 'NONE') as 'NONE' | 'AR' | 'AP' | 'INVENTORY',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Mengirim form simpan / update akun
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!formData.kode_akun.trim()) {
      setFormError('Kode akun tidak boleh kosong');
      return;
    }
    if (!formData.nama_akun.trim()) {
      setFormError('Nama akun tidak boleh kosong');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const isCtrl = formData.controlType !== 'NONE' ? true : formData.isControlAccount;
      if (editingAccount) {
        // Mode Update
        await api.updateCoa(editingAccount.id, {
          kode_akun: formData.kode_akun,
          nama_akun: formData.nama_akun,
          kategori: formData.kategori,
          parentId: formData.parentId || null,
          isActive: formData.isActive,
          isControlAccount: isCtrl,
          controlType: formData.controlType,
        });
      } else {
        // Mode Create
        await api.createCoa({
          tenantId: currentTenant.id,
          kode_akun: formData.kode_akun,
          nama_akun: formData.nama_akun,
          kategori: formData.kategori,
          parentId: formData.parentId || null,
          isActive: formData.isActive,
          isControlAccount: isCtrl,
          controlType: formData.controlType,
        });
      }
      setIsModalOpen(false);
      fetchCoa();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data akun');
    } finally {
      setSubmitting(false);
    }
  };

  // Menghapus akun
  const handleDelete = async (id: string, nama: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus kode akun "${nama}"?`)) return;
    try {
      await api.deleteCoa(id);
      fetchCoa();
    } catch (err: any) {
      alert(`Gagal menghapus akun: ${err.message}`);
    }
  };

  // Badge warna per kategori akun
  const getCategoryBadge = (kategori: string) => {
    switch (kategori) {
      case 'ASET':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'LIABILITAS':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'EKUITAS':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'PENDAPATAN':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'BEBAN':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FolderTree className="w-7 h-7 text-indigo-400" />
            Chart of Accounts (COA)
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Kelola struktur bagan akun standar untuk <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Tambah Kode Akun
        </button>
      </div>

      {/* Filter & Toolbar Pencarian + Saldo Selector */}
      <div className="relative z-30 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3.5 backdrop-blur-md">
        {/* Row 1: Kategori Tabs & Search */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Filter Kategori Tabs */}
          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            {['ALL', 'ASET', 'LIABILITAS', 'EKUITAS', 'PENDAPATAN', 'BEBAN'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedKategori(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedKategori === cat
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {cat === 'ALL' ? 'Semua Kategori' : cat}
              </button>
            ))}
          </div>

          {/* Input Pencarian */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari kode atau nama akun..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Row 2: Konfigurasi Perhitungan Kolom Saldo (As of vs Mutasi) */}
        <div className="pt-3 border-t border-slate-800/70 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
              Pilihan Saldo:
            </span>
            <div className="inline-flex p-0.5 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setTipeSaldo('AS_OF')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  tipeSaldo === 'AS_OF'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                As of (Default)
              </button>
              <button
                type="button"
                onClick={() => setTipeSaldo('MUTASI')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  tipeSaldo === 'MUTASI'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mutasi
              </button>
            </div>

            {/* Date Filters according to Tipe Saldo */}
            {tipeSaldo === 'AS_OF' ? (
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-slate-400 text-[11px]">Per Tanggal:</span>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 ml-1">
                <span className="text-slate-400 text-[11px]">Dari:</span>
                <input
                  type="date"
                  value={mutasiStartDate}
                  onChange={(e) => setMutasiStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-400 text-[11px]">s/d:</span>
                <input
                  type="date"
                  value={mutasiEndDate}
                  onChange={(e) => setMutasiEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <span className="text-[11px] text-slate-500">
              {tipeSaldo === 'AS_OF'
                ? 'Saldo kumulatif s.d tanggal as of'
                : 'Pergerakan mutasi dalam rentang tanggal'}
            </span>
            <button
              type="button"
              onClick={fetchBalances}
              disabled={balanceLoading}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-1 text-[11px]"
              title="Refresh Nilai Saldo Akun"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${balanceLoading ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Tombol & Popover Pilihan Kolom */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                  showColumnPicker
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Pilih kolom mana yang ingin ditampilkan/disembunyikan"
              >
                <Columns3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Pilih Kolom</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/80 text-indigo-300 font-mono">
                  {Object.values(visibleColumns).filter(Boolean).length}/{COLUMN_DEFINITIONS.length}
                </span>
              </button>

              {/* Popover Pilihan Kolom */}
              {showColumnPicker && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowColumnPicker(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black z-50 p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Columns3 className="w-3.5 h-3.5 text-indigo-400" />
                        Pilihan Kolom
                      </span>
                      <button
                        type="button"
                        onClick={resetColumns}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline"
                      >
                        Reset Semua
                      </button>
                    </div>

                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {COLUMN_DEFINITIONS.map((col) => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer text-xs select-none transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.key]}
                            onChange={() => toggleColumn(col.key)}
                            className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                          />
                          <span
                            className={
                              visibleColumns[col.key]
                                ? 'text-slate-200 font-medium'
                                : 'text-slate-500 line-through'
                            }
                          >
                            {col.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabel Data Akun */}
      <div className="relative z-10 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Memuat data Chart of Accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Belum ada kode akun yang terdaftar untuk tenant ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  {visibleColumns.kode_akun && (
                    <th className="py-3.5 px-4 font-semibold">Kode Akun</th>
                  )}
                  {visibleColumns.nama_akun && (
                    <th className="py-3.5 px-4 font-semibold">Nama Akun</th>
                  )}
                  {visibleColumns.kategori && (
                    <th className="py-3.5 px-4 font-semibold">Kategori</th>
                  )}
                  {visibleColumns.controlType && (
                    <th className="py-3.5 px-4 font-semibold">Tipe Kontrol</th>
                  )}
                  {visibleColumns.parent && (
                    <th className="py-3.5 px-4 font-semibold">Akun Induk</th>
                  )}
                  {visibleColumns.saldo && (
                    <th className="py-3.5 px-4 font-semibold text-right min-w-[150px]">
                      <div>Saldo ({currentTenant?.mata_uang || 'IDR'})</div>
                      <div className="text-[10px] text-indigo-400 font-normal tracking-normal lowercase">
                        {tipeSaldo === 'AS_OF'
                          ? `as of ${asOfDate}`
                          : `mutasi ${mutasiStartDate} s/d ${mutasiEndDate}`}
                      </div>
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                  )}
                  {visibleColumns.aksi && (
                    <th className="py-3.5 px-4 font-semibold text-right">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {accounts.map((acc) => {
                  const isChild = !!acc.parentId;
                  return (
                    <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                      {visibleColumns.kode_akun && (
                        <td className="py-3 px-4 font-mono font-bold text-white">
                          <button
                            type="button"
                            onClick={() => handleOpenMutationModal(acc)}
                            className={`hover:underline flex items-center gap-1.5 text-left transition-colors ${
                              isChild ? 'pl-4 text-indigo-300 hover:text-indigo-200' : 'text-white hover:text-indigo-300'
                            }`}
                            title="Klik untuk melihat kartu mutasi akun ini"
                          >
                            {isChild && '↳ '}
                            {acc.kode_akun}
                          </button>
                        </td>
                      )}
                      {visibleColumns.nama_akun && (
                        <td className="py-3 px-4 font-medium text-slate-200">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={isChild ? 'pl-2 text-slate-300' : 'font-semibold text-white'}>
                              {acc.nama_akun}
                            </span>
                            {acc.isControlAccount && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                title="Akun Kontrol: Jurnal manual langsung diblokir"
                              >
                                <ShieldAlert className="w-3 h-3 text-amber-400" /> Akun Kontrol
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.kategori && (
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getCategoryBadge(
                              acc.kategori
                            )}`}
                          >
                            {acc.kategori}
                          </span>
                        </td>
                      )}
                      {visibleColumns.controlType && (
                        <td className="py-3 px-4">
                          {acc.controlType && acc.controlType !== 'NONE' ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                acc.controlType === 'AR'
                                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                  : acc.controlType === 'AP'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              <ShieldAlert className="w-3 h-3" />
                              {acc.controlType === 'AR' ? 'AR (Piutang)' : acc.controlType === 'AP' ? 'AP (Hutang)' : 'Persediaan'}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.parent && (
                        <td className="py-3 px-4 text-xs text-slate-400">
                          {acc.parent ? (
                            <span className="font-mono bg-slate-800/80 px-2 py-1 rounded text-slate-300">
                              {acc.parent.kode_akun} - {acc.parent.nama_akun}
                            </span>
                          ) : (
                            <span className="text-slate-600 italic">Utama (Induk)</span>
                          )}
                        </td>
                      )}

                      {/* Kolom Saldo */}
                      {visibleColumns.saldo && (
                        <td className="py-3 px-4 text-right font-mono font-medium">
                          {balanceLoading ? (
                            <span className="text-slate-600 animate-pulse text-xs">...</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenMutationModal(acc)}
                              className={`hover:underline transition-colors ${
                                (balanceMap[acc.id] || 0) === 0
                                  ? 'text-slate-500'
                                  : (balanceMap[acc.id] || 0) < 0
                                  ? 'text-rose-400 font-semibold'
                                  : 'text-slate-100 font-semibold'
                              }`}
                              title="Klik untuk melihat rincian mutasi akun ini"
                            >
                              {formatSaldo(balanceMap[acc.id])}
                            </button>
                          )}
                        </td>
                      )}

                      {visibleColumns.status && (
                        <td className="py-3 px-4">
                          {acc.isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                              <XCircle className="w-3.5 h-3.5" /> Nonaktif
                            </span>
                          )}
                        </td>
                      )}

                      {visibleColumns.aksi && (
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenMutationModal(acc)}
                            className="px-2 py-1.5 text-xs text-slate-300 hover:text-emerald-300 bg-slate-800/80 hover:bg-emerald-950/40 border border-slate-700/80 hover:border-emerald-500/40 rounded-lg transition-colors inline-flex items-center gap-1.5"
                            title="Lihat Mutasi Akun (Buku Besar)"
                          >
                            <History className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Mutasi</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(acc)}
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/50 rounded-lg transition-colors inline-flex items-center"
                            title="Edit Akun"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(acc.id, acc.nama_akun)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-colors inline-flex items-center"
                            title="Hapus Akun"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer Total Saldo */}
              {accounts.length > 0 && visibleColumns.saldo && (
                <tfoot className="bg-slate-950/80 border-t-2 border-slate-800 font-semibold text-xs">
                  <tr>
                    {['kode_akun', 'nama_akun', 'kategori', 'parent'].filter(
                      (k) => visibleColumns[k as keyof ColumnVisibility],
                    ).length > 0 && (
                      <td
                        colSpan={
                          ['kode_akun', 'nama_akun', 'kategori', 'parent'].filter(
                            (k) => visibleColumns[k as keyof ColumnVisibility],
                          ).length
                        }
                        className="py-3 px-4 text-slate-400"
                      >
                        Total ({accounts.length} Akun Ditampilkan)
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono text-white font-bold text-sm">
                      {formatSaldo(
                        accounts.reduce(
                          (sum, a) => sum + (balanceMap[a.id] || 0),
                          0,
                        ),
                      )}
                    </td>
                    {['status', 'aksi'].filter(
                      (k) => visibleColumns[k as keyof ColumnVisibility],
                    ).length > 0 && (
                      <td
                        colSpan={
                          ['status', 'aksi'].filter(
                            (k) => visibleColumns[k as keyof ColumnVisibility],
                          ).length
                        }
                      ></td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog Form Tambah / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">
                {editingAccount ? 'Edit Kode Akun' : 'Tambah Kode Akun Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Kode Akun <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 100001"
                    value={formData.kode_akun}
                    onChange={(e) => setFormData({ ...formData, kode_akun: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Kategori <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData({ ...formData, kategori: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ASET">ASET</option>
                    <option value="LIABILITAS">LIABILITAS</option>
                    <option value="EKUITAS">EKUITAS</option>
                    <option value="PENDAPATAN">PENDAPATAN</option>
                    <option value="BEBAN">BEBAN</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Nama Akun <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kas Utama Operasional"
                  value={formData.nama_akun}
                  onChange={(e) => setFormData({ ...formData, nama_akun: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Akun Induk (Opsional)
                </label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Tanpa Induk (Akun Utama) --</option>
                  {accounts
                    .filter((a) => !editingAccount || a.id !== editingAccount.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.kode_akun} - {a.nama_akun} ({a.kategori})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <label htmlFor="isActiveToggle" className="text-slate-300 font-medium cursor-pointer text-xs">
                  Akun Aktif (Dapat digunakan dalam entri jurnal)
                </label>
              </div>

              {/* Field Tipe Akun Kontrol Subledger */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
                  Tipe Akun Kontrol Sub Ledger
                </label>
                <select
                  value={formData.controlType}
                  onChange={(e) => {
                    const ct = e.target.value as 'NONE' | 'AR' | 'AP' | 'INVENTORY';
                    setFormData({
                      ...formData,
                      controlType: ct,
                      isControlAccount: ct !== 'NONE' ? true : formData.isControlAccount,
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="NONE">NONE (Bukan Akun Kontrol Subledger)</option>
                  <option value="AR">AR (Akun Kontrol Piutang Usaha)</option>
                  <option value="AP">AP (Akun Kontrol Hutang Usaha)</option>
                  <option value="INVENTORY">INVENTORY (Akun Kontrol Persediaan Barang)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Menetapkan tipe akun kontrol akan mengarahkan posting otomatis dari modul subledger bersangkutan.
                </p>
              </div>

              {/* Banner Peringatan Dampak Akun Kontrol */}
              {formData.controlType !== 'NONE' && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200 text-xs space-y-1 animate-in fade-in">
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    Konfirmasi Dampak Akun Kontrol ({formData.controlType})
                  </div>
                  <p className="leading-relaxed text-amber-200/80">
                    Direct posting manual dan entri jurnal mentah (API eksternal) ke akun ini akan otomatis <strong>DITOLAK</strong> oleh sistem. Posting ke akun ini hanya diizinkan melalui dokumen transaksi subledger.
                  </p>
                </div>
              )}

              {/* Checkbox Direct Posting Lock (isControlAccount) */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <label
                  htmlFor="isControlAccountToggle"
                  className={`flex items-start gap-2.5 ${
                    formData.controlType !== 'NONE' ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    id="isControlAccountToggle"
                    checked={formData.controlType !== 'NONE' ? true : formData.isControlAccount}
                    disabled={formData.controlType !== 'NONE'}
                    onChange={(e) => setFormData({ ...formData, isControlAccount: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 w-4 h-4 mt-0.5 disabled:opacity-50"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      Kunci Direct Posting (Akun Kontrol — Tolak Jurnal Mentah)
                      {formData.controlType !== 'NONE' && (
                        <span className="text-[10px] text-amber-400 font-normal italic">
                          (Terkunci otomatis oleh Tipe Kontrol {formData.controlType})
                        </span>
                      )}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Jika aktif, staf akuntansi dan integrasi luar tidak dapat memposting jurnal umum langsung ke akun ini untuk menjaga integritas saldo buku pembantu subledger.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Kode Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Mutasi Akun (Kartu Mutasi / Ledger) */}
      {isMutationModalOpen && mutationAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-lg font-bold text-white">Mutasi Akun Buku Besar</h3>
                    <span className="font-mono text-sm px-2.5 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 font-semibold">
                      {mutationAccount.kode_akun}
                    </span>
                    <span className="text-white font-semibold text-sm">
                      {mutationAccount.nama_akun}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getCategoryBadge(
                        mutationAccount.kategori,
                      )}`}
                    >
                      {mutationAccount.kategori}
                    </span>
                    {mutationAccount.isControlAccount && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <ShieldAlert className="w-3 h-3 text-amber-400" /> Akun Kontrol
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Kartu riwayat pergerakan debit, kredit, dan saldo berjalan akun ini
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMutationModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Bar: Tanggal, Deskripsi Jurnal, Dimensi */}
            <div className="p-4 bg-slate-950/50 border-b border-slate-800/80 shrink-0">
              <form onSubmit={handleApplyMutationFilters} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Filter 1: Tanggal Dari */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-emerald-400" /> Dari Tanggal
                    </label>
                    <input
                      type="date"
                      value={mutationStartDate}
                      onChange={(e) => setMutationStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Filter 2: Tanggal Sampai */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-emerald-400" /> Sampai Tanggal
                    </label>
                    <input
                      type="date"
                      value={mutationEndDate}
                      onChange={(e) => setMutationEndDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Filter 3: Deskripsi Jurnal */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                      <Search className="w-3 h-3 text-emerald-400" /> Deskripsi Jurnal
                    </label>
                    <input
                      type="text"
                      placeholder="Cari keterangan..."
                      value={mutationDeskripsi}
                      onChange={(e) => setMutationDeskripsi(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Filter 4: Dimensi */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-emerald-400" /> Dimensi
                    </label>
                    <select
                      value={mutationDimensionValue}
                      onChange={(e) => setMutationDimensionValue(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Semua Dimensi</option>
                      {dimensions.map((d) => (
                        <optgroup key={d.id} label={d.nama_dimension}>
                          {d.values
                            .filter((v) => v.isActive)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {d.nama_dimension}: {v.nama} ({v.kode})
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400">
                    Normal Balance: <strong className="text-emerald-400">{mutationData?.normalBalance || 'DEBIT'}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetMutationFilters}
                      disabled={mutationLoading}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                    >
                      Reset Filter
                    </button>
                    <button
                      type="submit"
                      disabled={mutationLoading}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition-colors flex items-center gap-1.5"
                    >
                      {mutationLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Filter className="w-3.5 h-3.5" />
                      )}
                      Terapkan Filter
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Body: Ringkasan & Tabel Mutasi */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Summary Cards */}
              {mutationData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-slate-400">Jumlah Transaksi</span>
                    <div className="text-base font-bold text-white mt-0.5">
                      {mutationData.totalMutasi}{' '}
                      <span className="text-xs font-normal text-slate-400">mutasi</span>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-slate-400">Total Mutasi Debit</span>
                    <div className="text-base font-bold text-emerald-400 mt-0.5 font-mono">
                      {(mutationData.totalDebit || 0).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-slate-400">Total Mutasi Kredit</span>
                    <div className="text-base font-bold text-rose-400 mt-0.5 font-mono">
                      {(mutationData.totalKredit || 0).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-emerald-300">Saldo Akhir Berjalan</span>
                    <div className="text-base font-bold text-emerald-400 mt-0.5 font-mono">
                      {currentTenant?.mata_uang || 'IDR'}{' '}
                      {mutationData.saldoAkhir.toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {mutationError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{mutationError}</span>
                </div>
              )}

              {/* Tabel Mutasi Transaksi */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 shadow-inner">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-3 min-w-[95px]">Tanggal</th>
                      <th className="py-2.5 px-3 min-w-[130px]">No. Voucher</th>
                      <th className="py-2.5 px-3 min-w-[200px]">Keterangan Jurnal</th>
                      <th className="py-2.5 px-3 min-w-[170px]">Dimensi</th>
                      <th className="py-2.5 px-3 text-right text-emerald-400/90 min-w-[110px]">Debit</th>
                      <th className="py-2.5 px-3 text-right text-rose-400/90 min-w-[110px]">Kredit</th>
                      <th className="py-2.5 px-3.5 text-right text-indigo-300 font-bold min-w-[125px]">Saldo Berjalan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {mutationLoading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                            <span>Memuat mutasi akun...</span>
                          </div>
                        </td>
                      </tr>
                    ) : !mutationData || mutationData.mutasi.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <History className="w-7 h-7 text-slate-600" />
                            <span>Tidak ada riwayat mutasi transaksi untuk akun ini dengan filter yang dipilih.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      mutationData.mutasi.map((m) => {
                        const dims = m.dimensions || [];
                        return (
                          <tr key={m.id} className="hover:bg-slate-900/50 transition-colors">
                            <td className="py-2.5 px-3 text-slate-300 font-mono">
                              {new Date(m.tanggal).toLocaleDateString('id-ID')}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-indigo-400">
                              {m.no_voucher}
                            </td>
                            <td className="py-2.5 px-3 text-slate-200">
                              <div>{m.deskripsi}</div>
                              <span className="text-[10px] text-slate-500">
                                {m.sumber_aplikasi}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              {dims.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {dims.map((d, dIdx) => (
                                    <span
                                      key={dIdx}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                                    >
                                      <span className="text-slate-400">{d.dimensionName}:</span>
                                      <span className="font-semibold text-slate-200">
                                        {d.valueName}
                                        {d.valueCode && (
                                          <span className="text-indigo-400 ml-0.5">({d.valueCode})</span>
                                        )}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-600 text-[11px] italic">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-medium">
                              {m.debit > 0 ? (
                                <span className="text-emerald-400">
                                  {m.debit.toLocaleString('id-ID')}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-medium">
                              {m.kredit > 0 ? (
                                <span className="text-rose-400">
                                  {m.kredit.toLocaleString('id-ID')}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-100">
                              {m.saldo_berjalan.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-between items-center shrink-0">
              <span className="text-xs text-slate-500">
                Data diperbarui secara realtime dari jurnal akuntansi yang telah diposting.
              </span>
              <button
                type="button"
                onClick={() => setIsMutationModalOpen(false)}
                className="px-5 py-2 text-sm font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
