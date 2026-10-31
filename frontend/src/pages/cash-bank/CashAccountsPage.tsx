import React, { useState, useEffect } from 'react';
import {
  Landmark,
  Wallet,
  Banknote,
  Smartphone,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { api, CashBankAccount, CashBankAccountType, ChartOfAccount } from '../../services/api';

/**
 * Halaman Pengelolaan Rekening Kas & Bank
 * Mendukung jenis: Kas Tunai, Kas Kecil (Imprest), Bank, dan Dompet Digital.
 * Terhubung 1:1 dengan akun Chart of Account bertipe kontrol CASH_BANK.
 */
export const CashAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [coaList, setCoaList] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedAccount, setSelectedAccount] = useState<CashBankAccount | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    kode: '',
    nama: '',
    jenis: 'BANK' as CashBankAccountType,
    chartOfAccountId: '',
    mata_uang: 'IDR',
    namaBank: '',
    noRekening: '',
    namaPemilik: '',
    plafonKasKecil: 0,
    isActive: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accRes, coaRes] = await Promise.all([
        api.getCashAccounts(true),
        api.getCoa(),
      ]);
      setAccounts(Array.isArray(accRes) ? accRes : []);
      // Filter COA yang bertipe kontrol CASH_BANK atau kategori ASET
      const coas = Array.isArray(coaRes) ? coaRes : [];
      setCoaList(coas.filter((c: any) => c.controlType === 'CASH_BANK' || c.kategori === 'ASET'));
    } catch (err: any) {
      console.error('Gagal memuat daftar rekening kas/bank:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setModalMode('create');
    setSelectedAccount(null);
    setFormData({
      kode: '',
      nama: '',
      jenis: 'BANK',
      chartOfAccountId: coaList.find((c) => c.controlType === 'CASH_BANK')?.id || '',
      mata_uang: 'IDR',
      namaBank: '',
      noRekening: '',
      namaPemilik: '',
      plafonKasKecil: 0,
      isActive: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (acc: CashBankAccount) => {
    setModalMode('edit');
    setSelectedAccount(acc);
    setFormData({
      kode: acc.kode,
      nama: acc.nama,
      jenis: acc.jenis,
      chartOfAccountId: acc.chartOfAccountId,
      mata_uang: acc.mata_uang,
      namaBank: acc.namaBank || '',
      noRekening: acc.noRekening || '',
      namaPemilik: acc.namaPemilik || '',
      plafonKasKecil: acc.plafonKasKecil || 0,
      isActive: acc.isActive,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (modalMode === 'create') {
        await api.createCashAccount({
          kode: formData.kode,
          nama: formData.nama,
          jenis: formData.jenis,
          chartOfAccountId: formData.chartOfAccountId,
          mata_uang: formData.mata_uang,
          namaBank: formData.jenis === 'BANK' ? formData.namaBank : null,
          noRekening: formData.jenis === 'BANK' ? formData.noRekening : null,
          namaPemilik: formData.jenis === 'BANK' ? formData.namaPemilik : null,
          plafonKasKecil: formData.jenis === 'KAS_KECIL' ? Number(formData.plafonKasKecil) : null,
          isActive: formData.isActive,
        });
      } else if (selectedAccount) {
        await api.updateCashAccount(selectedAccount.id, {
          nama: formData.nama,
          jenis: formData.jenis,
          namaBank: formData.jenis === 'BANK' ? formData.namaBank : null,
          noRekening: formData.jenis === 'BANK' ? formData.noRekening : null,
          namaPemilik: formData.jenis === 'BANK' ? formData.namaPemilik : null,
          plafonKasKecil: formData.jenis === 'KAS_KECIL' ? Number(formData.plafonKasKecil) : null,
          isActive: formData.isActive,
        });
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data rekening');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string, nama: string) => {
    if (!confirm(`Apakah Anda yakin ingin menonaktifkan rekening "${nama}"?`)) return;
    try {
      await api.deactivateCashAccount(id);
      loadData();
    } catch (err: any) {
      alert(`Gagal menonaktifkan rekening: ${err.message}`);
    }
  };

  // Filter accounts
  const filteredAccounts = accounts.filter((acc) => {
    const matchSearch =
      acc.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.kode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.noRekening && acc.noRekening.includes(searchQuery));
    const matchType = selectedType === 'ALL' || acc.jenis === selectedType;
    return matchSearch && matchType;
  });

  const getAccountIcon = (jenis: CashBankAccountType) => {
    switch (jenis) {
      case 'BANK':
        return <Landmark className="w-5 h-5 text-indigo-600" />;
      case 'KAS_TUNAI':
        return <Banknote className="w-5 h-5 text-emerald-600" />;
      case 'KAS_KECIL':
        return <Wallet className="w-5 h-5 text-amber-600" />;
      case 'DOMPET_DIGITAL':
        return <Smartphone className="w-5 h-5 text-violet-600" />;
      default:
        return <Landmark className="w-5 h-5 text-slate-600" />;
    }
  };

  const getBadgeColor = (jenis: CashBankAccountType) => {
    switch (jenis) {
      case 'BANK':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'KAS_TUNAI':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'KAS_KECIL':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'DOMPET_DIGITAL':
        return 'bg-violet-50 text-violet-700 border-violet-200';
    }
  };

  const formatCurrency = (val: number | undefined | null, curr = 'IDR') => {
    if (val === undefined || val === null) return '-';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Landmark className="w-7 h-7 text-emerald-700" />
            Master Rekening Kas & Bank
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Kelola seluruh rekening perbankan, kas operasional, kas kecil (imprest), dan dompet digital perusahaan.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition-colors shadow-sm"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Tambah Rekening Baru
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3">
          {/* Tipe Selector Tabs */}
          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            {[
              { id: 'ALL', label: 'Semua Rekening' },
              { id: 'BANK', label: 'Bank' },
              { id: 'KAS_TUNAI', label: 'Kas Operasional' },
              { id: 'KAS_KECIL', label: 'Kas Kecil' },
              { id: 'DOMPET_DIGITAL', label: 'Dompet Digital' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedType(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedType === tab.id
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari kode, nama, atau no rek..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* Card Grid Rekening Kas & Bank */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
          Memuat daftar rekening kas & bank...
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="p-12 text-center text-slate-500 text-sm bg-white rounded-2xl border border-slate-200">
          <Landmark className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          Belum ada rekening kas atau bank yang terdaftar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAccounts.map((acc) => (
            <div
              key={acc.id}
              className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                acc.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
              }`}
            >
              <div>
                {/* Header Card */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      {getAccountIcon(acc.jenis)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{acc.nama}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs font-semibold text-slate-600">{acc.kode}</span>
                        <span className="text-slate-300">•</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getBadgeColor(acc.jenis)}`}>
                          {acc.jenis}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(acc)}
                      className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Edit Rekening"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {acc.isActive && (
                      <button
                        onClick={() => handleDeactivate(acc.id, acc.nama)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Nonaktifkan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Detail Information */}
                <div className="space-y-2 py-3 border-y border-slate-100 text-xs">
                  {acc.jenis === 'BANK' && (
                    <>
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Bank & No. Rekening:</span>
                        <span className="font-semibold text-slate-900">
                          {acc.namaBank || '-'} {acc.noRekening ? `• ${acc.noRekening}` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Atas Nama:</span>
                        <span className="font-medium text-slate-900">{acc.namaPemilik || '-'}</span>
                      </div>
                    </>
                  )}

                  {acc.jenis === 'KAS_KECIL' && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Plafon Kas Kecil:</span>
                      <span className="font-semibold text-amber-800">
                        {formatCurrency(acc.plafonKasKecil, acc.mata_uang)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-slate-600">
                    <span>Akun Buku Besar (GL):</span>
                    <span className="font-medium text-emerald-800 truncate max-w-[180px]">
                      {acc.chartOfAccount?.kode_akun} - {acc.chartOfAccount?.nama_akun}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600">
                    <span>Mata Uang:</span>
                    <span className="font-semibold text-slate-900">{acc.mata_uang}</span>
                  </div>
                </div>
              </div>

              {/* Footer: Saldo */}
              <div className="pt-3 mt-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Saldo Buku Kas
                </span>
                <span className="text-base font-bold text-slate-900 font-mono">
                  {formatCurrency(acc.currentBalance ?? 0, acc.mata_uang)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Tambah / Edit Rekening */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-700" />
                {modalMode === 'create' ? 'Tambah Rekening Kas / Bank' : 'Edit Rekening Kas / Bank'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kode Rekening <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={modalMode === 'edit'}
                    placeholder="Contoh: BCA-01"
                    value={formData.kode}
                    onChange={(e) => setFormData({ ...formData, kode: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jenis Rekening <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.jenis}
                    onChange={(e) => setFormData({ ...formData, jenis: e.target.value as CashBankAccountType })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-semibold"
                  >
                    <option value="BANK">Bank</option>
                    <option value="KAS_TUNAI">Kas Tunai Operasional</option>
                    <option value="KAS_KECIL">Kas Kecil (Petty Cash)</option>
                    <option value="DOMPET_DIGITAL">Dompet Digital (E-Wallet)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Rekening / Kas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Bank BCA Giro Operasional"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Akun GL Buku Besar <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    disabled={modalMode === 'edit'}
                    value={formData.chartOfAccountId}
                    onChange={(e) => setFormData({ ...formData, chartOfAccountId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="">-- Pilih Akun GL Kas/Bank --</option>
                    {coaList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.kode_akun} - {c.nama_akun}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mata Uang</label>
                  <input
                    type="text"
                    disabled={modalMode === 'edit'}
                    placeholder="IDR, USD, dll."
                    value={formData.mata_uang}
                    onChange={(e) => setFormData({ ...formData, mata_uang: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Field Khusus BANK */}
              {formData.jenis === 'BANK' && (
                <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="font-semibold text-slate-800 text-xs">Informasi Rekening Bank</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Nama Bank</label>
                      <input
                        type="text"
                        placeholder="BCA, Mandiri, BRI, dll."
                        value={formData.namaBank}
                        onChange={(e) => setFormData({ ...formData, namaBank: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Nomor Rekening</label>
                      <input
                        type="text"
                        placeholder="Contoh: 1234567890"
                        value={formData.noRekening}
                        onChange={(e) => setFormData({ ...formData, noRekening: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Nama Pemilik Rekening</label>
                    <input
                      type="text"
                      placeholder="Nama PT atau Perorangan"
                      value={formData.namaPemilik}
                      onChange={(e) => setFormData({ ...formData, namaPemilik: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              )}

              {/* Field Khusus KAS_KECIL */}
              {formData.jenis === 'KAS_KECIL' && (
                <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                  <div className="font-semibold text-amber-900 text-xs">Pengaturan Sistem Kas Kecil Imprest</div>
                  <div>
                    <label className="block text-[11px] font-medium text-amber-900 mb-1">
                      Plafon Maksimal Kas Kecil (IDR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      placeholder="Contoh: 5000000"
                      value={formData.plafonKasKecil}
                      onChange={(e) => setFormData({ ...formData, plafonKasKecil: Number(e.target.value) })}
                      className="w-full bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                    <p className="text-[10px] text-amber-800 mt-1">
                      Plafon ini menjadi batas acuan saat pengisian kas kecil kembali ke nominal semula (sistem imprest).
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="isActiveCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Rekening Aktif untuk Transaksi
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : modalMode === 'create' ? 'Buat Rekening' : 'Perbarui Rekening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default CashAccountsPage;

