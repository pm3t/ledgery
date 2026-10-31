import React, { useState, useEffect } from 'react';
import {
  PackagePlus,
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
  ChartOfAccount,
  Item,
  StockReceiptOther,
  StockReceiptOtherLine,
} from '../../services/api';

interface StockReceiptOtherPageProps {
  currentTenant: Tenant | null;
}

export const StockReceiptOtherPage: React.FC<StockReceiptOtherPageProps> = ({ currentTenant }) => {
  const [receipts, setReceipts] = useState<StockReceiptOther[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [coaList, setCoaList] = useState<ChartOfAccount[]>([]);
  const [stockItems, setStockItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterWarehouse, setFilterWarehouse] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [detailReceipt, setDetailReceipt] = useState<StockReceiptOther | null>(null);
  const [voidModalReceipt, setVoidModalReceipt] = useState<StockReceiptOther | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    warehouseId: '',
    akunLawanId: '',
    catatan: '',
    lines: [
      { itemId: '', qty: 1, biayaSatuan: 0, catatan: '' },
    ],
  });

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [recData, whData, coaData, itemData] = await Promise.all([
        api.getReceiptOthers(currentTenant.id, {
          warehouseId: filterWarehouse || undefined,
          status: filterStatus || undefined,
        }),
        api.getWarehouses(currentTenant.id, true),
        api.getCoaByTenant(currentTenant.id),
        api.getItems(currentTenant.id, { tipe: 'STOK', isActive: true }),
      ]);
      setReceipts(Array.isArray(recData) ? recData : []);
      setWarehouses(Array.isArray(whData) ? whData : []);
      setCoaList(Array.isArray(coaData) ? coaData : []);
      setStockItems(Array.isArray(itemData) ? itemData : []);
    } catch (err: any) {
      console.error('Failed to fetch stock receipt others data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant, filterWarehouse, filterStatus]);

  const handleOpenCreateModal = () => {
    setFormData({
      tanggal: new Date().toISOString().split('T')[0],
      warehouseId: warehouses.length > 0 ? warehouses[0].id : '',
      akunLawanId: '',
      catatan: '',
      lines: [{ itemId: stockItems.length > 0 ? stockItems[0].id : '', qty: 1, biayaSatuan: 0, catatan: '' }],
    });
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleAddLine = () => {
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        { itemId: stockItems.length > 0 ? stockItems[0].id : '', qty: 1, biayaSatuan: 0, catatan: '' },
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

    if (!formData.warehouseId) {
      setFormError('Pilih gudang penerima');
      return;
    }
    if (!formData.akunLawanId) {
      setFormError('Pilih akun lawan (Kredit) untuk penerimaan ini');
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
      if (Number(l.qty) <= 0) {
        setFormError(`Baris #${i + 1}: Kuantitas harus lebih besar dari 0`);
        return;
      }
      if (Number(l.biayaSatuan) <= 0) {
        setFormError(`Baris #${i + 1}: Biaya satuan harus lebih besar dari 0`);
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        tanggal: formData.tanggal,
        warehouseId: formData.warehouseId,
        akunLawanId: formData.akunLawanId,
        catatan: formData.catatan || null,
        lines: formData.lines.map((l) => ({
          itemId: l.itemId,
          qty: Number(l.qty),
          biayaSatuan: Number(l.biayaSatuan),
          catatan: l.catatan || null,
        })),
      };

      const created = await api.createReceiptOther(currentTenant.id, payload);

      if (andPost && created && created.id) {
        await api.postReceiptOther(currentTenant.id, created.id);
      }

      setIsCreateModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan penerimaan barang');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostReceipt = async (receipt: StockReceiptOther) => {
    if (!currentTenant) return;
    if (!window.confirm(`Yakin ingin memposting dokumen penerimaan ${receipt.noDokumen}? Jurnal persediaan akan dibuat.`)) {
      return;
    }
    setLoading(true);
    try {
      await api.postReceiptOther(currentTenant.id, receipt.id);
      fetchData();
    } catch (err: any) {
      alert(`Gagal posting: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenVoidModal = (receipt: StockReceiptOther) => {
    setVoidModalReceipt(receipt);
    setVoidReason('');
  };

  const handleConfirmVoid = async () => {
    if (!currentTenant || !voidModalReceipt) return;
    setSubmitting(true);
    try {
      await api.voidReceiptOther(currentTenant.id, voidModalReceipt.id, voidReason);
      setVoidModalReceipt(null);
      fetchData();
    } catch (err: any) {
      alert(`Gagal membatalkan (void): ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReceipts = receipts.filter((r) => {
    const q = searchQuery.toLowerCase();
    const docMatch = r.noDokumen.toLowerCase().includes(q);
    const whMatch = r.warehouse?.nama.toLowerCase().includes(q) || r.warehouse?.kode.toLowerCase().includes(q);
    const coaMatch = r.akunLawan?.nama_akun.toLowerCase().includes(q) || r.akunLawan?.kode_akun.toLowerCase().includes(q);
    return docMatch || whMatch || coaMatch;
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
            <PackagePlus className="w-7 h-7 text-indigo-600" />
            Penerimaan Barang Lainnya
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Catat penerimaan stok non-pembelian (bonus, sampel, produksi internal, saldo awal manual).
            Mendebit Persediaan dan mengkredit akun lawan yang ditentukan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Penerimaan Baru
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari no dokumen, gudang, akun lawan..."
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

      {/* Receipts Table */}
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Akun Lawan (Cr)
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
                    Memuat data penerimaan...
                  </td>
                </tr>
              ) : filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500 text-sm">
                    Belum ada dokumen penerimaan barang lainnya.
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setDetailReceipt(r)}
                        className="font-medium text-indigo-600 hover:text-indigo-900 hover:underline flex items-center gap-1.5"
                      >
                        <FileText className="w-4 h-4 text-gray-400" />
                        {r.noDokumen}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(r.tanggal).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {r.warehouse ? `${r.warehouse.kode} - ${r.warehouse.nama}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {r.akunLawan ? `${r.akunLawan.kode_akun} - ${r.akunLawan.nama_akun}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                      Rp {Number(r.totalNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(r.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => setDetailReceipt(r)}
                        className="text-gray-600 hover:text-gray-900 p-1"
                        title="Lihat Detail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {r.status === 'DRAFT' && (
                        <button
                          onClick={() => handlePostReceipt(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Posting
                        </button>
                      )}
                      {r.status === 'POSTED' && (
                        <button
                          onClick={() => handleOpenVoidModal(r)}
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
      {detailReceipt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <PackagePlus className="w-5 h-5 text-indigo-600" />
                  Detail Penerimaan: {detailReceipt.noDokumen}
                </h2>
                <div className="flex items-center gap-3 mt-1.5">
                  {getStatusBadge(detailReceipt.status)}
                  <span className="text-xs text-gray-500">
                    Tanggal: {new Date(detailReceipt.tanggal).toLocaleDateString('id-ID')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDetailReceipt(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg text-sm">
                <div>
                  <span className="text-gray-500 block text-xs">Gudang Penerima</span>
                  <span className="font-semibold text-gray-900">
                    {detailReceipt.warehouse?.nama} ({detailReceipt.warehouse?.kode})
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Akun Lawan (Kredit)</span>
                  <span className="font-semibold text-gray-900">
                    {detailReceipt.akunLawan?.kode_akun} - {detailReceipt.akunLawan?.nama_akun}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs">Total Nilai</span>
                  <span className="font-bold text-indigo-600">
                    Rp {Number(detailReceipt.totalNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {detailReceipt.journalId && (
                  <div>
                    <span className="text-gray-500 block text-xs">ID Jurnal GL</span>
                    <span className="font-mono text-xs text-gray-700">{detailReceipt.journalId}</span>
                  </div>
                )}
                {detailReceipt.catatan && (
                  <div className="col-span-2 sm:col-span-3">
                    <span className="text-gray-500 block text-xs">Catatan</span>
                    <span className="text-gray-800">{detailReceipt.catatan}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 text-sm mb-3">Daftar Barang Diterima</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barang</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Biaya Satuan</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Nilai</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {detailReceipt.lines.map((l, i) => (
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
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{l.catatan || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setDetailReceipt(null)}
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
                  <PackagePlus className="w-5 h-5 text-indigo-600" />
                  Buat Penerimaan Barang Lainnya
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Mendebit akun Persediaan barang dan mengkredit akun lawan yang Anda pilih.
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
                    Tanggal Penerimaan *
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
                    Gudang Penerima *
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
                    Akun Lawan (Kredit) *
                  </label>
                  <select
                    required
                    value={formData.akunLawanId}
                    onChange={(e) => setFormData({ ...formData, akunLawanId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Pilih Akun Lawan --</option>
                    {coaList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.kode_akun} - {a.nama_akun} ({a.kategori})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Catatan / Keterangan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Penerimaan bonus dari supplier / sampel produk internal"
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
                    Daftar Barang Diterima
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
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-2/5">
                          Barang (Stok)
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">
                          Kuantitas
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-36">
                          Biaya Satuan (Rp)
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-36">
                          Subtotal
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Keterangan Baris
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
                                required
                                value={line.biayaSatuan}
                                onChange={(e) => handleLineChange(idx, 'biayaSatuan', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800 text-xs">
                              Rp {lineSubtotal.toLocaleString('id-ID', { minimumFractionDigits: 2 })}
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
                  <span className="font-medium text-gray-600">Total Nilai Penerimaan:</span>
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
      {voidModalReceipt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Batalkan Dokumen (Void)</h3>
            <p className="text-sm text-gray-600 mb-4">
              Anda akan membatalkan penerimaan barang{' '}
              <span className="font-semibold">{voidModalReceipt.noDokumen}</span>. Stok akan dikurangkan kembali dan jurnal pembalik akan dibuat.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Alasan Pembatalan
              </label>
              <textarea
                rows={3}
                placeholder="Contoh: Salah input gudang / salah kuantitas"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setVoidModalReceipt(null)}
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
