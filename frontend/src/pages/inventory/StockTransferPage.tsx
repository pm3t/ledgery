import React, { useState, useEffect } from 'react';
import {
  ArrowLeftRight,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Eye,
  FileText,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import {
  api,
  Tenant,
  Warehouse,
  Item,
  StockTransfer,
  StockTransferLine,
} from '../../services/api';

interface StockTransferPageProps {
  currentTenant: Tenant | null;
}

export const StockTransferPage: React.FC<StockTransferPageProps> = ({ currentTenant }) => {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockItems, setStockItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [detailTransfer, setDetailTransfer] = useState<StockTransfer | null>(null);
  const [voidModalTransfer, setVoidModalTransfer] = useState<StockTransfer | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    fromWarehouseId: '',
    toWarehouseId: '',
    catatan: '',
    lines: [{ itemId: '', qty: 1, biayaSatuan: 0 }],
  });

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [trData, whData, itemData] = await Promise.all([
        api.getTransfers(currentTenant.id, {
          status: filterStatus || undefined,
        }),
        api.getWarehouses(currentTenant.id, true),
        api.getItems(currentTenant.id, { tipe: 'STOK', isActive: true }),
      ]);
      setTransfers(Array.isArray(trData) ? trData : []);
      setWarehouses(Array.isArray(whData) ? whData : []);
      setStockItems(Array.isArray(itemData) ? itemData : []);
    } catch (err: any) {
      console.error('Failed to fetch transfers data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant, filterStatus]);

  const handleOpenCreateModal = () => {
    const fromWh = warehouses.length > 0 ? warehouses[0].id : '';
    const toWh = warehouses.length > 1 ? warehouses[1].id : '';
    setFormData({
      tanggal: new Date().toISOString().split('T')[0],
      fromWarehouseId: fromWh,
      toWarehouseId: toWh,
      catatan: '',
      lines: [{ itemId: stockItems.length > 0 ? stockItems[0].id : '', qty: 1, biayaSatuan: 0 }],
    });
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleAddLine = () => {
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        { itemId: stockItems.length > 0 ? stockItems[0].id : '', qty: 1, biayaSatuan: 0 },
      ],
    });
  };

  const handleRemoveLine = (idx: number) => {
    if (formData.lines.length <= 1) return;
    const newLines = [...formData.lines];
    newLines.splice(idx, 1);
    setFormData({ ...formData, lines: newLines });
  };

  const handleLineChange = (idx: number, field: string, value: any) => {
    const newLines = [...formData.lines];
    newLines[idx] = { ...newLines[idx], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  const calculateFormTotal = () => {
    return formData.lines.reduce((sum, line) => {
      const lineTotal = (Number(line.qty) || 0) * (Number(line.biayaSatuan) || 0);
      return sum + lineTotal;
    }, 0);
  };

  const handleCreateSubmit = async (e: React.FormEvent, andPost: boolean = false) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!formData.fromWarehouseId) {
      setFormError('Pilih gudang asal');
      return;
    }
    if (!formData.toWarehouseId) {
      setFormError('Pilih gudang tujuan');
      return;
    }
    if (formData.fromWarehouseId === formData.toWarehouseId) {
      setFormError('Gudang tujuan tidak boleh sama dengan gudang asal');
      return;
    }
    if (formData.lines.length === 0) {
      setFormError('Minimal harus ada 1 baris barang yang ditransfer');
      return;
    }
    for (let i = 0; i < formData.lines.length; i++) {
      const l = formData.lines[i];
      if (!l.itemId) {
        setFormError(`Baris #${i + 1}: Pilih barang`);
        return;
      }
      if (Number(l.qty) <= 0) {
        setFormError(`Baris #${i + 1}: Kuantitas transfer harus > 0`);
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        tanggal: formData.tanggal,
        fromWarehouseId: formData.fromWarehouseId,
        toWarehouseId: formData.toWarehouseId,
        catatan: formData.catatan || null,
        lines: formData.lines.map((l) => ({
          itemId: l.itemId,
          qty: Number(l.qty),
          biayaSatuan: Number(l.biayaSatuan) || undefined,
        })),
      };

      const created = await api.createTransfer(currentTenant.id, payload);

      if (andPost && created && created.id) {
        await api.postTransfer(currentTenant.id, created.id);
      }

      setIsCreateModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan transfer stok');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostTransfer = async (tr: StockTransfer) => {
    if (!currentTenant) return;
    if (!window.confirm(`Yakin ingin memposting transfer stok ${tr.noDokumen}? Stok gudang asal akan dikurangi dan gudang tujuan akan ditambah.`)) {
      return;
    }
    setLoading(true);
    try {
      await api.postTransfer(currentTenant.id, tr.id);
      fetchData();
    } catch (err: any) {
      alert(`Gagal posting: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenVoidModal = (tr: StockTransfer) => {
    setVoidModalTransfer(tr);
    setVoidReason('');
  };

  const handleConfirmVoid = async () => {
    if (!currentTenant || !voidModalTransfer) return;
    setSubmitting(true);
    try {
      await api.voidTransfer(currentTenant.id, voidModalTransfer.id, voidReason);
      setVoidModalTransfer(null);
      fetchData();
    } catch (err: any) {
      alert(`Gagal membatalkan (void): ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTransfers = transfers.filter((t) => {
    const q = searchQuery.toLowerCase();
    const docMatch = t.noDokumen.toLowerCase().includes(q);
    const fromMatch = t.fromWarehouse?.nama.toLowerCase().includes(q) || t.fromWarehouse?.kode.toLowerCase().includes(q);
    const toMatch = t.toWarehouse?.nama.toLowerCase().includes(q) || t.toWarehouse?.kode.toLowerCase().includes(q);
    return docMatch || fromMatch || toMatch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            DRAFT
          </span>
        );
      case 'POSTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> DIPOSTING
          </span>
        );
      case 'VOID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" /> DIBATALKAN
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowLeftRight className="w-7 h-7 text-indigo-600" />
            Transfer Antar Gudang
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Pindahkan stok antar gudang tanpa mengubah total nilai aset konsolidasi. Untuk metode FIFO,
            lapisan biaya asal dibawa secara otomatis ke gudang tujuan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Transfer Baru
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari no dokumen, gudang asal, gudang tujuan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Semua Status</option>
            <option value="DRAFT">DRAFT</option>
            <option value="POSTED">DIPOSTING</option>
            <option value="VOID">DIBATALKAN</option>
          </select>
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  No Dokumen
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tanggal
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Gudang Asal
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Gudang Tujuan
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total Nilai
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500 text-sm">
                    Memuat data transfer...
                  </td>
                </tr>
              ) : filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500 text-sm">
                    Belum ada dokumen transfer stok.
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setDetailTransfer(t)}
                        className="font-medium text-indigo-600 hover:text-indigo-900 hover:underline flex items-center gap-1.5"
                      >
                        <FileText className="w-4 h-4 text-gray-400" />
                        {t.noDokumen}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(t.tanggal).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {t.fromWarehouse ? `${t.fromWarehouse.kode} - ${t.fromWarehouse.nama}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {t.toWarehouse ? `${t.toWarehouse.kode} - ${t.toWarehouse.nama}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                      Rp {Number(t.totalNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(t.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => setDetailTransfer(t)}
                        className="text-gray-600 hover:text-gray-900 p-1"
                        title="Lihat Detail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {t.status === 'DRAFT' && (
                        <button
                          onClick={() => handlePostTransfer(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Posting
                        </button>
                      )}
                      {t.status === 'POSTED' && (
                        <button
                          onClick={() => handleOpenVoidModal(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded text-xs hover:bg-rose-100"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detail */}
      {detailTransfer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
                  Detail Transfer: {detailTransfer.noDokumen}
                </h2>
                <div className="flex items-center gap-3 mt-1.5">
                  {getStatusBadge(detailTransfer.status)}
                  <span className="text-xs text-gray-500">
                    Tanggal: {new Date(detailTransfer.tanggal).toLocaleDateString('id-ID')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDetailTransfer(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg text-sm">
                <div>
                  <span className="text-gray-500 block text-xs">Gudang Asal</span>
                  <span className="font-semibold text-gray-900">
                    {detailTransfer.fromWarehouse?.nama} ({detailTransfer.fromWarehouse?.kode})
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Gudang Tujuan</span>
                  <span className="font-semibold text-gray-900">
                    {detailTransfer.toWarehouse?.nama} ({detailTransfer.toWarehouse?.kode})
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Total Nilai Transfer</span>
                  <span className="font-bold text-indigo-600">
                    Rp {Number(detailTransfer.totalNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {detailTransfer.journalId && (
                  <div>
                    <span className="text-gray-500 block text-xs">ID Jurnal GL</span>
                    <span className="font-mono text-xs text-gray-700">{detailTransfer.journalId}</span>
                  </div>
                )}
                {detailTransfer.catatan && (
                  <div className="col-span-2 sm:col-span-3">
                    <span className="text-gray-500 block text-xs">Catatan</span>
                    <span className="text-gray-800">{detailTransfer.catatan}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 text-sm mb-3">Daftar Barang yang Ditransfer</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barang</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Biaya Satuan</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {detailTransfer.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-gray-900">{l.item?.nama || '-'}</div>
                            <div className="text-xs text-gray-500 font-mono">{l.item?.kode}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                            {Number(l.qty).toLocaleString('id-ID')} {l.item?.satuan}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700">
                            Rp {Number(l.biayaSatuan).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                            Rp {Number(l.totalNilai).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setDetailTransfer(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Create */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
                  Buat Transfer Antar Gudang
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Pindahkan barang dari gudang asal ke gudang tujuan.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="p-6 space-y-6">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Tanggal Transfer *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Gudang Asal *
                  </label>
                  <select
                    required
                    value={formData.fromWarehouseId}
                    onChange={(e) => setFormData({ ...formData, fromWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Pilih Gudang Asal --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.kode} - {w.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Gudang Tujuan *
                  </label>
                  <select
                    required
                    value={formData.toWarehouseId}
                    onChange={(e) => setFormData({ ...formData, toWarehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Pilih Gudang Tujuan --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.kode} - {w.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Catatan / Alasan Transfer
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Pemenuhan stok cabang / relokasi gudang utama"
                    value={formData.catatan}
                    onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Dynamic Lines Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Daftar Barang Transfer
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/2">
                          Barang (Stok)
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                          Kuantitas *
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-40">
                          Estimasi Biaya Satuan
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-40">
                          Subtotal
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-12">
                          #
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {formData.lines.map((line, idx) => {
                        const lineSubtotal = (Number(line.qty) || 0) * (Number(line.biayaSatuan) || 0);
                        return (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <select
                                required
                                value={line.itemId}
                                onChange={(e) => handleLineChange(idx, 'itemId', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value="">-- Pilih Barang --</option>
                                {stockItems.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.kode} - {item.nama} ({item.satuan}) [{item.valuationMethod}]
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0.0001"
                                step="any"
                                required
                                value={line.qty}
                                onChange={(e) => handleLineChange(idx, 'qty', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="Auto / Riwayat"
                                value={line.biayaSatuan || ''}
                                onChange={(e) => handleLineChange(idx, 'biayaSatuan', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800 text-xs">
                              Rp {lineSubtotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                disabled={formData.lines.length <= 1}
                                onClick={() => handleRemoveLine(idx)}
                                className="text-gray-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-gray-400 p-1"
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

                <div className="mt-3 flex justify-end items-center gap-4 text-sm bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <span className="font-medium text-gray-600">Estimasi Total Nilai Transfer:</span>
                  <span className="text-base font-bold text-indigo-600">
                    Rp {calculateFormTotal().toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={(e) => handleCreateSubmit(e, false)}
                  className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan DRAFT'}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={(e) => handleCreateSubmit(e, true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Simpan & Posting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Void */}
      {voidModalTransfer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Batalkan Transfer (Void)</h3>
            <p className="text-sm text-gray-600 mb-4">
              Anda akan membatalkan transfer stok{' '}
              <span className="font-semibold">{voidModalTransfer.noDokumen}</span>. Stok akan dikembalikan ke gudang asal dan jurnal pembalik akan dibuat jika ada.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Alasan Pembatalan
              </label>
              <textarea
                rows={3}
                placeholder="Contoh: Salah kirim gudang"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setVoidModalTransfer(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmVoid}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
              >
                {submitting ? 'Memproses...' : 'Ya, Batalkan Dokumen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

