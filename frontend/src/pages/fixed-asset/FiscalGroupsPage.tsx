import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Percent,
  Plus,
  RefreshCw,
  Edit,
  Trash2,
  X,
  Check,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import {
  api,
  FiscalDepreciationGroup,
  FiscalGroupType,
} from '../../services/api';

export const FiscalGroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<FiscalDepreciationGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FiscalDepreciationGroup | null>(null);
  const [formData, setFormData] = useState<{
    kode: string;
    nama: string;
    jenis: FiscalGroupType;
    masaManfaatBulan: number;
    tarifGarisLurus: number;
    tarifSaldoMenurun: number | null;
  }>({
    kode: '',
    nama: '',
    jenis: 'BUKAN_BANGUNAN',
    masaManfaatBulan: 48,
    tarifGarisLurus: 25,
    tarifSaldoMenurun: 50,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await api.getFiscalGroups();
      setGroups(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal memuat kelompok penyusutan fiskal' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setFormData({
      kode: '',
      nama: '',
      jenis: 'BUKAN_BANGUNAN',
      masaManfaatBulan: 48,
      tarifGarisLurus: 25,
      tarifSaldoMenurun: 50,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (group: FiscalDepreciationGroup) => {
    setEditingGroup(group);
    setFormData({
      kode: group.kode,
      nama: group.nama,
      jenis: group.jenis,
      masaManfaatBulan: group.masaManfaatBulan,
      tarifGarisLurus: Number(group.tarifGarisLurus),
      tarifSaldoMenurun: group.tarifSaldoMenurun !== null ? Number(group.tarifSaldoMenurun) : null,
    });
    setIsModalOpen(true);
  };

  const handleSeed = async (specific = false) => {
    if (!confirm('Muat data kelompok penyusutan fiskal standar sesuai PMK 72/2023?')) return;
    setLoading(true);
    try {
      const res = await api.seedFiscalGroups(specific);
      setMsg({ type: 'success', text: `Berhasil menambahkan ${res.createdCount} kelompok fiskal standar.` });
      await fetchGroups();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal memuat seed kelompok fiskal' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      if (editingGroup) {
        await api.updateFiscalGroup(editingGroup.id, {
          nama: formData.nama,
          masaManfaatBulan: Number(formData.masaManfaatBulan),
          tarifGarisLurus: Number(formData.tarifGarisLurus),
          tarifSaldoMenurun:
            formData.jenis === 'BANGUNAN' ? null : Number(formData.tarifSaldoMenurun) || null,
        });
        setMsg({ type: 'success', text: 'Kelompok fiskal berhasil diperbarui.' });
      } else {
        await api.createFiscalGroup({
          kode: formData.kode,
          nama: formData.nama,
          jenis: formData.jenis,
          masaManfaatBulan: Number(formData.masaManfaatBulan),
          tarifGarisLurus: Number(formData.tarifGarisLurus),
          tarifSaldoMenurun:
            formData.jenis === 'BANGUNAN' ? null : Number(formData.tarifSaldoMenurun) || null,
        });
        setMsg({ type: 'success', text: 'Kelompok fiskal baru berhasil ditambahkan.' });
      }
      setIsModalOpen(false);
      await fetchGroups();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menyimpan kelompok fiskal' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm(`Hapus kelompok fiskal "${nama}"?`)) return;
    setLoading(true);
    try {
      await api.deleteFiscalGroup(id);
      setMsg({ type: 'success', text: `Kelompok fiskal "${nama}" berhasil dihapus.` });
      await fetchGroups();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menghapus kelompok fiskal' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Percent className="w-7 h-7 text-emerald-700" />
            Kelompok Penyusutan Fiskal
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Master tarif dan masa manfaat pajak (Buku Paralel Fiskal) mengacu pada peraturan perpajakan Indonesia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchGroups}
            disabled={loading}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition-colors shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => handleSeed(false)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Muat Standar PMK 72/2023
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Kelompok
          </button>
        </div>
      </div>

      {/* Banner Regulasi Penting */}
      <div className="bg-amber-50/90 border border-amber-300/80 rounded-2xl p-4.5 flex items-start gap-3.5 shadow-sm">
        <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-950 space-y-1">
          <div className="font-bold text-sm text-amber-900">
            Rujukan Regulasi: Peraturan Menteri Keuangan (PMK) No. 72 Tahun 2023
          </div>
          <p>
            Masa manfaat dan tarif penyusutan fiskal di bawah ini mengacu pada PMK 72/2023 (menggantikan
            PMK-96/2009). Seluruh angka pada tabel ini adalah <strong>master data yang dapat disesuaikan</strong> oleh
            wajib pajak/tenant dan tidak dibekukan secara statis.
          </p>
          <p className="font-semibold text-amber-800">
            Catatan: Untuk aset kategori Bangunan (Permanen maupun Tidak Permanen), metode fiskal yang diperbolehkan
            hanya Garis Lurus (Straight Line).
          </p>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              : 'bg-rose-100 text-rose-900 border border-rose-300'
          }`}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{msg.text}</span>
        </div>
      )}

      {/* Tabel Kelompok Fiskal */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
              <tr>
                <th className="py-3 px-4 font-bold">Kode</th>
                <th className="py-3 px-4 font-bold">Nama Kelompok</th>
                <th className="py-3 px-4 font-bold">Jenis Aset</th>
                <th className="py-3 px-4 text-center font-bold">Masa Manfaat</th>
                <th className="py-3 px-4 text-right font-bold text-emerald-800">Tarif Garis Lurus</th>
                <th className="py-3 px-4 text-right font-bold text-blue-800">Tarif Saldo Menurun</th>
                <th className="py-3 px-4 text-right font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Memuat data kelompok penyusutan fiskal...
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 space-y-2">
                    <p>Belum ada kelompok penyusutan fiskal yang terdaftar.</p>
                    <button
                      type="button"
                      onClick={() => handleSeed(false)}
                      className="px-3.5 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold"
                    >
                      Klik di sini untuk mengisi otomatis standar PMK 72/2023
                    </button>
                  </td>
                </tr>
              ) : (
                groups.map((g) => {
                  const years = Math.floor(g.masaManfaatBulan / 12);
                  const remMonths = g.masaManfaatBulan % 12;
                  return (
                    <tr key={g.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{g.kode}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{g.nama}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            g.jenis === 'BANGUNAN'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}
                        >
                          {g.jenis === 'BANGUNAN' ? 'Bangunan' : 'Bukan Bangunan'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                        {years > 0 && `${years} Tahun`} {remMonths > 0 && `${remMonths} Bln`} ({g.masaManfaatBulan} bln)
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">
                        {Number(g.tarifGarisLurus).toFixed(2)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-800">
                        {g.tarifSaldoMenurun !== null ? `${Number(g.tarifSaldoMenurun).toFixed(2)}%` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(g)}
                            className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit Tarif & Masa Manfaat"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(g.id, g.nama)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Hapus Kelompok"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Edit Kelompok Fiskal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editingGroup ? 'Edit Kelompok Penyusutan Fiskal' : 'Tambah Kelompok Fiskal Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Kode Kelompok <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingGroup}
                  value={formData.kode}
                  onChange={(e) => setFormData({ ...formData, kode: e.target.value })}
                  placeholder="Mis. FISKAL-1"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nama Kelompok <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  placeholder="Mis. Kelompok 1 (Bukan Bangunan)"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Jenis Aset</label>
                <select
                  disabled={!!editingGroup}
                  value={formData.jenis}
                  onChange={(e) => {
                    const j = e.target.value as FiscalGroupType;
                    setFormData({
                      ...formData,
                      jenis: j,
                      tarifSaldoMenurun: j === 'BANGUNAN' ? null : formData.tarifSaldoMenurun || 50,
                    });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-60"
                >
                  <option value="BUKAN_BANGUNAN">Bukan Bangunan</option>
                  <option value="BANGUNAN">Bangunan</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Masa Manfaat (Bulan)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.masaManfaatBulan}
                    onChange={(e) => setFormData({ ...formData, masaManfaatBulan: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <span className="text-[10px] text-slate-500 font-medium">
                    = {(formData.masaManfaatBulan / 12).toFixed(1)} Tahun
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tarif Garis Lurus (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min={0}
                    max={100}
                    value={formData.tarifGarisLurus}
                    onChange={(e) => setFormData({ ...formData, tarifGarisLurus: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tarif Saldo Menurun (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={formData.jenis === 'BANGUNAN'}
                    min={0}
                    max={100}
                    value={formData.tarifSaldoMenurun ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tarifSaldoMenurun: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder={formData.jenis === 'BANGUNAN' ? 'N/A (Bangunan)' : '0'}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Kelompok'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiscalGroupsPage;

