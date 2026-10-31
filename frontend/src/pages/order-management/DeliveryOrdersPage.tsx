import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Edit2,
  ExternalLink,
  Ban,
  ArrowRight,
  Package,
  FileText,
  AlertCircle,
  RefreshCw,
  Warehouse as WarehouseIcon,
  X,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import {
  api,
  Tenant,
  DeliveryOrder,
  DeliveryOrderLine,
  DeliveryOrderStatus,
  SalesOrder,
  BusinessPartner,
  Warehouse,
  Item,
} from '../../services/api';

interface DeliveryOrdersPageProps {
  currentTenant: Tenant | null;
  initialSoId?: string;
  onNavigateToInvoice?: (invoiceId?: string) => void;
}

interface DoLineItemForm {
  soLineId?: string;
  itemId: string;
  deskripsi?: string;
  qty: number;
}

export const DeliveryOrdersPage: React.FC<DeliveryOrdersPageProps> = ({
  currentTenant,
  initialSoId,
  onNavigateToInvoice,
}) => {
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [openSos, setOpenSos] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<BusinessPartner[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedDo, setSelectedDo] = useState<DeliveryOrder | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [showConvertModal, setShowConvertModal] = useState<boolean>(false);

  // Form State for DO
  const [formData, setFormData] = useState<{
    tanggal: string;
    soId: string;
    partnerId: string;
    warehouseId: string;
    catatan: string;
    externalRef: string;
    lines: DoLineItemForm[];
  }>({
    tanggal: new Date().toISOString().split('T')[0],
    soId: initialSoId || '',
    partnerId: '',
    warehouseId: '',
    catatan: '',
    externalRef: '',
    lines: [],
  });

  // Convert to Invoice Form State
  const [convertData, setConvertData] = useState<{
    tanggal: string;
    jatuhTempo: string;
    catatan: string;
    externalRef: string;
    lines: Array<{
      doLineId: string;
      qty: number;
      hargaSatuan: number;
      diskon: number;
    }>;
  }>({
    tanggal: new Date().toISOString().split('T')[0],
    jatuhTempo: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    catatan: '',
    externalRef: '',
    lines: [],
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [postingId, setPostingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getDeliveryOrders(currentTenant.id, {
        status: filterStatus !== 'ALL' ? filterStatus : undefined,
        warehouseId: filterWarehouse !== 'ALL' ? filterWarehouse : undefined,
        search: searchQuery || undefined,
      });
      setDeliveryOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Gagal memuat Surat Jalan (DO):', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuxData = async () => {
    if (!currentTenant) return;
    try {
      const [sosData, partnersData, warehousesData, itemsData] = await Promise.all([
        api.getSalesOrders(currentTenant.id, { status: 'OPEN' }),
        api.getBusinessPartners(currentTenant.id, { type: 'customer', isActive: true }),
        api.getWarehouses(currentTenant.id),
        api.getItems(currentTenant.id, { isActive: true }),
      ]);
      setOpenSos(Array.isArray(sosData) ? sosData : []);
      setCustomers(Array.isArray(partnersData) ? partnersData : []);
      setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
      setItems(Array.isArray(itemsData) ? itemsData : []);
    } catch (err) {
      console.error('Gagal memuat aux data:', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchAuxData();
  }, [currentTenant, filterStatus, filterWarehouse]);

  useEffect(() => {
    if (initialSoId && openSos.length > 0) {
      handleSelectSo(initialSoId);
      setShowCreateModal(true);
    }
  }, [initialSoId, openSos]);

  const handleSelectSo = async (soId: string) => {
    if (!currentTenant) return;
    if (!soId) {
      setFormData((prev) => ({ ...prev, soId: '', lines: [] }));
      return;
    }

    try {
      const so = await api.getSalesOrder(currentTenant.id, soId);
      if (so) {
        const lines: DoLineItemForm[] = so.lines
          .filter((l: any) => l.itemId && Number(l.qty) > Number(l.qtyDikirim))
          .map((l: any) => {
            const sisaQty = Math.max(0, Number(l.qty) - Number(l.qtyDikirim));
            return {
              soLineId: l.id,
              itemId: l.itemId,
              deskripsi: l.deskripsi || l.item?.nama,
              qty: sisaQty,
            };
          });

        setFormData((prev) => ({
          ...prev,
          soId,
          partnerId: so.partnerId,
          lines,
        }));
      }
    } catch (err) {
      console.error('Gagal memuat detail SO untuk DO:', err);
    }
  };

  const handleAddLine = () => {
    setFormData((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          itemId: items[0]?.id || '',
          deskripsi: '',
          qty: 1,
        },
      ],
    }));
  };

  const handleRemoveLine = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  };

  const handleSaveDraft = async () => {
    if (!currentTenant) return;
    if (!formData.partnerId) {
      alert('Pilih pelanggan tujuan pengiriman.');
      return;
    }
    if (!formData.warehouseId) {
      alert('Pilih gudang asal pengiriman.');
      return;
    }
    if (formData.lines.length === 0) {
      alert('Minimal 1 baris barang untuk pengiriman.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tanggal: formData.tanggal,
        soId: formData.soId || undefined,
        partnerId: formData.partnerId,
        warehouseId: formData.warehouseId,
        catatan: formData.catatan || undefined,
        externalRef: formData.externalRef || undefined,
        lines: formData.lines.map((l) => ({
          soLineId: l.soLineId || undefined,
          itemId: l.itemId,
          deskripsi: l.deskripsi || undefined,
          qty: Number(l.qty),
        })),
      };

      await api.createDeliveryOrder(currentTenant.id, payload);
      setShowCreateModal(false);
      fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan Surat Jalan.');
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (id: string) => {
    if (!currentTenant || !confirm('Posting Surat Jalan (DO)? Pengurangan stok dan jurnal HPP (Dr HPP / Cr Persediaan) akan dicatat.')) return;
    setPostingId(id);
    try {
      await api.postDeliveryOrder(currentTenant.id, id);
      fetchOrders();
      if (selectedDo?.id === id) {
        const updated = await api.getDeliveryOrder(currentTenant.id, id);
        setSelectedDo(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal memposting Surat Jalan.');
    } finally {
      setPostingId(null);
    }
  };

  const handleVoid = async (id: string) => {
    const alasan = prompt('Masukkan alasan pembatalan (VOID) Surat Jalan:');
    if (alasan === null) return;
    if (!currentTenant) return;

    try {
      await api.voidDeliveryOrder(currentTenant.id, id, alasan);
      fetchOrders();
      if (selectedDo?.id === id) {
        const updated = await api.getDeliveryOrder(currentTenant.id, id);
        setSelectedDo(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal membatalkan Surat Jalan.');
    }
  };

  const openConvertModal = (dOrder: DeliveryOrder) => {
    setSelectedDo(dOrder);
    setConvertData({
      tanggal: new Date().toISOString().split('T')[0],
      jatuhTempo: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      catatan: `Faktur Penjualan atas Surat Jalan ${dOrder.noDokumen}`,
      externalRef: dOrder.externalRef || '',
      lines: dOrder.lines
        .filter((l) => Number(l.qty) > Number(l.qtyDitagih))
        .map((l) => {
          const soPrice = l.soLine?.harga ? Number(l.soLine.harga) : 0;
          return {
            doLineId: l.id!,
            qty: Number(l.qty) - Number(l.qtyDitagih),
            hargaSatuan: soPrice,
            diskon: 0,
          };
        }),
    });
    setShowConvertModal(true);
  };

  const handleConfirmConvert = async () => {
    if (!currentTenant || !selectedDo) return;
    setSaving(true);
    try {
      const res = await api.createInvoiceFromDo(currentTenant.id, selectedDo.id, convertData);
      setShowConvertModal(false);
      fetchOrders();
      if (onNavigateToInvoice) {
        onNavigateToInvoice(res.id);
      } else {
        alert(`Faktur Penjualan berhasil dibuat: ${res.noDokumen}`);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal membuat faktur penjualan dari DO.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: DeliveryOrderStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            DRAFT
          </span>
        );
      case 'POSTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            POSTED (TERKIRIM)
          </span>
        );
      case 'VOID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            VOID
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const summary = useMemo(() => {
    const totalCount = deliveryOrders.length;
    const postedCount = deliveryOrders.filter((r) => r.status === 'POSTED').length;
    const draftCount = deliveryOrders.filter((r) => r.status === 'DRAFT').length;
    const totalQty = deliveryOrders
      .filter((r) => r.status === 'POSTED')
      .reduce((sum, r) => sum + r.lines.reduce((ls, l) => ls + Number(l.qty), 0), 0);
    return { totalCount, postedCount, draftCount, totalQty };
  }, [deliveryOrders]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="h-7 w-7 text-indigo-600" />
            Surat Jalan (Delivery Order)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Catat pengiriman fisik barang ke pelanggan, pengurangan stok, dan pembukuan Harga Pokok Penjualan (HPP).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setFormData({
                tanggal: new Date().toISOString().split('T')[0],
                soId: '',
                partnerId: '',
                warehouseId: warehouses[0]?.id || '',
                catatan: '',
                externalRef: '',
                lines: [],
              });
              setShowCreateModal(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors gap-2"
          >
            <Plus className="h-4 w-4" />
            Buat Surat Jalan Baru
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Total Dokumen DO</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
            {summary.totalCount}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase">
            Posted (Terkirim & Terjurnal)
          </p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {summary.postedCount}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase">
            Draft (Menunggu Kirim)
          </p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {summary.draftCount}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Total Qty Terkirim</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
            {summary.totalQty.toLocaleString('id-ID')} unit
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari no. DO, pelanggan, no. SO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={fetchOrders}
            className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              <option value="ALL">Semua Status</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="VOID">Void</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Gudang:</span>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white max-w-[200px]"
            >
              <option value="ALL">Semua Gudang</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">No. DO</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">SO Asal</th>
                <th className="px-4 py-3">Pelanggan</th>
                <th className="px-4 py-3">Gudang Asal</th>
                <th className="px-4 py-3 text-right">Total Qty</th>
                <th className="px-4 py-3">Status Faktur (Invoice)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    Memuat daftar surat jalan...
                  </td>
                </tr>
              ) : deliveryOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    Belum ada Surat Jalan (DO).
                  </td>
                </tr>
              ) : (
                deliveryOrders.map((dOrder) => {
                  const totalQty = dOrder.lines.reduce((s, l) => s + Number(l.qty), 0);
                  const totalBill = dOrder.lines.reduce((s, l) => s + Number(l.qtyDitagih), 0);
                  const isFullyBilled = totalQty > 0 && totalBill >= totalQty;

                  return (
                    <tr
                      key={dOrder.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{dOrder.noDokumen}</span>
                          {dOrder.externalRef && (
                            <span className="text-xs text-slate-400">Ref: {dOrder.externalRef}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(dOrder.tanggal).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3 font-medium text-indigo-600 whitespace-nowrap">
                        {dOrder.so?.noDokumen || '-'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {dOrder.partner?.nama || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {dOrder.warehouse?.nama || '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {totalQty.toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            isFullyBilled
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : totalBill > 0
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {totalBill} / {totalQty} Ditagih
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getStatusBadge(dOrder.status)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedDo(dOrder);
                              setShowDetailModal(true);
                            }}
                            className="p-1 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
                            title="Lihat Rincian DO"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>

                          {dOrder.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePost(dOrder.id)}
                              disabled={postingId === dOrder.id}
                              className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium disabled:opacity-50"
                            >
                              {postingId === dOrder.id ? 'Posting...' : 'Post DO'}
                            </button>
                          )}

                          {dOrder.status === 'POSTED' && !isFullyBilled && (
                            <button
                              onClick={() => openConvertModal(dOrder)}
                              className="px-2 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded font-medium flex items-center gap-1"
                              title="Terbitkan Faktur Penjualan (Sales Invoice)"
                            >
                              <Receipt className="h-3 w-3" />
                              Faktur
                            </button>
                          )}

                          {dOrder.status === 'POSTED' && totalBill === 0 && (
                            <button
                              onClick={() => handleVoid(dOrder.id)}
                              className="p-1 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                              title="Batalkan (Void) DO"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
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

      {/* Modal: Buat Surat Jalan Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="h-5 w-5 text-indigo-600" />
                Catat Surat Jalan (Delivery Order)
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Header Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Pilih SO Terkait (Opsional)
                  </label>
                  <select
                    value={formData.soId}
                    onChange={(e) => handleSelectSo(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="">-- Tanpa SO (Pengiriman Langsung) --</option>
                    {openSos.map((so) => (
                      <option key={so.id} value={so.id}>
                        {so.noDokumen} - {so.partner?.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Pelanggan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.partnerId}
                    disabled={!!formData.soId}
                    onChange={(e) => setFormData({ ...formData, partnerId: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white disabled:bg-slate-100 dark:disabled:bg-slate-800"
                  >
                    <option value="">-- Pilih Pelanggan --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Gudang Pengirim <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.warehouseId}
                    onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="">-- Pilih Gudang --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Kirim <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    No. Resi / Kendaraan / Ref
                  </label>
                  <input
                    type="text"
                    value={formData.externalRef}
                    onChange={(e) => setFormData({ ...formData, externalRef: e.target.value })}
                    placeholder="Contoh: B-1234-XYZ / JNE-990"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Catatan Pengiriman
                  </label>
                  <input
                    type="text"
                    value={formData.catatan}
                    onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                    placeholder="Penerima di lokasi / instruksi bongkar"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Lines */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Barang yang Dikirim
                  </h3>
                  {!formData.soId && (
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tambah Baris
                    </button>
                  )}
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="p-2.5">Barang</th>
                        <th className="p-2.5">Deskripsi</th>
                        <th className="p-2.5 w-32 text-right">Qty Kirim</th>
                        {!formData.soId && <th className="p-2.5 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {formData.lines.map((line, idx) => (
                        <tr key={idx} className="bg-white dark:bg-slate-800">
                          <td className="p-2">
                            {formData.soId ? (
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {items.find((i) => i.id === line.itemId)?.nama || line.itemId}
                              </span>
                            ) : (
                              <select
                                value={line.itemId}
                                onChange={(e) => {
                                  const upd = [...formData.lines];
                                  upd[idx].itemId = e.target.value;
                                  setFormData({ ...formData, lines: upd });
                                }}
                                className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900"
                              >
                                {items.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.kode} - {i.nama}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={line.deskripsi || ''}
                              onChange={(e) => {
                                const upd = [...formData.lines];
                                upd[idx].deskripsi = e.target.value;
                                setFormData({ ...formData, lines: upd });
                              }}
                              className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0.0001"
                              step="any"
                              value={line.qty}
                              onChange={(e) => {
                                const upd = [...formData.lines];
                                upd[idx].qty = Number(e.target.value);
                                setFormData({ ...formData, lines: upd });
                              }}
                              className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900 text-right font-medium"
                            />
                          </td>
                          {!formData.soId && (
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                className="text-slate-400 hover:text-rose-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveDraft}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                {saving ? 'Menyimpan...' : 'Simpan DRAFT DO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detail DO */}
      {showDetailModal && selectedDo && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Truck className="h-5 w-5 text-indigo-600" />
                  Detail Surat Jalan: {selectedDo.noDokumen}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Gudang: {selectedDo.warehouse?.nama} | Pelanggan: {selectedDo.partner?.nama}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <div>
                  <span className="text-slate-400">No. SO Asal:</span>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {selectedDo.so?.noDokumen || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Tanggal Pengiriman:</span>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {new Date(selectedDo.tanggal).toLocaleDateString('id-ID')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Status Dokumen:</span>
                  <div className="mt-1">{getStatusBadge(selectedDo.status)}</div>
                </div>
                <div>
                  <span className="text-slate-400">Ref. Dokumen:</span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                    {selectedDo.externalRef || '-'}
                  </p>
                </div>
              </div>

              {selectedDo.journal && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                  <strong>Jurnal Posting:</strong> {selectedDo.journal.no_jurnal || selectedDo.journalId} (Dr Beban HPP / Cr Persediaan Barang Dagang)
                </div>
              )}

              {/* Lines */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="p-2.5">Barang</th>
                      <th className="p-2.5 text-right">Qty Dikirim</th>
                      <th className="p-2.5 text-right">Qty Ditagih (Inv)</th>
                      <th className="p-2.5 text-right">Biaya HPP Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {selectedDo.lines.map((line) => (
                      <tr key={line.id} className="bg-white dark:bg-slate-800">
                        <td className="p-2.5">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {line.item?.kode} - {line.item?.nama}
                          </span>
                          {line.deskripsi && (
                            <p className="text-[11px] text-slate-400">{line.deskripsi}</p>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-semibold text-slate-900 dark:text-white">
                          {Number(line.qty).toLocaleString('id-ID')}
                        </td>
                        <td className="p-2.5 text-right text-emerald-600 font-semibold">
                          {Number(line.qtyDitagih).toLocaleString('id-ID')}
                        </td>
                        <td className="p-2.5 text-right font-medium">
                          Rp {Number(line.biayaTotal || 0).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300"
              >
                Tutup
              </button>
              {selectedDo.status === 'POSTED' && (
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    openConvertModal(selectedDo);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <Receipt className="h-4 w-4" />
                  Buat Faktur Penjualan (Invoice)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Konversi DO ke Sales Invoice */}
      {showConvertModal && selectedDo && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl border border-slate-200 dark:border-slate-700 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-indigo-600" />
                  Terbitkan Faktur Penjualan (Sales Invoice) dari DO
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Surat Jalan: {selectedDo.noDokumen} | Pelanggan: {selectedDo.partner?.nama}
                </p>
              </div>
              <button
                onClick={() => setShowConvertModal(false)}
                className="text-slate-400 hover:text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-lg text-xs text-emerald-800 dark:text-emerald-300">
                Faktur penjualan ini otomatis ditautkan ke Surat Jalan (DO). Jurnal pengakuan piutang (Dr Piutang / Cr Pendapatan / Cr PPN) akan dibukukan <strong>tanpa menduplikasi pengurangan stok dan tanpa jurnal HPP kedua</strong> karena biaya persediaan telah diakui saat DO di-posting.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Faktur <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={convertData.tanggal}
                    onChange={(e) => setConvertData({ ...convertData, tanggal: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal Jatuh Tempo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={convertData.jatuhTempo}
                    onChange={(e) => setConvertData({ ...convertData, jatuhTempo: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="p-2.5">Barang</th>
                      <th className="p-2.5 w-24 text-right">Qty Ditagih</th>
                      <th className="p-2.5 w-32 text-right">Harga Satuan</th>
                      <th className="p-2.5 w-24 text-right">Diskon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {convertData.lines.map((line, idx) => {
                      const origLine = selectedDo.lines.find((l) => l.id === line.doLineId);
                      return (
                        <tr key={idx} className="bg-white dark:bg-slate-800">
                          <td className="p-2.5 font-medium">
                            {origLine?.item?.nama || line.doLineId}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0.0001"
                              step="any"
                              value={line.qty}
                              onChange={(e) => {
                                const upd = [...convertData.lines];
                                upd[idx].qty = Number(e.target.value);
                                setConvertData({ ...convertData, lines: upd });
                              }}
                              className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900 text-right"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.hargaSatuan}
                              onChange={(e) => {
                                const upd = [...convertData.lines];
                                upd[idx].hargaSatuan = Number(e.target.value);
                                setConvertData({ ...convertData, lines: upd });
                              }}
                              className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900 text-right"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.diskon}
                              onChange={(e) => {
                                const upd = [...convertData.lines];
                                upd[idx].diskon = Number(e.target.value);
                                setConvertData({ ...convertData, lines: upd });
                              }}
                              className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900 text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmConvert}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                {saving ? 'Memproses...' : 'Terbitkan Faktur (Invoice)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
