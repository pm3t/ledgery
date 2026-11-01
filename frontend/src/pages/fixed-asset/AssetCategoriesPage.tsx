import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  RefreshCw,
  Edit,
  Trash2,
  X,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  api,
  AssetCategory,
  FiscalDepreciationGroup,
  ChartOfAccount,
  AssetCategoryType,
  DepreciationMethod,
  FiscalStartRule,
} from '../../services/api';

export const AssetCategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [fiscalGroups, setFiscalGroups] = useState<FiscalDepreciationGroup[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AssetCategory | null>(null);
  const [formData, setFormData] = useState<{
    kode: string;
    nama: string;
    jenis: AssetCategoryType;
    dapatDisusutkan: boolean;
    metodeKomersial: DepreciationMethod;
    faktorSaldoMenurun: number;
    umurManfaatBulan: number;
    nilaiResiduPersen: number;
    fiscalGroupId: string;
    metodeFiskal: DepreciationMethod;
    aturanMulaiFiskal: FiscalStartRule;
    akunAsetId: string;
    akunAkumulasiId: string;
    akunBebanId: string;
    akunCipId: string;
    akunLabaRugiPelepasanId: string;
    akunRugiPenurunanNilaiId: string;
    akunRugiPenghapusanId: string;
  }>({
    kode: '',
    nama: '',
    jenis: 'BERWUJUD',
    dapatDisusutkan: true,
    metodeKomersial: 'GARIS_LURUS',
    faktorSaldoMenurun: 2.0,
    umurManfaatBulan: 48,
    nilaiResiduPersen: 0,
    fiscalGroupId: '',
    metodeFiskal: 'GARIS_LURUS',
    aturanMulaiFiskal: 'BULAN_PEROLEHAN',
    akunAsetId: '',
    akunAkumulasiId: '',
    akunBebanId: '',
    akunCipId: '',
    akunLabaRugiPelepasanId: '',
    akunRugiPenurunanNilaiId: '',
    akunRugiPenghapusanId: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, fgRes, coaRes] = await Promise.all([
        api.getAssetCategories(),
        api.getFiscalGroups(),
        api.getCoa(),
      ]);
      setCategories(Array.isArray(catRes) ? catRes : []);
      setFiscalGroups(Array.isArray(fgRes) ? fgRes : []);
      setAccounts(Array.isArray(coaRes) ? coaRes : []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal memuat master kategori aset' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setFormData({
      kode: '',
      nama: '',
      jenis: 'BERWUJUD',
      dapatDisusutkan: true,
      metodeKomersial: 'GARIS_LURUS',
      faktorSaldoMenurun: 2.0,
      umurManfaatBulan: 48,
      nilaiResiduPersen: 0,
      fiscalGroupId: fiscalGroups[0]?.id || '',
      metodeFiskal: 'GARIS_LURUS',
      aturanMulaiFiskal: 'BULAN_PEROLEHAN',
      akunAsetId: '',
      akunAkumulasiId: '',
      akunBebanId: '',
      akunCipId: '',
      akunLabaRugiPelepasanId: '',
      akunRugiPenurunanNilaiId: '',
      akunRugiPenghapusanId: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: AssetCategory) => {
    setEditingCategory(cat);
    setFormData({
      kode: cat.kode,
      nama: cat.nama,
      jenis: cat.jenis,
      dapatDisusutkan: cat.dapatDisusutkan,
      metodeKomersial: cat.metodeKomersial,
      faktorSaldoMenurun: cat.faktorSaldoMenurun || 2.0,
      umurManfaatBulan: cat.umurManfaatBulan,
      nilaiResiduPersen: cat.nilaiResiduPersen || 0,
      fiscalGroupId: cat.fiscalGroupId || '',
      metodeFiskal: cat.metodeFiskal,
      aturanMulaiFiskal: cat.aturanMulaiFiskal,
      akunAsetId: cat.akunAsetId,
      akunAkumulasiId: cat.akunAkumulasiId,
      akunBebanId: cat.akunBebanId,
      akunCipId: cat.akunCipId,
      akunLabaRugiPelepasanId: cat.akunLabaRugiPelepasanId,
      akunRugiPenurunanNilaiId: cat.akunRugiPenurunanNilaiId,
      akunRugiPenghapusanId: cat.akunRugiPenghapusanId,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.akunAsetId || !formData.akunAkumulasiId || !formData.akunBebanId || !formData.akunCipId) {
      alert('Harap lengkapi seluruh akun GL (Aset Tetap, Akumulasi, Beban, dan CIP).');
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const payload: any = {
        nama: formData.nama,
        jenis: formData.jenis,
        dapatDisusutkan: formData.dapatDisusutkan,
        metodeKomersial: formData.metodeKomersial,
        faktorSaldoMenurun: Number(formData.faktorSaldoMenurun),
        umurManfaatBulan: Number(formData.umurManfaatBulan),
        nilaiResiduPersen: Number(formData.nilaiResiduPersen),
        fiscalGroupId: formData.fiscalGroupId || null,
        metodeFiskal: formData.metodeFiskal,
        aturanMulaiFiskal: formData.aturanMulaiFiskal,
        akunAsetId: formData.akunAsetId,
        akunAkumulasiId: formData.akunAkumulasiId,
        akunBebanId: formData.akunBebanId,
        akunCipId: formData.akunCipId,
        akunLabaRugiPelepasanId: formData.akunLabaRugiPelepasanId || formData.akunBebanId,
        akunRugiPenurunanNilaiId: formData.akunRugiPenurunanNilaiId || formData.akunBebanId,
        akunRugiPenghapusanId: formData.akunRugiPenghapusanId || formData.akunBebanId,
      };

      if (editingCategory) {
        await api.updateAssetCategory(editingCategory.id, payload);
        setMsg({ type: 'success', text: `Kategori "${formData.nama}" berhasil diperbarui.` });
      } else {
        payload.kode = formData.kode;
        await api.createAssetCategory(payload);
        setMsg({ type: 'success', text: `Kategori baru "${formData.nama}" berhasil ditambahkan.` });
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menyimpan kategori aset' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm(`Hapus kategori aset "${nama}"?`)) return;
    setLoading(true);
    try {
      await api.deleteAssetCategory(id);
      setMsg({ type: 'success', text: `Kategori "${nama}" berhasil dihapus.` });
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menghapus kategori aset' });
    } finally {
      setLoading(false);
    }
  };

  // Filter COA berdasarkan tipe
  const assetAccounts = accounts.filter((a) => a.kategori === 'ASET');
  const expenseAccounts = accounts.filter((a) => a.kategori === 'BEBAN');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="w-7 h-7 text-emerald-700" />
            Master Kategori Aset Tetap
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Konfigurasi pemetaan akun kontrol GL, umur manfaat default, dan metode penyusutan komersial & fiskal.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition-colors shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Kategori
          </button>
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

      {/* Tabel Kategori */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
              <tr>
                <th className="py-3 px-4 font-bold">Kode</th>
                <th className="py-3 px-4 font-bold">Nama Kategori</th>
                <th className="py-3 px-4 font-bold">Jenis</th>
                <th className="py-3 px-4 text-center font-bold">Umur Komersial</th>
                <th className="py-3 px-4 font-bold">Kelompok Fiskal</th>
                <th className="py-3 px-4 font-bold">Akun Aset & CIP</th>
                <th className="py-3 px-4 font-bold">Akun Akumulasi & Beban</th>
                <th className="py-3 px-4 text-right font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Memuat data kategori aset...
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Belum ada kategori aset yang terdaftar. Silakan tambah kategori baru.
                  </td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{c.kode}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{c.nama}</div>
                      <div className="text-[10px] text-slate-500">
                        {c.dapatDisusutkan ? (
                          <span className="text-emerald-700 font-semibold">Dapat Disusutkan</span>
                        ) : (
                          <span className="text-amber-700 font-semibold">Tidak Disusutkan (Tanah)</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.jenis === 'TAK_BERWUJUD'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {c.jenis === 'TAK_BERWUJUD' ? 'Tak Berwujud' : 'Berwujud'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                      {Math.floor(c.umurManfaatBulan / 12)} Th ({c.umurManfaatBulan} bln)
                      <div className="text-[10px] text-slate-500 font-sans font-medium">
                        {c.metodeKomersial === 'GARIS_LURUS' ? 'Garis Lurus' : 'Saldo Menurun'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {c.fiscalGroup ? (
                        <div>
                          <div className="font-semibold text-slate-900">{c.fiscalGroup.nama}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {c.fiscalGroup.kode} • {c.metodeFiskal === 'GARIS_LURUS' ? 'Garis Lurus' : 'Saldo Menurun'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Tanpa Pemetaan</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div className="text-emerald-900 font-bold" title={c.akunAset?.nama_akun}>
                        Aset: {c.akunAset?.kode_akun || '-'}
                      </div>
                      <div className="text-amber-800" title={c.akunCip?.nama_akun}>
                        CIP: {c.akunCip?.kode_akun || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div className="text-slate-800" title={c.akunAkumulasi?.nama_akun}>
                        Akum: {c.akunAkumulasi?.kode_akun || '-'}
                      </div>
                      <div className="text-slate-600" title={c.akunBeban?.nama_akun}>
                        Beban: {c.akunBeban?.kode_akun || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(c)}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Kategori"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id, c.nama)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Hapus Kategori"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Edit Kategori */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editingCategory ? 'Edit Kategori Aset Tetap' : 'Tambah Kategori Aset Tetap Baru'}
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
              {/* Row 1: Identitas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Kode Kategori <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingCategory}
                    value={formData.kode}
                    onChange={(e) => setFormData({ ...formData, kode: e.target.value })}
                    placeholder="Mis. KENDARAAN"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nama Kategori <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nama}
                    onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                    placeholder="Mis. Kendaraan Operasional & Armada"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Row 2: Jenis & Opsi Disusutkan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Jenis Aset</label>
                  <select
                    value={formData.jenis}
                    onChange={(e) => setFormData({ ...formData, jenis: e.target.value as AssetCategoryType })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="BERWUJUD">Aset Berwujud (Tangible)</option>
                    <option value="TAK_BERWUJUD">Aset Tak Berwujud (Intangible)</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="dapatDisusutkan"
                    checked={formData.dapatDisusutkan}
                    onChange={(e) => setFormData({ ...formData, dapatDisusutkan: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="dapatDisusutkan" className="text-xs font-bold text-slate-800 cursor-pointer">
                    Aset Dapat Disusutkan (Depreciable)
                  </label>
                </div>
              </div>

              {/* Row 3: Pengaturan Komersial */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="font-bold text-xs text-slate-800 uppercase flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Penyusutan Buku Komersial
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Metode</label>
                    <select
                      value={formData.metodeKomersial}
                      onChange={(e) =>
                        setFormData({ ...formData, metodeKomersial: e.target.value as DepreciationMethod })
                      }
                      className="w-full bg-white border border-slate-200 text-slate-900 text-xs rounded-xl p-2 font-semibold"
                    >
                      <option value="GARIS_LURUS">Garis Lurus (Straight Line)</option>
                      <option value="SALDO_MENURUN">Saldo Menurun (Declining)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Umur Manfaat (Bulan)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={formData.umurManfaatBulan}
                      onChange={(e) => setFormData({ ...formData, umurManfaatBulan: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-xs rounded-xl p-2 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Nilai Residu (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={formData.nilaiResiduPersen}
                      onChange={(e) => setFormData({ ...formData, nilaiResiduPersen: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-xs rounded-xl p-2 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Pengaturan Fiskal (PMK 72/2023) */}
              <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3">
                <div className="font-bold text-xs text-emerald-950 uppercase flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  Penyusutan Buku Fiskal (Pajak)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 uppercase mb-1">
                      Kelompok Fiskal
                    </label>
                    <select
                      value={formData.fiscalGroupId}
                      onChange={(e) => setFormData({ ...formData, fiscalGroupId: e.target.value })}
                      className="w-full bg-white border border-emerald-200 text-slate-900 text-xs rounded-xl p-2 font-semibold"
                    >
                      <option value="">-- Tanpa Pemetaan --</option>
                      {fiscalGroups.map((fg) => (
                        <option key={fg.id} value={fg.id}>
                          {fg.kode} - {fg.nama} ({fg.masaManfaatBulan / 12} Th)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 uppercase mb-1">
                      Metode Fiskal
                    </label>
                    <select
                      value={formData.metodeFiskal}
                      onChange={(e) =>
                        setFormData({ ...formData, metodeFiskal: e.target.value as DepreciationMethod })
                      }
                      className="w-full bg-white border border-emerald-200 text-slate-900 text-xs rounded-xl p-2 font-semibold"
                    >
                      <option value="GARIS_LURUS">Garis Lurus</option>
                      <option value="SALDO_MENURUN">Saldo Menurun</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 uppercase mb-1">
                      Aturan Mulai Fiskal
                    </label>
                    <select
                      value={formData.aturanMulaiFiskal}
                      onChange={(e) =>
                        setFormData({ ...formData, aturanMulaiFiskal: e.target.value as FiscalStartRule })
                      }
                      className="w-full bg-white border border-emerald-200 text-slate-900 text-xs rounded-xl p-2 font-semibold"
                    >
                      <option value="BULAN_PEROLEHAN">Bulan Perolehan</option>
                      <option value="BULAN_PRODUKSI_KOMERSIAL">Bulan Produksi Komersial</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Row 5: Pemetaan Akun GL (Otomatis Akun Kontrol FIXED_ASSET) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="font-bold text-xs text-slate-800 uppercase flex items-center justify-between">
                  <span>Pemetaan Akun Buku Besar (GL)</span>
                  <span className="text-[10px] text-emerald-700 font-bold lowercase">
                    * Akun Aset, Akumulasi, dan CIP otomatis menjadi akun kontrol
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Akun Aset Tetap <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.akunAsetId}
                      onChange={(e) => setFormData({ ...formData, akunAsetId: e.target.value })}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-xs rounded-xl p-2 font-semibold"
                    >
                      <option value="">-- Pilih Akun Aset --</option>
                      {assetAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kode_akun} - {a.nama_akun}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Akun Akumulasi Penyusutan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.akunAkumulasiId}
                      onChange={(e) => setFormData({ ...formData, akunAkumulasiId: e.target.value })}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-xs rounded-xl p-2 font-semibold"
                    >
                      <option value="">-- Pilih Akun Akumulasi --</option>
                      {assetAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kode_akun} - {a.nama_akun}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Akun CIP (Dalam Penyelesaian) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.akunCipId}
                      onChange={(e) => setFormData({ ...formData, akunCipId: e.target.value })}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-xs rounded-xl p-2 font-semibold"
                    >
                      <option value="">-- Pilih Akun CIP --</option>
                      {assetAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kode_akun} - {a.nama_akun}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      Akun Beban Penyusutan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.akunBebanId}
                      onChange={(e) => setFormData({ ...formData, akunBebanId: e.target.value })}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-xs rounded-xl p-2 font-semibold"
                    >
                      <option value="">-- Pilih Akun Beban --</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kode_akun} - {a.nama_akun}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
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
                  {submitting ? 'Menyimpan...' : 'Simpan Kategori'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetCategoriesPage;
