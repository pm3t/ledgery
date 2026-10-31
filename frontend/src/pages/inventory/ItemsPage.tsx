import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  api,
  Tenant,
  Item,
  ChartOfAccount,
  ItemType,
  InventoryValuationMethod,
} from '../../services/api';

interface ItemsPageProps {
  currentTenant: Tenant | null;
}

export const ItemsPage: React.FC<ItemsPageProps> = ({ currentTenant }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [assetAccounts, setAssetAccounts] = useState<ChartOfAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartOfAccount[]>([]);
  const [revenueAccounts, setRevenueAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [valuationFilter, setValuationFilter] = useState<string>('ALL');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    kode: '',
    nama: '',
    groupCode: '',
    satuan: 'PCS',
    tipe: 'STOK' as ItemType,
    valuationMethod: 'MOVING_AVERAGE' as InventoryValuationMethod,
    akunPersediaanId: '',
    akunHppId: '',
    akunPendapatanId: '',
    externalRef: '',
    isActive: true,
  });

  // CSV Import State
  const [csvContent, setCsvContent] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [itemsData, coaAset, coaBeban, coaPendapatan] = await Promise.all([
        api.getItems(currentTenant.id),
        api.getCoaByTenant(currentTenant.id, 'ASET'),
        api.getCoaByTenant(currentTenant.id, 'BEBAN'),
        api.getCoaByTenant(currentTenant.id, 'PENDAPATAN'),
      ]);
      setItems(itemsData || []);
      setAssetAccounts(coaAset || []);
      setExpenseAccounts(coaBeban || []);
      setRevenueAccounts(coaPendapatan || []);
    } catch (err) {
      console.error('Gagal mengambil data master barang:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant]);

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormData({
      kode: '',
      nama: '',
      groupCode: '',
      satuan: 'PCS',
      tipe: 'STOK',
      valuationMethod: 'MOVING_AVERAGE',
      akunPersediaanId: '',
      akunHppId: '',
      akunPendapatanId: '',
      externalRef: '',
      isActive: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: Item) => {
    setEditingItem(item);
    setFormData({
      kode: item.kode,
      nama: item.nama,
      groupCode: item.groupCode || '',
      satuan: item.satuan,
      tipe: item.tipe,
      valuationMethod: item.valuationMethod,
      akunPersediaanId: item.akunPersediaanId || '',
      akunHppId: item.akunHppId || '',
      akunPendapatanId: item.akunPendapatanId || '',
      externalRef: item.externalRef || '',
      isActive: item.isActive,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!formData.kode.trim() || !formData.nama.trim()) {
      setFormError('Kode dan Nama Barang wajib diisi.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (editingItem) {
        await api.updateItem(currentTenant.id, editingItem.id, {
          nama: formData.nama,
          groupCode: formData.groupCode || undefined,
          satuan: formData.satuan,
          tipe: formData.tipe,
          valuationMethod: formData.valuationMethod,
          akunPersediaanId: formData.akunPersediaanId || null,
          akunHppId: formData.akunHppId || null,
          akunPendapatanId: formData.akunPendapatanId || null,
          externalRef: formData.externalRef || null,
          isActive: formData.isActive,
        });
      } else {
        await api.createItem(currentTenant.id, {
          kode: formData.kode,
          nama: formData.nama,
          groupCode: formData.groupCode || undefined,
          satuan: formData.satuan,
          tipe: formData.tipe,
          valuationMethod: formData.valuationMethod,
          akunPersediaanId: formData.akunPersediaanId || undefined,
          akunHppId: formData.akunHppId || undefined,
          akunPendapatanId: formData.akunPendapatanId || undefined,
          externalRef: formData.externalRef || undefined,
          isActive: formData.isActive,
        });
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan barang.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, nama: string) => {
    if (!currentTenant) return;
    if (confirm(`Yakin ingin menonaktifkan / menghapus barang "${nama}"?`)) {
      try {
        await api.deleteItem(currentTenant.id, id);
        fetchData();
      } catch (err: any) {
        alert(err.message || 'Gagal menghapus barang');
      }
    }
  };

  // CSV Template & Import
  const handleDownloadTemplate = () => {
    const csv = 'kode,nama,groupCode,satuan,tipe,valuationMethod\nITEM-001,Beras Pandan Wangi 5kg,SEMBAKO,SAK,STOK,MOVING_AVERAGE\nITEM-002,Minyak Goreng 2L,SEMBAKO,POUCH,STOK,FIFO\nSRV-001,Jasa Pengiriman Cepat,LOGISTIK,TRIP,JASA,MOVING_AVERAGE';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'template_master_barang.csv');
  };

  const handleExecuteImport = async () => {
    if (!currentTenant || !csvContent.trim()) return;
    setImportLoading(true);
    setImportResult(null);

    try {
      const lines = csvContent.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length <= 1) {
        alert('File CSV harus memiliki header dan minimal 1 baris data.');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const idxKode = headers.indexOf('kode');
      const idxNama = headers.indexOf('nama');
      const idxGroup = headers.indexOf('groupcode');
      const idxSatuan = headers.indexOf('satuan');
      const idxTipe = headers.indexOf('tipe');
      const idxValuation = headers.indexOf('valuationmethod');

      const itemsToImport = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (cols[idxKode] && cols[idxNama]) {
          itemsToImport.push({
            kode: cols[idxKode],
            nama: cols[idxNama],
            groupCode: idxGroup >= 0 ? cols[idxGroup] : undefined,
            satuan: idxSatuan >= 0 && cols[idxSatuan] ? cols[idxSatuan] : 'PCS',
            tipe: (idxTipe >= 0 && cols[idxTipe] ? cols[idxTipe].toUpperCase() : 'STOK') as ItemType,
            valuationMethod: (idxValuation >= 0 && cols[idxValuation] ? cols[idxValuation].toUpperCase() : 'MOVING_AVERAGE') as InventoryValuationMethod,
          });
        }
      }

      const res = await api.importItems(currentTenant.id, { items: itemsToImport });
      setImportResult(res);
      fetchData();
    } catch (err: any) {
      alert(`Gagal mengimpor: ${err.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        item.kode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.groupCode && item.groupCode.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchType = typeFilter === 'ALL' || item.tipe === typeFilter;
      const matchValuation = valuationFilter === 'ALL' || item.valuationMethod === valuationFilter;
      return matchSearch && matchType && matchValuation;
    });
  }, [items, searchQuery, typeFilter, valuationFilter]);

  const summary = useMemo(() => {
    const total = items.length;
    const stokCount = items.filter((i) => i.tipe === 'STOK').length;
    const fifoCount = items.filter((i) => i.valuationMethod === 'FIFO').length;
    const maCount = items.filter((i) => i.valuationMethod === 'MOVING_AVERAGE').length;
    return { total, stokCount, fifoCount, maCount };
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Master Barang & Jasa (Items)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Katalog barang stok, non-stok, dan jasa beserta metode valuasi biaya (Moving Average / FIFO) dan pemetaan akun GL.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCsvContent('');
              setImportResult(null);
              setIsImportOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm transition-colors border border-slate-200"
          >
            <Upload className="w-4 h-4" />
            Impor CSV
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Tambah Barang
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block uppercase font-semibold">Total Item</span>
          <span className="text-2xl font-bold text-slate-800 font-mono mt-1 block">{summary.total}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block uppercase font-semibold">Barang Stok (Fisik)</span>
          <span className="text-2xl font-bold text-emerald-600 font-mono mt-1 block">{summary.stokCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block uppercase font-semibold">Moving Average</span>
          <span className="text-2xl font-bold text-blue-600 font-mono mt-1 block">{summary.maCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block uppercase font-semibold">FIFO (First-In, First-Out)</span>
          <span className="text-2xl font-bold text-indigo-600 font-mono mt-1 block">{summary.fifoCount}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode, nama barang, atau kategori..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="w-full sm:w-48">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="ALL">Semua Tipe</option>
            <option value="STOK">STOK</option>
            <option value="NON_STOK">NON-STOK</option>
            <option value="JASA">JASA</option>
          </select>
        </div>

        <div className="w-full sm:w-48">
          <select
            value={valuationFilter}
            onChange={(e) => setValuationFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="ALL">Semua Valuasi</option>
            <option value="MOVING_AVERAGE">Moving Average</option>
            <option value="FIFO">FIFO</option>
          </select>
        </div>
      </div>

      {/* Tabel Barang */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4 text-center">Tipe</th>
                <th className="py-3 px-4 text-center">Valuasi</th>
                <th className="py-3 px-4 text-center">Satuan</th>
                <th className="py-3 px-4 text-right">Stok On Hand</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Memuat data master barang...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Belum ada barang terdaftar.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const totalQty = (item.balances || []).reduce((acc, b) => acc + Number(b.qty), 0);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {item.kode}
                        {item.externalRef && (
                          <div className="text-[10px] text-slate-400 font-normal">Ref: {item.externalRef}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {item.nama}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs">
                        {item.groupCode ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                            {item.groupCode}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.tipe === 'STOK' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            STOK
                          </span>
                        ) : item.tipe === 'NON_STOK' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            NON-STOK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                            JASA
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.valuationMethod === 'FIFO' ? (
                          <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            FIFO
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 text-slate-700">
                            MOVING AVG
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-600">
                        {item.satuan}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                        {item.tipe === 'STOK' ? (
                          totalQty > 0 ? (
                            <span className="text-emerald-700">{new Intl.NumberFormat('id-ID').format(totalQty)}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
                            <XCircle className="w-3.5 h-3.5" /> Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            title="Edit Barang"
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.nama)}
                            title="Hapus / Nonaktifkan"
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Modal Create / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                {editingItem ? 'Edit Data Barang' : 'Tambah Barang Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode Barang <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.kode}
                    onChange={(e) => setFormData({ ...formData, kode: e.target.value.toUpperCase() })}
                    disabled={!!editingItem}
                    placeholder="Contoh: ITM-001"
                    required
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Barang <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.nama}
                    onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                    placeholder="Nama barang atau jasa..."
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori / Group Code
                  </label>
                  <input
                    type="text"
                    value={formData.groupCode}
                    onChange={(e) => setFormData({ ...formData, groupCode: e.target.value })}
                    placeholder="Contoh: BAHAN_BAKU, SEMBAKO"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Satuan Ukuran <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.satuan}
                    onChange={(e) => setFormData({ ...formData, satuan: e.target.value.toUpperCase() })}
                    placeholder="Contoh: PCS, KG, BOX"
                    required
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Barang</label>
                  <select
                    value={formData.tipe}
                    onChange={(e) => setFormData({ ...formData, tipe: e.target.value as ItemType })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="STOK">STOK (Memiliki kuantitas fisik di gudang)</option>
                    <option value="NON_STOK">NON-STOK (Barang langsung habis / perlengkapan)</option>
                    <option value="JASA">JASA (Layanan non-fisik)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Metode Valuasi Biaya
                  </label>
                  <select
                    value={formData.valuationMethod}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        valuationMethod: e.target.value as InventoryValuationMethod,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                  >
                    <option value="MOVING_AVERAGE">MOVING_AVERAGE (Biaya Rata-Rata)</option>
                    <option value="FIFO">FIFO (First-In, First-Out)</option>
                  </select>
                  {editingItem && (
                    <span className="text-[11px] text-amber-600 block mt-1">
                      Catatan: Metode valuasi hanya dapat diubah bila sisa stok saat ini nol.
                    </span>
                  )}
                </div>
              </div>

              {/* Pemetaan Akun GL Khusus */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Override Akun GL (Opsional — kosongkan jika memakai Posting Setup tenant)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Akun Persediaan</label>
                    <select
                      value={formData.akunPersediaanId}
                      onChange={(e) => setFormData({ ...formData, akunPersediaanId: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="">Default Posting Setup</option>
                      {assetAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kode_akun} - {a.nama_akun}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Akun HPP (COGS)</label>
                    <select
                      value={formData.akunHppId}
                      onChange={(e) => setFormData({ ...formData, akunHppId: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="">Default Posting Setup</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kode_akun} - {a.nama_akun}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Akun Pendapatan</label>
                    <select
                      value={formData.akunPendapatanId}
                      onChange={(e) => setFormData({ ...formData, akunPendapatanId: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="">Default Posting Setup</option>
                      {revenueAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.kode_akun} - {a.nama_akun}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Referensi Eksternal (API / Barcode / SKU)
                </label>
                <input
                  type="text"
                  value={formData.externalRef}
                  onChange={(e) => setFormData({ ...formData, externalRef: e.target.value })}
                  placeholder="Contoh: BARCODE-8899120"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="isActive" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Barang Aktif (Dapat dipilih pada transaksi penjualan dan pembelian)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 rounded-lg shadow-sm"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Barang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impor CSV */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                Impor Master Barang via CSV
              </h3>
              <button
                onClick={() => setIsImportOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Format: kode, nama, groupCode, satuan, tipe, valuationMethod</span>
              <button
                onClick={handleDownloadTemplate}
                className="text-emerald-600 hover:underline flex items-center gap-1 font-semibold"
              >
                <Download className="w-3.5 h-3.5" /> Unduh Template CSV
              </button>
            </div>

            <textarea
              rows={6}
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="kode,nama,groupCode,satuan,tipe,valuationMethod&#10;ITM-001,Beras Pandan Wangi 5kg,SEMBAKO,SAK,STOK,MOVING_AVERAGE"
              className="w-full p-3 font-mono text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            {importResult && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div className="font-semibold text-slate-700">Hasil Impor:</div>
                <div className="text-emerald-600">Berhasil: {importResult.berhasil} item</div>
                {importResult.gagal > 0 && (
                  <div className="text-rose-600 mt-1">
                    Gagal: {importResult.gagal} item
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      {importResult.errors.map((err: any, idx: number) => (
                        <li key={idx}>Baris {err.baris} ({err.kode}): {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsImportOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Tutup
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={importLoading || !csvContent.trim()}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 rounded-lg shadow-sm"
              >
                {importLoading ? 'Memproses...' : 'Proses Impor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

