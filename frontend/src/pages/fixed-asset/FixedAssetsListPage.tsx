import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  Clock,
  Layers,
  Copy,
  Calendar,
  DollarSign,
  Tag,
  Paperclip,
  Activity,
  ArrowRight,
  X,
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  Building,
  TrendingDown,
} from 'lucide-react';
import {
  api,
  FixedAsset,
  AssetCategory,
  FixedAssetStatus,
  AssetEvent,
  AssetAttachment,
  ChartOfAccount,
  AssetDepreciationSchedule,
} from '../../services/api';

interface Props {
  onNavigateToCapitalization?: () => void;
  onNavigateToOpeningBalance?: () => void;
  onNavigateToCategories?: () => void;
}

export const FixedAssetsListPage: React.FC<Props> = ({
  onNavigateToCapitalization,
  onNavigateToOpeningBalance,
  onNavigateToCategories,
}) => {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'RINGKASAN' | 'PENYUSUTAN' | 'LINIMASA' | 'LAMPIRAN' | 'LABEL'>('RINGKASAN');
  const [timeline, setTimeline] = useState<AssetEvent[]>([]);
  const [schedule, setSchedule] = useState<AssetDepreciationSchedule | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(false);

  // Subsequent Expenditure & Estimate Change Modals
  const [costAdditionModalOpen, setCostAdditionModalOpen] = useState(false);
  const [costAdditionForm, setCostAdditionForm] = useState<{
    tanggal: string;
    jumlah: number;
    akunLawanId: string;
    deskripsi: string;
  }>({
    tanggal: new Date().toISOString().slice(0, 10),
    jumlah: 0,
    akunLawanId: '',
    deskripsi: '',
  });

  const [estimateChangeModalOpen, setEstimateChangeModalOpen] = useState(false);
  const [estimateChangeForm, setEstimateChangeForm] = useState<{
    berlakuMulaiPeriode: string;
    sisaUmurBulan: number;
    residuBaru: number;
    metodeBaru: string;
    alasan: string;
  }>({
    berlakuMulaiPeriode: new Date().toISOString().slice(0, 7),
    sisaUmurBulan: 24,
    residuBaru: 0,
    metodeBaru: 'GARIS_LURUS',
    alasan: '',
  });

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    categoryId: string;
    nama: string;
    deskripsi: string;
    tagCode: string;
    tanggalPerolehan: string;
    tanggalMulaiDigunakan: string;
    hargaPerolehanAsli: number;
    nilaiResidu: number;
    umurManfaatBulan: number;
    isCip: boolean;
    akunLawanId: string;
  }>({
    categoryId: '',
    nama: '',
    deskripsi: '',
    tagCode: '',
    tanggalPerolehan: new Date().toISOString().slice(0, 10),
    tanggalMulaiDigunakan: new Date().toISOString().slice(0, 10),
    hargaPerolehanAsli: 0,
    nilaiResidu: 0,
    umurManfaatBulan: 48,
    isCip: false,
    akunLawanId: '',
  });

  // Activate Modal
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [activateTarget, setActivateTarget] = useState<FixedAsset | null>(null);
  const [activateDate, setActivateDate] = useState(new Date().toISOString().slice(0, 10));

  // Duplicate Modal
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<FixedAsset | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(2);

  // Upload Attachment State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assetList, catList, coaList] = await Promise.all([
        api.getFixedAssets(),
        api.getAssetCategories(),
        api.getCoa(),
      ]);
      setAssets(Array.isArray(assetList) ? assetList : []);
      setCategories(Array.isArray(catList) ? catList : []);
      setAccounts(Array.isArray(coaList) ? coaList : []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal memuat daftar aset tetap' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadSchedule = async (assetId: string) => {
    try {
      setLoadingSchedule(true);
      const res = await api.getAssetSchedule(assetId);
      setSchedule(res);
    } catch (err: any) {
      console.error('Gagal mengambil jadwal penyusutan:', err);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handleOpenDetail = async (asset: FixedAsset) => {
    try {
      const detailed = await api.getFixedAsset(asset.id);
      setSelectedAsset(detailed);
      setActiveDetailTab('RINGKASAN');
      setDetailModalOpen(true);
      const events = await api.getAssetTimeline(asset.id);
      setTimeline(Array.isArray(events) ? events : []);
      loadSchedule(asset.id);
    } catch (err: any) {
      alert('Gagal mengambil rincian aset: ' + (err.message || 'Error'));
    }
  };

  const handleSubmitCostAddition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      await api.addAssetCostAddition(selectedAsset.id, {
        tanggal: costAdditionForm.tanggal,
        jumlah: Number(costAdditionForm.jumlah),
        akunLawanId: costAdditionForm.akunLawanId,
        deskripsi: costAdditionForm.deskripsi,
      });
      alert('Penambahan nilai aset berhasil dikapitalisasi dan dijurnal ke GL.');
      setCostAdditionModalOpen(false);
      const refreshed = await api.getFixedAsset(selectedAsset.id);
      setSelectedAsset(refreshed);
      loadSchedule(selectedAsset.id);
      loadData();
    } catch (err: any) {
      alert('Gagal menambah nilai aset: ' + (err.message || 'Error'));
    }
  };

  const handleSubmitEstimateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      await api.recordAssetEstimateChange(selectedAsset.id, {
        berlakuMulaiPeriode: estimateChangeForm.berlakuMulaiPeriode,
        sisaUmurBulan: Number(estimateChangeForm.sisaUmurBulan),
        residuBaru: Number(estimateChangeForm.residuBaru),
        metodeBaru: estimateChangeForm.metodeBaru,
        alasan: estimateChangeForm.alasan,
      });
      alert('Perubahan estimasi akuntansi berhasil dicatat secara prospektif.');
      setEstimateChangeModalOpen(false);
      const refreshed = await api.getFixedAsset(selectedAsset.id);
      setSelectedAsset(refreshed);
      loadSchedule(selectedAsset.id);
      loadData();
    } catch (err: any) {
      alert('Gagal memperbarui estimasi aset: ' + (err.message || 'Error'));
    }
  };

  const handleOpenCreate = () => {
    setCreateForm({
      categoryId: categories[0]?.id || '',
      nama: '',
      deskripsi: '',
      tagCode: '',
      tanggalPerolehan: new Date().toISOString().slice(0, 10),
      tanggalMulaiDigunakan: new Date().toISOString().slice(0, 10),
      hargaPerolehanAsli: 0,
      nilaiResidu: 0,
      umurManfaatBulan: 48,
      isCip: false,
      akunLawanId: '',
    });
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.categoryId) {
      alert('Harap pilih kategori aset');
      return;
    }
    setLoading(true);
    try {
      await api.createFixedAsset({
        ...createForm,
        hargaPerolehanAsli: Number(createForm.hargaPerolehanAsli),
        nilaiResidu: Number(createForm.nilaiResidu),
        umurManfaatBulan: Number(createForm.umurManfaatBulan),
        akunLawanId: createForm.akunLawanId || undefined,
        tagCode: createForm.tagCode || undefined,
      });
      setMsg({ type: 'success', text: 'Kartu aset tetap berhasil didaftarkan.' });
      setCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal membuat kartu aset' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenActivate = (asset: FixedAsset) => {
    setActivateTarget(asset);
    setActivateDate(new Date().toISOString().slice(0, 10));
    setActivateModalOpen(true);
  };

  const handleConfirmActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activateTarget) return;
    setLoading(true);
    try {
      await api.activateFixedAsset(activateTarget.id, {
        tanggalMulaiDigunakan: activateDate,
      });
      setMsg({ type: 'success', text: `Aset ${activateTarget.noAset} berhasil diaktifkan.` });
      setActivateModalOpen(false);
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal mengaktifkan aset' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDuplicate = (asset: FixedAsset) => {
    setDuplicateTarget(asset);
    setDuplicateCount(2);
    setDuplicateModalOpen(true);
  };

  const handleConfirmDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTarget) return;
    setLoading(true);
    try {
      const res = await api.duplicateNAsset(duplicateTarget.id, Number(duplicateCount));
      setMsg({ type: 'success', text: res.message });
      setDuplicateModalOpen(false);
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal menduplikasi aset' });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAttachment = async () => {
    if (!uploadFile || !selectedAsset) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        await api.uploadAssetAttachment(selectedAsset.id, {
          namaFile: uploadFile.name,
          tipe: uploadFile.type,
          fileBase64: base64,
        });
        setUploadFile(null);
        // Refresh detail
        const updated = await api.getFixedAsset(selectedAsset.id);
        setSelectedAsset(updated);
      };
      reader.readAsDataURL(uploadFile);
    } catch (err: any) {
      alert('Gagal mengunggah lampiran: ' + (err.message || 'Error'));
    } finally {
      setUploading(false);
    }
  };

  const formatCurrency = (val: number | undefined | null) => {
    if (val === undefined || val === null) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Filter list
  const filteredAssets = assets.filter((item) => {
    if (selectedCategory !== 'ALL' && item.categoryId !== selectedCategory) return false;
    if (selectedStatus !== 'ALL' && item.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        item.nama.toLowerCase().includes(q) ||
        item.noAset.toLowerCase().includes(q) ||
        item.tagCode.toLowerCase().includes(q) ||
        (item.externalRef && item.externalRef.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Package className="w-7 h-7 text-emerald-700" />
            Daftar Aset Tetap
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Buku inventaris aset tetap perusahaan, penelusuran status CIP, perolehan, dan kartu aset terpadu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition-colors shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          {onNavigateToOpeningBalance && (
            <button
              type="button"
              onClick={onNavigateToOpeningBalance}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              <UploadCloud className="w-4 h-4 text-slate-600" />
              Saldo Awal Aset
            </button>
          )}

          {onNavigateToCapitalization && (
            <button
              type="button"
              onClick={onNavigateToCapitalization}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              <Building className="w-4 h-4 text-blue-600" />
              Kapitalisasi CIP
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Aset
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

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Pilih Kategori */}
          <div className="w-full md:w-56">
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Kategori</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="ALL">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kode} - {c.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Tabs */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Status</label>
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
              {['ALL', 'DRAFT', 'CIP', 'AKTIF', 'DISUSUTKAN_PENUH', 'DIJUAL', 'DIHAPUSKAN'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSelectedStatus(st)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    selectedStatus === st
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st === 'ALL'
                    ? 'Semua'
                    : st === 'DISUSUTKAN_PENUH'
                    ? 'Disusutkan Penuh'
                    : st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search Box */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari no. aset / nama / tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* Tabel Aset */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
              <tr>
                <th className="py-3 px-4 font-bold">No. Aset / Tag</th>
                <th className="py-3 px-4 font-bold">Nama & Deskripsi Aset</th>
                <th className="py-3 px-4 font-bold">Kategori</th>
                <th className="py-3 px-4 font-bold">Tgl Perolehan</th>
                <th className="py-3 px-4 text-right font-bold">Harga Perolehan</th>
                <th className="py-3 px-4 text-center font-bold">Status</th>
                <th className="py-3 px-4 text-center font-bold">Label</th>
                <th className="py-3 px-4 text-right font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Memuat data aset tetap...
                  </td>
                </tr>
              ) : filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Tidak ada aset yang cocok dengan filter yang dipilih.
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => {
                  const isDraft = asset.status === 'DRAFT';
                  const isCip = asset.status === 'CIP';
                  const isAktif = asset.status === 'AKTIF';
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{asset.noAset}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                          Tag: {asset.tagCode}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-bold text-slate-900">{asset.nama}</div>
                        <div className="text-[11px] text-slate-500 truncate">{asset.deskripsi || '-'}</div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {asset.category?.nama || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {new Date(asset.tanggalPerolehan).toLocaleDateString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(asset.hargaPerolehan)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isAktif
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isCip
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : isDraft
                              ? 'bg-slate-100 text-slate-700 border border-slate-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {asset.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                          {asset.statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(asset)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            title="Buka Kartu Aset"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Kartu
                          </button>

                          {isDraft && (
                            <button
                              type="button"
                              onClick={() => handleOpenActivate(asset)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold transition-colors"
                              title="Aktifkan Aset Ini"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aktivasi
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenDuplicate(asset)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Duplikasi Menjadi N Unit"
                          >
                            <Copy className="w-3.5 h-3.5" />
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

      {/* =========================================================================
          MODAL 1: KARTU DETAIL ASET (5 TABS)
          ========================================================================= */}
      {detailModalOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    {selectedAsset.nama}
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-300 font-mono">
                      {selectedAsset.noAset}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tag: <strong>{selectedAsset.tagCode}</strong> • Kategori:{' '}
                    <strong>{selectedAsset.category?.nama}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs Header */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveDetailTab('RINGKASAN')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeDetailTab === 'RINGKASAN'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100'
                }`}
              >
                1. Ringkasan & GL
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('PENYUSUTAN')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeDetailTab === 'PENYUSUTAN'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100'
                }`}
              >
                2. Buku Penyusutan (Modul 22)
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('LINIMASA')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeDetailTab === 'LINIMASA'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100'
                }`}
              >
                3. Riwayat / Linimasa ({timeline.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('LAMPIRAN')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeDetailTab === 'LAMPIRAN'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100'
                }`}
              >
                4. Lampiran File ({selectedAsset.attachments?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('LABEL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeDetailTab === 'LABEL'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100'
                }`}
              >
                5. Label & QR (Modul 24)
              </button>
            </div>

            {/* TAB 1: RINGKASAN */}
            {activeDetailTab === 'RINGKASAN' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Harga Perolehan</div>
                    <div className="font-mono font-bold text-slate-900 text-base mt-0.5">
                      {formatCurrency(selectedAsset.hargaPerolehan)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Nilai Residu</div>
                    <div className="font-mono font-bold text-slate-900 text-base mt-0.5">
                      {formatCurrency(selectedAsset.nilaiResidu)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Umur Manfaat</div>
                    <div className="font-mono font-bold text-slate-900 text-base mt-0.5">
                      {selectedAsset.umurManfaatBulan} Bulan ({selectedAsset.umurManfaatBulan / 12} Th)
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
                  <div className="font-bold text-slate-800 uppercase">Pemetaan Akun Buku Besar (GL)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                    <div>
                      Akun Aset: <strong>{selectedAsset.category?.akunAset?.kode_akun} - {selectedAsset.category?.akunAset?.nama_akun}</strong>
                    </div>
                    <div>
                      Akun Akumulasi: <strong>{selectedAsset.category?.akunAkumulasi?.kode_akun} - {selectedAsset.category?.akunAkumulasi?.nama_akun}</strong>
                    </div>
                    <div>
                      Akun CIP: <strong>{selectedAsset.category?.akunCip?.kode_akun} - {selectedAsset.category?.akunCip?.nama_akun}</strong>
                    </div>
                    <div>
                      Akun Beban: <strong>{selectedAsset.category?.akunBeban?.kode_akun} - {selectedAsset.category?.akunBeban?.nama_akun}</strong>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Tgl Perolehan</span>
                    <span className="font-semibold text-slate-900">
                      {new Date(selectedAsset.tanggalPerolehan).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Mulai Digunakan</span>
                    <span className="font-semibold text-slate-900">
                      {selectedAsset.tanggalMulaiDigunakan
                        ? new Date(selectedAsset.tanggalMulaiDigunakan).toLocaleDateString('id-ID')
                        : 'Belum Aktif (CIP/DRAFT)'}
                    </span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Metode Komersial</span>
                    <span className="font-semibold text-slate-900">{selectedAsset.metodeKomersial}</span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">Metode Fiskal</span>
                    <span className="font-semibold text-slate-900">{selectedAsset.metodeFiskal}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PENYUSUTAN (MODUL 22) */}
            {activeDetailTab === 'PENYUSUTAN' && (
              <div className="space-y-4">
                {/* Header Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-emerald-700" />
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        Buku Penyusutan Komersial & Fiskal (PMK 72/2023)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Buku Komersial dijurnal ke GL • Buku Fiskal paralel tanpa jurnal GL
                      </div>
                    </div>
                  </div>

                  {(selectedAsset.status === 'AKTIF' || selectedAsset.status === 'DISUSUTKAN_PENUH') && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCostAdditionForm({
                            tanggal: new Date().toISOString().slice(0, 10),
                            jumlah: 0,
                            akunLawanId: accounts[0]?.id || '',
                            deskripsi: '',
                          });
                          setCostAdditionModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        + Penambahan Nilai
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEstimateChangeForm({
                            berlakuMulaiPeriode: new Date().toISOString().slice(0, 7),
                            sisaUmurBulan: selectedAsset.umurManfaatBulan,
                            residuBaru: Number(selectedAsset.nilaiResidu || 0),
                            metodeBaru: selectedAsset.metodeKomersial,
                            alasan: '',
                          });
                          setEstimateChangeModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Perubahan Estimasi
                      </button>
                    </div>
                  )}
                </div>

                {/* Metrics Comparison */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl">
                    <div className="text-[10px] text-emerald-800 uppercase font-bold">Nilai Tercatat Komersial</div>
                    <div className="font-mono font-bold text-emerald-900 text-sm mt-0.5">
                      Rp {Number((selectedAsset as any).nilaiTercatat || 0).toLocaleString('id-ID')}
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">
                      Akumulasi: Rp {Number((selectedAsset as any).akumulasiKomersial || 0).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl">
                    <div className="text-[10px] text-blue-800 uppercase font-bold">Sisa Buku Fiskal</div>
                    <div className="font-mono font-bold text-blue-900 text-sm mt-0.5">
                      Rp {Number((selectedAsset as any).nilaiSisaBukuFiskal || 0).toLocaleString('id-ID')}
                    </div>
                    <div className="text-[10px] text-blue-700 mt-0.5">
                      Akumulasi: Rp {Number((selectedAsset as any).akumulasiFiskal || 0).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Metode Komersial</div>
                    <div className="font-bold text-slate-800 text-xs mt-0.5">{selectedAsset.metodeKomersial}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Masa Manfaat: {selectedAsset.umurManfaatBulan} bln
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Metode & Kelompok Fiskal</div>
                    <div className="font-bold text-slate-800 text-xs mt-0.5">{selectedAsset.metodeFiskal}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {selectedAsset.fiscalGroup?.nama || 'Kelompok Fiskal Standar'}
                    </div>
                  </div>
                </div>

                {/* Comparative Schedule Table */}
                {loadingSchedule ? (
                  <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    Menghitung jadwal proyeksi penyusutan komersial & fiskal...
                  </div>
                ) : !schedule || schedule.komersial.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
                    Aset ini tidak dapat disusutkan (mis. Tanah) atau belum memiliki jadwal penyusutan.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Bulan / Periode</th>
                          <th className="py-2 px-3 text-right">Beban Komersial</th>
                          <th className="py-2 px-3 text-right">Buku Komersial</th>
                          <th className="py-2 px-3 text-right">Beban Fiskal</th>
                          <th className="py-2 px-3 text-right">Buku Fiskal</th>
                          <th className="py-2 px-3 text-center">Status</th>
                          <th className="py-2 px-3">Catatan Audit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {schedule.komersial.map((kItem, idx) => {
                          const fItem = schedule.fiskal[idx] || null;
                          return (
                            <tr key={idx} className="hover:bg-slate-50 font-mono">
                              <td className="py-2 px-3 font-sans font-medium text-slate-900">
                                {kItem.periodeStr} <span className="text-[10px] text-slate-400">({idx + 1})</span>
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-emerald-800">
                                Rp {Number(kItem.beban || 0).toLocaleString('id-ID')}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-700">
                                Rp {Number(kItem.nilaiTercatat || 0).toLocaleString('id-ID')}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-blue-800">
                                {fItem ? `Rp ${Number(fItem.beban || 0).toLocaleString('id-ID')}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-700">
                                {fItem ? `Rp ${Number(fItem.nilaiTercatat || 0).toLocaleString('id-ID')}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-center font-sans">
                                {kItem.isPosted ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    POSTED ({kItem.runNoDokumen || 'GL'})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                    PROYEKSI
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-[10px] font-sans text-slate-500">
                                {kItem.keterangan}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: LINIMASA AUDIT */}
            {activeDetailTab === 'LINIMASA' && (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {timeline.length === 0 ? (
                  <p className="text-center py-8 text-xs text-slate-500">Belum ada linimasa transaksi untuk aset ini.</p>
                ) : (
                  timeline.map((ev) => (
                    <div key={ev.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-emerald-700" />
                          {ev.tipe}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(ev.tanggal).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <div className="text-slate-600 font-mono text-[11px] bg-white p-2 rounded border border-slate-200">
                        {JSON.stringify(ev.data)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 4: LAMPIRAN FILE */}
            {activeDetailTab === 'LAMPIRAN' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                    className="text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 hover:file:bg-slate-200"
                  />
                  <button
                    type="button"
                    disabled={!uploadFile || uploading}
                    onClick={handleUploadAttachment}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {uploading ? 'Mengunggah...' : 'Unggah File'}
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-800">
                    <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Nama File</th>
                        <th className="py-2.5 px-3">Tipe</th>
                        <th className="py-2.5 px-3">Ukuran</th>
                        <th className="py-2.5 px-3">Tanggal Unggah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(!selectedAsset.attachments || selectedAsset.attachments.length === 0) ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400">
                            Belum ada dokumen atau foto aset yang dilampirkan.
                          </td>
                        </tr>
                      ) : (
                        selectedAsset.attachments.map((att) => (
                          <tr key={att.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-semibold text-slate-900 flex items-center gap-1.5">
                              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                              {att.namaFile}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{att.tipe}</td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono">
                              {(att.ukuran / 1024).toFixed(1)} KB
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">
                              {new Date(att.createdAt).toLocaleDateString('id-ID')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: LABEL & QR */}
            {activeDetailTab === 'LABEL' && (
              <div className="p-6 text-center space-y-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <Tag className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">Pencetakan Label QR & Barcode Code 128</h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Fitur pencetakan label stiker aset fisik dengan QR Code / Code 128 dan audit inventaris lapangan
                  akan diimplementasikan pada <strong>Modul 24 (Labeling & Audit Fisik Aset)</strong>.
                </p>
                <div className="inline-block p-3 bg-white border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-800">
                  Tag Code: {selectedAsset.tagCode}
                </div>
              </div>
            )}

            {/* Footer Modal */}
            <div className="flex items-center justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: FORM TAMBAH ASET MANUAL
          ========================================================================= */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Daftarkan Aset Tetap Baru</h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Kategori Aset <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={createForm.categoryId}
                  onChange={(e) => setCreateForm({ ...createForm, categoryId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.kode} - {c.nama} ({c.umurManfaatBulan / 12} Th)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nama Aset <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.nama}
                    onChange={(e) => setCreateForm({ ...createForm, nama: e.target.value })}
                    placeholder="Mis. Server Dell PowerEdge R740"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Kode Label / Tag (Opsional)
                  </label>
                  <input
                    type="text"
                    value={createForm.tagCode}
                    onChange={(e) => setCreateForm({ ...createForm, tagCode: e.target.value })}
                    placeholder="Kosongkan untuk otomatis ikuti No. Aset"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Deskripsi & Spesifikasi</label>
                <textarea
                  rows={2}
                  value={createForm.deskripsi}
                  onChange={(e) => setCreateForm({ ...createForm, deskripsi: e.target.value })}
                  placeholder="Mis. RAM 64GB, Storage 2TB SSD, Lokasi Ruang Server Lt. 2..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tgl Perolehan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={createForm.tanggalPerolehan}
                    onChange={(e) => setCreateForm({ ...createForm, tanggalPerolehan: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Harga Perolehan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={createForm.hargaPerolehanAsli}
                    onChange={(e) => setCreateForm({ ...createForm, hargaPerolehanAsli: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nilai Residu</label>
                  <input
                    type="number"
                    min={0}
                    value={createForm.nilaiResidu}
                    onChange={(e) => setCreateForm({ ...createForm, nilaiResidu: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isCip"
                  checked={createForm.isCip}
                  onChange={(e) => setCreateForm({ ...createForm, isCip: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <label htmlFor="isCip" className="text-xs font-bold text-slate-800 cursor-pointer">
                  Aset Dalam Penyelesaian / Konstruksi (CIP)
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Akun Lawan GL (Opsional - untuk penjurnalan otomatis Dr Aset / Cr Akun Lawan)
                </label>
                <select
                  value={createForm.akunLawanId}
                  onChange={(e) => setCreateForm({ ...createForm, akunLawanId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-semibold"
                >
                  <option value="">-- Tanpa Jurnal GL Tambahan --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.kode_akun} - {a.nama_akun} ({a.kategori})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Daftarkan Aset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: AKTIVASI ASET
          ========================================================================= */}
      {activateModalOpen && activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Aktivasi Aset Tetap</h3>
            <p className="text-xs text-slate-600">
              Aset: <strong>{activateTarget.noAset} - {activateTarget.nama}</strong>. Mengaktifkan aset akan
              mengubah status dari DRAFT menjadi AKTIF sehingga aset siap masuk dalam siklus penyusutan.
            </p>

            <form onSubmit={handleConfirmActivate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tanggal Mulai Digunakan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={activateDate}
                  onChange={(e) => setActivateDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-semibold"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActivateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold"
                >
                  Konfirmasi Aktivasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: DUPLIKASI MENJADI N UNIT
          ========================================================================= */}
      {duplicateModalOpen && duplicateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Duplikasi Aset Menjadi N Unit</h3>
            <p className="text-xs text-slate-600">
              Aset sumber: <strong>{duplicateTarget.noAset} - {duplicateTarget.nama}</strong>. Setiap unit baru akan
              mendapatkan nomor aset dan kode tag unik secara otomatis.
            </p>

            <form onSubmit={handleConfirmDuplicate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Jumlah Unit Tambahan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={50}
                  value={duplicateCount}
                  onChange={(e) => setDuplicateCount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-2.5 font-mono font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDuplicateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold"
                >
                  Proses Duplikasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 5: PENAMBAHAN NILAI (SUBSEQUENT EXPENDITURE / COST ADDITION)
          ========================================================================= */}
      {costAdditionModalOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-700" />
                Kapitalisasi Penambahan Nilai
              </h3>
              <button
                type="button"
                onClick={() => setCostAdditionModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Pengeluaran lanjutan (upgrade/renovasi) untuk aset <strong>{selectedAsset.noAset} ({selectedAsset.nama})</strong> akan dikapitalisasi ke akun harga perolehan dan otomatis dijurnal ke GL.
            </p>

            <form onSubmit={handleSubmitCostAddition} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Tanggal Pengeluaran <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={costAdditionForm.tanggal}
                  onChange={(e) => setCostAdditionForm({ ...costAdditionForm, tanggal: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Nominal Tambahan (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  step={0.01}
                  value={costAdditionForm.jumlah || ''}
                  onChange={(e) => setCostAdditionForm({ ...costAdditionForm, jumlah: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-mono font-bold"
                  placeholder="Contoh: 5000000"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Akun Sumber Dana (Kas/Bank/Utang) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={costAdditionForm.akunLawanId}
                  onChange={(e) => setCostAdditionForm({ ...costAdditionForm, akunLawanId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-semibold"
                >
                  <option value="">-- Pilih Akun Sumber Dana --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.kode_akun} - {acc.nama_akun} ({acc.kategori})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Deskripsi / Keterangan Pengeluaran
                </label>
                <input
                  type="text"
                  value={costAdditionForm.deskripsi}
                  onChange={(e) => setCostAdditionForm({ ...costAdditionForm, deskripsi: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-medium"
                  placeholder="Contoh: Upgrade RAM dan SSD NVMe 2TB"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCostAdditionModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold shadow-sm"
                >
                  Simpan & Jurnal GL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 6: PERUBAHAN ESTIMASI AKUNTANSI (ESTIMATE CHANGE)
          ========================================================================= */}
      {estimateChangeModalOpen && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-700" />
                Perubahan Estimasi Akuntansi
              </h3>
              <button
                type="button"
                onClick={() => setEstimateChangeModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Penyesuaian estimasi akuntansi (masa manfaat, residu, metode) diterapkan secara <strong>prospektif</strong> tanpa mengubah penyusutan periode lampau.
            </p>

            <form onSubmit={handleSubmitEstimateChange} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Berlaku Mulai Periode (YYYY-MM) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="2026-07"
                  pattern="^\d{4}-\d{2}$"
                  value={estimateChangeForm.berlakuMulaiPeriode}
                  onChange={(e) => setEstimateChangeForm({ ...estimateChangeForm, berlakuMulaiPeriode: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Sisa Masa Manfaat Baru (Bulan)
                </label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={estimateChangeForm.sisaUmurBulan}
                  onChange={(e) => setEstimateChangeForm({ ...estimateChangeForm, sisaUmurBulan: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Nilai Residu Baru (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={estimateChangeForm.residuBaru}
                  onChange={(e) => setEstimateChangeForm({ ...estimateChangeForm, residuBaru: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Metode Penyusutan Komersial
                </label>
                <select
                  value={estimateChangeForm.metodeBaru}
                  onChange={(e) => setEstimateChangeForm({ ...estimateChangeForm, metodeBaru: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-semibold"
                >
                  <option value="GARIS_LURUS">GARIS_LURUS (Straight Line)</option>
                  <option value="SALDO_MENURUN">SALDO_MENURUN (Declining Balance)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Alasan Perubahan Estimasi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={estimateChangeForm.alasan}
                  onChange={(e) => setEstimateChangeForm({ ...estimateChangeForm, alasan: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-medium"
                  placeholder="Contoh: Penilaian ulang kondisi teknis mesin oleh konsultan independen"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEstimateChangeModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold shadow-sm"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FixedAssetsListPage;
