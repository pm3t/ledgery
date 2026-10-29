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
} from 'lucide-react';
import { api, ChartOfAccount, Tenant } from '../services/api';

interface ChartOfAccountsPageProps {
  currentTenant: Tenant | null;
}

export const ChartOfAccountsPage: React.FC<ChartOfAccountsPageProps> = ({ currentTenant }) => {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedKategori, setSelectedKategori] = useState<string>('ALL');

  // State Modal Form
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [formData, setFormData] = useState({
    kode_akun: '',
    nama_akun: '',
    kategori: 'ASET',
    parentId: '',
    isActive: true,
    isControlAccount: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

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
      if (editingAccount) {
        // Mode Update
        await api.updateCoa(editingAccount.id, {
          kode_akun: formData.kode_akun,
          nama_akun: formData.nama_akun,
          kategori: formData.kategori,
          parentId: formData.parentId || null,
          isActive: formData.isActive,
          isControlAccount: formData.isControlAccount,
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
          isControlAccount: formData.isControlAccount,
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

      {/* Filter & Toolbar Pencarian */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-center backdrop-blur-sm">
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

      {/* Tabel Data Akun */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm">
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
                  <th className="py-3.5 px-4 font-semibold">Kode Akun</th>
                  <th className="py-3.5 px-4 font-semibold">Nama Akun</th>
                  <th className="py-3.5 px-4 font-semibold">Kategori</th>
                  <th className="py-3.5 px-4 font-semibold">Akun Induk</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {accounts.map((acc) => {
                  const isChild = !!acc.parentId;
                  return (
                    <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        <span className={isChild ? 'pl-4 text-indigo-300' : ''}>
                          {isChild && '↳ '}
                          {acc.kode_akun}
                        </span>
                      </td>
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
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getCategoryBadge(
                            acc.kategori
                          )}`}
                        >
                          {acc.kategori}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">
                        {acc.parent ? (
                          <span className="font-mono bg-slate-800/80 px-2 py-1 rounded text-slate-300">
                            {acc.parent.kode_akun} - {acc.parent.nama_akun}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Utama (Induk)</span>
                        )}
                      </td>
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
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(acc)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/50 rounded-lg transition-colors"
                          title="Edit Akun"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(acc.id, acc.nama_akun)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-colors"
                          title="Hapus Akun"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
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
                    onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
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

              {/* Checkbox Akun Kontrol */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <label htmlFor="isControlAccountToggle" className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="isControlAccountToggle"
                    checked={formData.isControlAccount}
                    onChange={(e) => setFormData({ ...formData, isControlAccount: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 w-4 h-4 mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      Akun Kontrol (Subledger Only — Blokir Jurnal Manual)
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Centang untuk akun Aset Tetap, Akumulasi Penyusutan, dsb. Staf akuntansi <strong>tidak dapat</strong> menginput jurnal manual langsung ke akun ini untuk mencegah selisih rekonsiliasi. Hanya sistem subledger (seperti EAM) yang dapat memposting ke akun ini via API.
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
    </div>
  );
};
