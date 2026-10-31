import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
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
  RefreshCw,
} from 'lucide-react';
import {
  api,
  Tenant,
  Warehouse,
  Item,
  StockAdjustment,
  StockAdjustmentLine,
} from '../../services/api';

interface StockAdjustmentPageProps {
  currentTenant: Tenant | null;
}

export const StockAdjustmentPage: React.FC<StockAdjustmentPageProps> = ({ currentTenant }) => {
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockItems, setStockItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterWarehouse, setFilterWarehouse] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [detailAdj, setDetailAdj] = useState<StockAdjustment | null>(null);
  const [voidModalAdj, setVoidModalAdj] = useState<StockAdjustment | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    warehouseId: '',
    catatan: '',
    lines: [
      { itemId: '', qtySistem: 0, qtyFisik: 0, selisihQty: 0, biayaSatuan: 0, selisihNilai: 0, catatan: '' },
    ],
  });

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [adjData, whData, itemData] = await Promise.all([
        api.getAdjustments(currentTenant.id, {
          warehouseId: filterWarehouse || undefined,
          status: filterStatus || undefined,
        }),
        api.getWarehouses(currentTenant.id, true),
        api.getItems(currentTenant.id, { tipe: 'STOK', isActive: true }),
      ]);
      setAdjustments(Array.isArray(adjData) ? adjData : []);
      setWarehouses(Array.isArray(whData) ? whData : []);
      setStockItems(Array.isArray(itemData) ? itemData : []);
    } catch (err: any) {
      console.error('Failed to fetch stock adjustments data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant, filterWarehouse, filterStatus]);

  const handleOpenCreateModal = () => {
    const defaultWh = warehouses.length > 0 ? warehouses[0].id : '';
    setFormData({
      tanggal: new Date().toISOString().split('T')[0],
      warehouseId: defaultWh,
      catatan: '',
      lines: [
        {
          itemId: stockItems.length > 0 ? stockItems[0].id : '',
          qtySistem: 0,
          qtyFisik: 0,
          selisihQty: 0,
          biayaSatuan: 0,
          selisihNilai: 0,
          catatan: '',
        },
      ],
    });
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  // Populate all current stock items for the selected warehouse
  const handleLoadWarehouseStock = async () => {
    if (!currentTenant || !formData.warehouseId) {
      setFormError('Pilih gudang terlebih dahulu');
      return;
    }
    setLoadingStock(true);
    try {
      const stockList = await api.getCurrentStockReport(currentTenant.id, {
        warehouseId: formData.warehouseId,
      });

      if (Array.isArray(stockList) && stockList.length > 0) {
        const loadedLines = stockList.map((s: any) => {
          const qtySistem = Number(s.qty || 0);
          const biayaSatuan = Number(s.biayaRataRata || 0);
          return {
            itemId: s.itemId,
            qtySistem,
            qtyFisik: qtySistem, // default matches system until user edits
            selisihQty: 0,
            biayaSatuan,
            selisihNilai: 0,
            catatan: '',
          };
        });
        setFormData({ ...formData, lines: loadedLines });
      } else {
        alert('Tidak ada saldo stok aktif di gudang ini.');
      }
    } catch (err: any) {
      console.error('Failed to load current warehouse stock', err);
      alert('Gagal memuat saldo stok gudang.');
    } finally {
      setLoadingStock(false);
    }
  };

  const handleAddLine = () => {
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        {
          itemId: stockItems.length > 0 ? stockItems[0].id : '',
          qtySistem: 0,
          qtyFisik: 0,
          selisihQty: 0,
          biayaSatuan: 0,
          selisihNilai: 0,
          catatan: '',
        },
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
    const current = { ...newLines[idx], [field]: value };

    if (field === 'qtyFisik' || field === 'qtySistem' || field === 'biayaSatuan') {
      const sys = Number(field === 'qtySistem' ? value : current.qtySistem) || 0;
      const fis = Number(field === 'qtyFisik' ? value : current.qtyFisik) || 0;
      const cost = Number(field === 'biayaSatuan' ? value : current.biayaSatuan) || 0;
      const diffQty = fis - sys;
      current.selisihQty = diffQty;
      current.selisihNilai = diffQty * cost;
    }

    newLines[idx] = current;
    setFormData({ ...formData, lines: newLines });
  };

  const calculateTotalSelisihNilai = () => {
    return formData.lines.reduce((sum, l) => sum + (Number(l.selisihNilai) || 0), 0);
  };

  const handleCreateSubmit = async (e: React.FormEvent, andPost: boolean = false) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!formData.warehouseId) {
      setFormError('Pilih gudang');
      return;
    }
    if (formData.lines.length === 0) {
      setFormError('Minimal harus ada 1 baris barang');
      return;
    }
    for (let i = 0; i < formData.lines.length; i++) {
      const l = formData.lines[i];
      if (!l.itemId) {
        setFormError(`Baris #${i + 1}: Pilih barang`);
        return;
      }
      if (Number(l.qtyFisik) < 0) {
        setFormError(`Baris #${i + 1}: Qty fisik tidak boleh negatif`);
        return;
      }
      if (Number(l.selisihQty) > 0 && Number(l.biayaSatuan) <= 0) {
        setFormError(`Baris #${i + 1}: Selisih lebih membutuhkan biaya satuan > 0`);
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        tanggal: formData.tanggal,
        warehouseId: formData.warehouseId,
        catatan: formData.catatan || null,
        lines: formData.lines.map((l) => ({
          itemId: l.itemId,
          qtySistem: Number(l.qtySistem),
          qtyFisik: Number(l.qtyFisik),
          biayaSatuan: Number(l.biayaSatuan),
          catatan: l.catatan || null,
        })),
      };

      const created = await api.createAdjustment(currentTenant.id, payload);

      if (andPost && created && created.id) {
        await api.postAdjustment(currentTenant.id, created.id);
      }

      setIsCreateModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan penyesuaian stok');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostAdjustment = async (adj: StockAdjustment) => {
    if (!currentTenant) return;
    if (
      !window.confirm(
        `Yakin ingin memposting penyesuaian stok ${adj.noDokumen}? Jurnal penyesuaian persediaan akan dibuat.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await api.postAdjustment(currentTenant.id, adj.id);
      fetchData();
    } catch (err: any) {
      alert(`Gagal posting: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenVoidModal = (adj: StockAdjustment) => {
    setVoidModalAdj(adj);
    setVoidReason('');
  };

  const handleConfirmVoid = async () => {
    if (!currentTenant || !voidModalAdj) return;
    setSubmitting(true);
    try {
      await api.voidAdjustment(currentTenant.id, voidModalAdj.id, voidReason);
      setVoidModalAdj(null);
      fetchData();
    } catch (err: any) {
      alert(`Gagal membatalkan (void): ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAdjustments = adjustments.filter((a) => {
    const q = searchQuery.toLowerCase();
    const docMatch = a.noDokumen.toLowerCase().includes(q);
    const whMatch = a.warehouse?.nama.toLowerCase().includes(q) || a.warehouse?.kode.toLowerCase().includes(q);
    return docMatch || whMatch;
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
            <ClipboardCheck className="w-7 h-7 text-indigo-600" />
            Penyesuaian Stok (Stock Opname)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Rekonsiliasi kuantitas fisik persediaan terhadap catatan sistem. Selisih diposting otomatis ke akun
            Persediaan dan akun Penyesuaian Persediaan (Inventory Adjustment).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Opname / Penyesuaian Baru
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari no dokumen, gudang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterWarehouse}
            onChange={(e) => setFilterWarehouse(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Semua Gudang</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.kode} - {w.nama}
              </option>
            ))}
          </select>
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

      {/* Adjustments Table */}
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
                  Gudang
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total Selisih Nilai
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
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500 text-sm">
                    Memuat data penyesuaian stok...
                  </td>
                </tr>
              ) : filteredAdjustments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500 text-sm">
                    Belum ada dokumen penyesuaian stok.
                  </td>
                </tr>
              ) : (
                filteredAdjustments.map((a) => {
                  const val = Number(a.totalSelisihNilai || 0);
                  const isPositive = val > 0;
                  const isNegative = val < 0;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setDetailAdj(a)}
                          className="font-medium text-indigo-600 hover:text-indigo-900 hover:underline flex items-center gap-1.5"
                        >
                          <FileText className="w-4 h-4 text-gray-400" />
                          {a.noDokumen}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(a.tanggal).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {a.warehouse ? `${a.warehouse.kode} - ${a.warehouse.nama}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right">
                        <span
                          className={
                            isPositive
                              ? 'text-emerald-600'
                              : isNegative
                              ? 'text-rose-600'
                              : 'text-gray-700'
                          }
                        >
                          {isPositive ? '+' : ''}
                          Rp {val.toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(a.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => setDetailAdj(a)}
                          className="text-gray-600 hover:text-gray-900 p-1"
                          title="Lihat Detail"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {a.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePostAdjustment(a)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Posting
                          </button>
                        )}
                        {a.status === 'POSTED' && (
                          <button
                            onClick={() => handleOpenVoidModal(a)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded text-xs hover:bg-rose-100"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Void
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detailAdj && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-indigo-600" />
                  Detail Opname: {detailAdj.noDokumen}
                </h2>
                <div className="flex items-center gap-3 mt-1.5">
                  {getStatusBadge(detailAdj.status)}
                  <span className="text-xs text-gray-500">
                    Tanggal: {new Date(detailAdj.tanggal).toLocaleDateString('id-ID')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDetailAdj(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg text-sm">
                <div>
                  <span className="text-gray-500 block text-xs">Gudang</span>
                  <span className="font-semibold text-gray-900">
                    {detailAdj.warehouse?.nama} ({detailAdj.warehouse?.kode})
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Total Selisih Nilai</span>
                  <span
                    className={`font-bold ${
                      Number(detailAdj.totalSelisihNilai) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    Rp {Number(detailAdj.totalSelisihNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {detailAdj.journalId && (
                  <div>
                    <span className="text-gray-500 block text-xs">ID Jurnal GL</span>
                    <span className="font-mono text-xs text-gray-700">{detailAdj.journalId}</span>
                  </div>
                )}
                {detailAdj.catatan && (
                  <div className="col-span-2 sm:col-span-3">
                    <span className="text-gray-500 block text-xs">Catatan</span>
                    <span className="text-gray-800">{detailAdj.catatan}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 text-sm mb-3">Daftar Baris Penyesuaian</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barang</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty Sistem</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty Fisik</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Selisih Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Biaya Satuan</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Selisih Nilai</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {detailAdj.lines.map((l, i) => {
                        const diff = Number(l.selisihQty || 0);
                        return (
                          <tr key={i}>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-gray-900">{l.item?.nama || '-'}</div>
                              <div className="text-xs text-gray-500 font-mono">{l.item?.kode}</div>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700">
                              {Number(l.qtySistem).toLocaleString('id-ID')} {l.item?.satuan}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                              {Number(l.qtyFisik).toLocaleString('id-ID')} {l.item?.satuan}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right font-bold ${
                                diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-gray-500'
                              }`}
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700">
                              Rp {Number(l.biayaSatuan).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right font-semibold ${
                                Number(l.selisihNilai) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              Rp {Number(l.selisihNilai).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{l.catatan || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setDetailAdj(null)}
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-indigo-600" />
                  Buat Penyesuaian Stok / Opname
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Masukkan hasil hitung fisik barang di gudang. Sistem akan menghitung selisih secara otomatis.
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
                    Tanggal Penyesuaian *
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
                    Gudang yang Dihitung *
                  </label>
                  <select
                    required
                    value={formData.warehouseId}
                    onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Pilih Gudang --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.kode} - {w.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Otomatisasi Garis
                  </label>
                  <button
                    type="button"
                    disabled={loadingStock || !formData.warehouseId}
                    onClick={handleLoadWarehouseStock}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium hover:bg-indigo-100 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingStock ? 'animate-spin' : ''}`} />
                    {loadingStock ? 'Memuat Saldo...' : 'Muat Stok Gudang Ini'}
                  </button>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Catatan / Keterangan Opname
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Stock Opname akhir bulan / penyesuaian barang rusak"
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
                    Daftar Barang Opname
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris Manual
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/4">
                          Barang (Stok)
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">
                          Qty Sistem
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">
                          Qty Fisik *
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">
                          Selisih Qty
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                          Biaya Satuan
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">
                          Selisih Nilai
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Keterangan
                        </th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-10">
                          #
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {formData.lines.map((line, idx) => {
                        const diff = Number(line.selisihQty || 0);
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
                                    {item.kode} - {item.nama} ({item.satuan})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="any"
                                value={line.qtySistem}
                                onChange={(e) => handleLineChange(idx, 'qtySistem', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right bg-gray-50 focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                required
                                value={line.qtyFisik}
                                onChange={(e) => handleLineChange(idx, 'qtyFisik', e.target.value)}
                                className="w-full px-2 py-1.5 border border-indigo-300 rounded text-xs text-right font-semibold focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-xs">
                              <span
                                className={
                                  diff > 0
                                    ? 'text-emerald-600'
                                    : diff < 0
                                    ? 'text-rose-600'
                                    : 'text-gray-400'
                                }
                              >
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.biayaSatuan}
                                onChange={(e) => handleLineChange(idx, 'biayaSatuan', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-xs">
                              <span
                                className={
                                  Number(line.selisihNilai) >= 0
                                    ? 'text-emerald-600'
                                    : 'text-rose-600'
                                }
                              >
                                Rp {Number(line.selisihNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                placeholder="Opsional"
                                value={line.catatan}
                                onChange={(e) => handleLineChange(idx, 'catatan', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500"
                              />
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
                  <span className="font-medium text-gray-600">Total Selisih Nilai Buku:</span>
                  <span
                    className={`text-base font-bold ${
                      calculateTotalSelisihNilai() >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    Rp {calculateTotalSelisihNilai().toLocaleString('id-ID', { minimumFractionDigits: 2 })}
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
      {voidModalAdj && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Batalkan Dokumen (Void)</h3>
            <p className="text-sm text-gray-600 mb-4">
              Anda akan membatalkan penyesuaian stok{' '}
              <span className="font-semibold">{voidModalAdj.noDokumen}</span>. Selisih mutasi stok akan dikembalikan dan jurnal pembalik akan dibuat.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Alasan Pembatalan
              </label>
              <textarea
                rows={3}
                placeholder="Contoh: Salah perhitungan fisik"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setVoidModalAdj(null)}
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

