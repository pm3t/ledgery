import React, { useState, useEffect } from 'react';
import {
  api,
  FixedAsset,
  AssetCategory,
  ChartOfAccount,
} from '../../services/api';
import {
  Building2,
  RefreshCw,
  Search,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';

export const AssetCapitalizationPage: React.FC = () => {
  const [cipAssets, setCipAssets] = useState<FixedAsset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal / Form Kapitalisasi
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');
  const [docDate, setDocDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [inUseDate, setInUseDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const loadData = async () => {
    setLoading(true);
    try {
      const [assetsRes, catsRes, coaRes] = await Promise.all([
        api.getFixedAssets({ status: 'CIP' }),
        api.getAssetCategories(),
        api.getCoa(),
      ]);
      setCipAssets(Array.isArray(assetsRes) ? assetsRes : []);
      setCategories(Array.isArray(catsRes) ? catsRes : []);
      setAccounts(Array.isArray(coaRes) ? coaRes : []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal memuat data aset CIP' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCapitalizeModal = (asset: FixedAsset) => {
    setSelectedAsset(asset);
    setTargetCategoryId('');
    setDocDate(new Date().toISOString().slice(0, 10));
    setInUseDate(new Date().toISOString().slice(0, 10));
    setMsg(null);
  };

  const handleCapitalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !targetCategoryId) {
      setMsg({ type: 'error', text: 'Pilih kategori akhir aset tujuan.' });
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      await api.capitalizeCip(selectedAsset.id, {
        categoryId: targetCategoryId,
        tanggal: docDate,
        tanggalMulaiDigunakan: inUseDate,
      });
      setMsg({
        type: 'success',
        text: `Aset ${selectedAsset.noAset} berhasil dikapitalisasi ke kategori baru dan berstatus AKTIF.`,
      });
      setSelectedAsset(null);
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal melakukan kapitalisasi CIP.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAssets = cipAssets.filter((a) => {
    const q = searchQuery.toLowerCase();
    return (
      a.noAset.toLowerCase().includes(q) ||
      a.nama.toLowerCase().includes(q) ||
      (a.tagCode && a.tagCode.toLowerCase().includes(q))
    );
  });

  const targetCategory = categories.find((c) => c.id === targetCategoryId);
  const currentCategory = selectedAsset ? categories.find((c) => c.id === selectedAsset.categoryId) : null;
  const currentCipAccount = currentCategory ? accounts.find((acc) => acc.id === currentCategory.akunCipId) : null;
  const targetAssetAccount = targetCategory ? accounts.find((acc) => acc.id === targetCategory.akunAsetId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#142820] flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-700" />
            Kapitalisasi Aset Dalam Penyelesaian (CIP)
          </h2>
          <p className="text-xs text-[#556c5e] mt-1">
            Pindahkan akumulasi biaya proyek/konstruksi (CIP) menjadi Aset Tetap operasional aktif. Jurnal otomatis mendebit akun Aset Tetap dan mengkredit akun CIP.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#cbdcd0] hover:bg-[#edf2ea] text-[#142820] text-xs font-semibold rounded-xl shadow-sm transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-700' : ''}`} />
          Segarkan Data
        </button>
      </div>

      {/* Pesan Alert */}
      {msg && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-medium animate-in fade-in ${
            msg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-700" />
            )}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white border border-[#cbdcd0] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs font-semibold text-[#142820] flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold">
            {cipAssets.length} Aset CIP Menunggu Kapitalisasi
          </span>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari no. aset, nama, tag code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#cbdcd0] text-[#142820] placeholder:text-[#71887b] text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* Tabel Aset CIP */}
      <div className="bg-white border border-[#cbdcd0] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
            <span>Memuat data aset CIP...</span>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
            <p>Tidak ada aset dalam penyelesaian (CIP) saat ini.</p>
            <p className="text-[11px] text-slate-400">
              Aset CIP terbentuk saat faktur pembelian atau pengeluaran kas dicatat dengan opsi "Kapitalisasi ke CIP".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0] font-bold">
                <tr>
                  <th className="py-3 px-4">No. Aset</th>
                  <th className="py-3 px-4">Nama Proyek / Aset CIP</th>
                  <th className="py-3 px-4">Kategori CIP Awal</th>
                  <th className="py-3 px-4">Tanggal Mulai</th>
                  <th className="py-3 px-4 text-right">Akumulasi Biaya Perolehan</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2ea]">
                {filteredAssets.map((asset) => {
                  const cat = categories.find((c) => c.id === asset.categoryId);
                  return (
                    <tr key={asset.id} className="hover:bg-[#f7faf6] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#142820]">
                        {asset.noAset}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#142820]">
                        <div>{asset.nama}</div>
                        {asset.deskripsi && (
                          <div className="text-[11px] text-slate-500 font-normal">{asset.deskripsi}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {cat ? `${cat.kode} - ${cat.nama}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {new Date(asset.tanggalPerolehan).toLocaleDateString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#142820]">
                        {asset.hargaPerolehan.toLocaleString('id-ID', {
                          style: 'currency',
                          currency: 'IDR',
                        })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          {asset.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenCapitalizeModal(asset)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg text-xs shadow-sm transition-all"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Kapitalisasi Aset
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

      {/* Modal Dialog Kapitalisasi */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-[#cbdcd0] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-[#edf2ea] pb-3">
              <h3 className="text-base font-bold text-[#142820] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-700" />
                Kapitalisasi Aset CIP: {selectedAsset.noAset}
              </h3>
              <button
                onClick={() => setSelectedAsset(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCapitalize} className="space-y-4 text-xs">
              <div className="bg-[#f4f6f0] p-3.5 rounded-xl border border-[#cbdcd0] space-y-1">
                <div className="text-[11px] text-slate-500">Nama Aset CIP:</div>
                <div className="font-bold text-[#142820] text-sm">{selectedAsset.nama}</div>
                <div className="flex justify-between items-center pt-2 border-t border-[#cbdcd0]/60 text-xs">
                  <span className="text-slate-600">Total Akumulasi Biaya:</span>
                  <span className="font-mono font-bold text-[#142820]">
                    {selectedAsset.hargaPerolehan.toLocaleString('id-ID', {
                      style: 'currency',
                      currency: 'IDR',
                    })}
                  </span>
                </div>
              </div>

              {/* Pilihan Kategori Tujuan */}
              <div>
                <label className="block font-semibold text-[#142820] mb-1">
                  Kategori Aset Tetap Tujuan <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={targetCategoryId}
                  onChange={(e) => setTargetCategoryId(e.target.value)}
                  className="w-full bg-white border border-[#cbdcd0] text-[#142820] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="">-- Pilih Kategori Akhir --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.kode} - {c.nama} ({c.jenis} | Umur: {c.umurManfaatBulan} bln)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Menentukan akun aset tetap dan aturan penyusutan komersial/fiskal yang akan diterapkan setelah aktif.
                </p>
              </div>

              {/* Tanggal Dokumen & Tanggal Mulai Digunakan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#142820] mb-1">
                    Tanggal Kapitalisasi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    className="w-full bg-white border border-[#cbdcd0] text-[#142820] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#142820] mb-1">
                    Tanggal Mulai Digunakan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={inUseDate}
                    onChange={(e) => setInUseDate(e.target.value)}
                    className="w-full bg-white border border-[#cbdcd0] text-[#142820] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Pratinjau Jurnal GL */}
              {targetCategory && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-300 rounded-xl space-y-2">
                  <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    Pratinjau Jurnal Otomatis Kapitalisasi
                  </div>
                  <table className="w-full text-[11px] font-mono border-collapse">
                    <thead>
                      <tr className="text-slate-600 border-b border-emerald-200">
                        <th className="text-left py-1">Akun</th>
                        <th className="text-right py-1">Debit</th>
                        <th className="text-right py-1">Kredit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100">
                      <tr>
                        <td className="py-1 text-emerald-950 font-semibold">
                          Dr. {targetAssetAccount ? `${targetAssetAccount.kode_akun} - ${targetAssetAccount.nama_akun}` : 'Akun Aset Tetap'}
                        </td>
                        <td className="py-1 text-right font-bold text-emerald-900">
                          {selectedAsset.hargaPerolehan.toLocaleString('id-ID')}
                        </td>
                        <td className="py-1 text-right text-slate-400">-</td>
                      </tr>
                      <tr>
                        <td className="py-1 text-emerald-950 font-semibold pl-4">
                          Cr. {currentCipAccount ? `${currentCipAccount.kode_akun} - ${currentCipAccount.nama_akun}` : 'Akun CIP Proyek'}
                        </td>
                        <td className="py-1 text-right text-slate-400">-</td>
                        <td className="py-1 text-right font-bold text-emerald-900">
                          {selectedAsset.hargaPerolehan.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tombol Aksi */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#edf2ea]">
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !targetCategoryId}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {submitting ? 'Memproses...' : 'Posting Kapitalisasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
