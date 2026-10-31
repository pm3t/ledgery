import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart,
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
  Truck,
  AlertCircle,
  Calendar,
  Building2,
  DollarSign,
  ChevronRight,
  Layers,
  X,
  RefreshCw,
  Archive,
  Info,
} from 'lucide-react';
import {
  api,
  Tenant,
  SalesOrder,
  SalesOrderLine,
  OrderStatus,
  BusinessPartner,
  Warehouse,
  Item,
} from '../../services/api';

interface SalesOrdersPageProps {
  currentTenant: Tenant | null;
  onNavigateToDo?: (soId?: string) => void;
  onNavigateToInvoice?: (soId?: string) => void;
}

interface SoLineItemForm {
  id?: string;
  itemId?: string;
  deskripsi: string;
  qty: number;
  harga: number;
  diskon: number;
  ppnRate: number;
  warehouseId?: string;
  stockInfo?: {
    onHand: number;
    ordered: number;
    available: number;
  };
}

export const SalesOrdersPage: React.FC<SalesOrdersPageProps> = ({
  currentTenant,
  onNavigateToDo,
  onNavigateToInvoice,
}) => {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [customers, setCustomers] = useState<BusinessPartner[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterCustomer, setFilterCustomer] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedSo, setSelectedSo] = useState<SalesOrder | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [showCloseModal, setShowCloseModal] = useState<boolean>(false);
  const [closeAlasan, setCloseAlasan] = useState<string>('');
  const [targetSoId, setTargetSoId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    tanggal: string;
    tanggalDiharapkan: string;
    partnerId: string;
    mata_uang: string;
    kurs: number;
    catatan: string;
    externalRef: string;
    lines: SoLineItemForm[];
  }>({
    tanggal: new Date().toISOString().split('T')[0],
    tanggalDiharapkan: '',
    partnerId: '',
    mata_uang: 'IDR',
    kurs: 1,
    catatan: '',
    externalRef: '',
    lines: [
      {
        deskripsi: '',
        qty: 1,
        harga: 0,
        diskon: 0,
        ppnRate: 11,
      },
    ],
  });

  const [saving, setSaving] = useState<boolean>(false);

  const fetchOrders = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getSalesOrders(currentTenant.id, {
        status: filterStatus !== 'ALL' ? filterStatus : undefined,
        partnerId: filterCustomer !== 'ALL' ? filterCustomer : undefined,
        search: searchQuery || undefined,
      });
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Gagal memuat pesanan penjualan:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuxData = async () => {
    if (!currentTenant) return;
    try {
      const [partnersData, warehousesData, itemsData] = await Promise.all([
        api.getBusinessPartners(currentTenant.id, { type: 'customer', isActive: true }),
        api.getWarehouses(currentTenant.id),
        api.getItems(currentTenant.id, { isActive: true }),
      ]);
      setCustomers(Array.isArray(partnersData) ? partnersData : []);
      setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
      setItems(Array.isArray(itemsData) ? itemsData : []);
    } catch (err) {
      console.error('Gagal memuat master data:', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchAuxData();
  }, [currentTenant, filterStatus, filterCustomer]);

  const calculatedTotals = useMemo(() => {
    let subtotal = 0;
    let totalDiskon = 0;
    let totalPpn = 0;

    formData.lines.forEach((l) => {
      const lineSubtotal = (Number(l.qty) || 0) * (Number(l.harga) || 0);
      const lineDiskon = Number(l.diskon) || 0;
      const taxable = Math.max(0, lineSubtotal - lineDiskon);
      const linePpn = (taxable * (Number(l.ppnRate) || 0)) / 100;

      subtotal += lineSubtotal;
      totalDiskon += lineDiskon;
      totalPpn += linePpn;
    });

    const grandTotal = subtotal - totalDiskon + totalPpn;
    return { subtotal, totalDiskon, totalPpn, grandTotal };
  }, [formData.lines]);

  const handleLineItemChange = async (index: number, itemId: string) => {
    const selected = items.find((i) => i.id === itemId);
    const updated = [...formData.lines];
    if (selected) {
      updated[index] = {
        ...updated[index],
        itemId: selected.id,
        deskripsi: selected.nama,
      };

      if (currentTenant) {
        try {
          const avail = await api.getStockAvailability(currentTenant.id, selected.id);
          updated[index].stockInfo = {
            onHand: avail.onHand || 0,
            ordered: avail.ordered || 0,
            available: avail.available || 0,
          };
        } catch (e) {
          console.error('Gagal memuat ketersediaan stok:', e);
        }
      }
    } else {
      updated[index] = {
        ...updated[index],
        itemId: undefined,
        stockInfo: undefined,
      };
    }
    setFormData({ ...formData, lines: updated });
  };

  const handleAddLine = () => {
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        {
          deskripsi: '',
          qty: 1,
          harga: 0,
          diskon: 0,
          ppnRate: 11,
        },
      ],
    });
  };

  const handleRemoveLine = (index: number) => {
    if (formData.lines.length <= 1) return;
    const updated = formData.lines.filter((_, i) => i !== index);
    setFormData({ ...formData, lines: updated });
  };

  const handleSubmit = async (targetStatus: OrderStatus) => {
    if (!currentTenant) return;
    if (!formData.partnerId) {
      alert('Pilih pelanggan terlebih dahulu.');
      return;
    }
    if (formData.lines.length === 0) {
      alert('Minimal 1 baris barang/jasa diperlukan.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        status: targetStatus,
        lines: formData.lines.map((l) => ({
          itemId: l.itemId || undefined,
          deskripsi: l.deskripsi,
          qty: Number(l.qty),
          harga: Number(l.harga),
          diskon: Number(l.diskon) || 0,
          ppnRate: Number(l.ppnRate) || 0,
          warehouseId: l.warehouseId || undefined,
        })),
      };

      await api.createSalesOrder(currentTenant.id, payload);
      setShowCreateModal(false);
      resetForm();
      fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan Sales Order.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOpen = async (id: string) => {
    if (!currentTenant || !confirm('Buka pesanan (OPEN) untuk Sales Order ini?')) return;
    try {
      await api.confirmOpenSo(currentTenant.id, id);
      fetchOrders();
      if (selectedSo?.id === id) {
        const updated = await api.getSalesOrder(currentTenant.id, id);
        setSelectedSo(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal membuka pesanan.');
    }
  };

  const handleCancel = async (id: string) => {
    const alasan = prompt('Masukkan alasan pembatalan SO:');
    if (alasan === null) return;
    if (!currentTenant) return;

    try {
      await api.cancelSo(currentTenant.id, id, alasan);
      fetchOrders();
      if (selectedSo?.id === id) {
        const updated = await api.getSalesOrder(currentTenant.id, id);
        setSelectedSo(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal membatalkan SO.');
    }
  };

  const handleClose = async () => {
    if (!currentTenant || !targetSoId) return;
    try {
      await api.closeSo(currentTenant.id, targetSoId, closeAlasan);
      setShowCloseModal(false);
      setTargetSoId(null);
      setCloseAlasan('');
      fetchOrders();
      if (selectedSo?.id === targetSoId) {
        const updated = await api.getSalesOrder(currentTenant.id, targetSoId);
        setSelectedSo(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menutup SO.');
    }
  };

  const resetForm = () => {
    setFormData({
      tanggal: new Date().toISOString().split('T')[0],
      tanggalDiharapkan: '',
      partnerId: '',
      mata_uang: currentTenant?.mata_uang || 'IDR',
      kurs: 1,
      catatan: '',
      externalRef: '',
      lines: [
        {
          deskripsi: '',
          qty: 1,
          harga: 0,
          diskon: 0,
          ppnRate: 11,
        },
      ],
    });
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            DRAFT
          </span>
        );
      case 'OPEN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            OPEN
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            SEBAGIAN
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            LENGKAP
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            DITUTUP
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            DIBATALKAN
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const summary = useMemo(() => {
    const totalCount = orders.length;
    const openCount = orders.filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL').length;
    const completedCount = orders.filter((o) => o.status === 'COMPLETED').length;
    const totalNominal = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    return { totalCount, openCount, completedCount, totalNominal };
  }, [orders]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-indigo-600" />
            Pesanan Penjualan (Sales Order)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kelola pesanan pelanggan, pantau stok tersedia & terpesan, serta jadwalkan pengiriman (DO).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors gap-2"
          >
            <Plus className="h-4 w-4" />
            Buat Sales Order
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Total Pesanan</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
            {summary.totalCount}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">
            Aktif (Open / Parsial)
          </p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {summary.openCount}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase">
            Selesai Terkirim
          </p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {summary.completedCount}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase">Total Nilai Penjualan</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
            Rp {summary.totalNominal.toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari no. SO, pelanggan, ref..."
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
              <option value="OPEN">Open</option>
              <option value="PARTIAL">Sebagian</option>
              <option value="COMPLETED">Lengkap</option>
              <option value="CLOSED">Ditutup Manual</option>
              <option value="CANCELLED">Dibatalkan</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Pelanggan:</span>
            <select
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white max-w-[200px]"
            >
              <option value="ALL">Semua Pelanggan</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">No. Dokumen</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Pelanggan</th>
                <th className="px-4 py-3 text-right">Total Order</th>
                <th className="px-4 py-3">Pengiriman (DO)</th>
                <th className="px-4 py-3">Penagihan (Inv)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    Memuat pesanan penjualan...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    Belum ada Sales Order yang sesuai kriteria.
                  </td>
                </tr>
              ) : (
                orders.map((so) => {
                  const totalQty = so.lines.reduce((s, l) => s + Number(l.qty), 0);
                  const totalShip = so.lines.reduce((s, l) => s + Number(l.qtyDikirim), 0);
                  const totalBill = so.lines.reduce((s, l) => s + Number(l.qtyDitagih), 0);

                  const shipPct = totalQty > 0 ? Math.min(100, Math.round((totalShip / totalQty) * 100)) : 0;
                  const billPct = totalQty > 0 ? Math.min(100, Math.round((totalBill / totalQty) * 100)) : 0;

                  return (
                    <tr
                      key={so.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        <div className="flex flex-col">
                          <span>{so.noDokumen}</span>
                          {so.externalRef && (
                            <span className="text-xs text-slate-400">PO Cust: {so.externalRef}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(so.tanggal).toLocaleDateString('id-ID')}
                        {so.tanggalDiharapkan && (
                          <div className="text-xs text-slate-400">
                            Exp: {new Date(so.tanggalDiharapkan).toLocaleDateString('id-ID')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {so.partner?.nama || '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {so.mata_uang} {Number(so.total).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1 w-28">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>
                              {totalShip} / {totalQty}
                            </span>
                            <span>{shipPct}%</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${shipPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${shipPct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1 w-28">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>
                              {totalBill} / {totalQty}
                            </span>
                            <span>{billPct}%</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${billPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${billPct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getStatusBadge(so.status)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedSo(so);
                              setShowDetailModal(true);
                            }}
                            className="p-1 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
                            title="Lihat Detail"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>

                          {so.status === 'DRAFT' && (
                            <button
                              onClick={() => handleConfirmOpen(so.id)}
                              className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded font-medium"
                            >
                              Buka (Open)
                            </button>
                          )}

                          {(so.status === 'OPEN' || so.status === 'PARTIAL') && (
                            <>
                              <button
                                onClick={() => {
                                  if (onNavigateToDo) onNavigateToDo(so.id);
                                }}
                                className="px-2 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded font-medium flex items-center gap-1"
                                title="Buat Surat Jalan (DO)"
                              >
                                <Truck className="h-3 w-3" />
                                Kirim
                              </button>
                              <button
                                onClick={() => {
                                  setTargetSoId(so.id);
                                  setShowCloseModal(true);
                                }}
                                className="p-1 text-purple-600 hover:text-purple-700 dark:text-purple-400"
                                title="Tutup Sisa SO (Force Close)"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            </>
                          )}

                          {so.status === 'DRAFT' && (
                            <button
                              onClick={() => handleCancel(so.id)}
                              className="p-1 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                              title="Batalkan SO"
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

      {/* Modal: Buat Sales Order */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-indigo-600" />
                Buat Sales Order Baru
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
                    Pelanggan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.partnerId}
                    onChange={(e) => setFormData({ ...formData, partnerId: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
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
                    Tanggal Order <span className="text-rose-500">*</span>
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
                    Target Kirim (Diharapkan)
                  </label>
                  <input
                    type="date"
                    value={formData.tanggalDiharapkan}
                    onChange={(e) =>
                      setFormData({ ...formData, tanggalDiharapkan: e.target.value })
                    }
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Mata Uang & Kurs
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.mata_uang}
                      onChange={(e) => setFormData({ ...formData, mata_uang: e.target.value })}
                      placeholder="IDR"
                      className="w-24 border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                    <input
                      type="number"
                      step="any"
                      value={formData.kurs}
                      onChange={(e) => setFormData({ ...formData, kurs: Number(e.target.value) })}
                      placeholder="Kurs"
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    No. PO Pelanggan (Ref)
                  </label>
                  <input
                    type="text"
                    value={formData.externalRef}
                    onChange={(e) => setFormData({ ...formData, externalRef: e.target.value })}
                    placeholder="Contoh: PO-CUST-889"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Catatan Pesanan
                  </label>
                  <input
                    type="text"
                    value={formData.catatan}
                    onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                    placeholder="Alamat kirim / instruksi invoice"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Rincian Barang & Jasa
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Baris
                  </button>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="p-2.5">Barang & Ketersediaan</th>
                        <th className="p-2.5">Deskripsi</th>
                        <th className="p-2.5 w-20">Qty</th>
                        <th className="p-2.5 w-32">Harga Satuan</th>
                        <th className="p-2.5 w-24">Diskon (Rp)</th>
                        <th className="p-2.5 w-20">PPN (%)</th>
                        <th className="p-2.5 w-28 text-right">Subtotal</th>
                        <th className="p-2.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {formData.lines.map((line, idx) => {
                        const lineSub = (Number(line.qty) || 0) * (Number(line.harga) || 0);
                        const disc = Number(line.diskon) || 0;
                        const tax = ((Math.max(0, lineSub - disc)) * (Number(line.ppnRate) || 0)) / 100;
                        const lineTotal = lineSub - disc + tax;

                        return (
                          <tr key={idx} className="bg-white dark:bg-slate-800">
                            <td className="p-2">
                              <select
                                value={line.itemId || ''}
                                onChange={(e) => handleLineItemChange(idx, e.target.value)}
                                className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900"
                              >
                                <option value="">-- Non-Stok / Custom --</option>
                                {items.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.kode} - {i.nama}
                                  </option>
                                ))}
                              </select>
                              {line.stockInfo && (
                                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                                  <span className="font-medium text-slate-600 dark:text-slate-400">
                                    Fisik: {line.stockInfo.onHand}
                                  </span>
                                  <span>|</span>
                                  <span className="text-amber-600">
                                    Terpesan: {line.stockInfo.ordered}
                                  </span>
                                  <span>|</span>
                                  <span
                                    className={`font-semibold ${
                                      line.stockInfo.available > 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-rose-500'
                                    }`}
                                  >
                                    Tersedia: {line.stockInfo.available}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={line.deskripsi}
                                onChange={(e) => {
                                  const upd = [...formData.lines];
                                  upd[idx].deskripsi = e.target.value;
                                  setFormData({ ...formData, lines: upd });
                                }}
                                placeholder="Deskripsi barang"
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
                                className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900 text-right"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.harga}
                                onChange={(e) => {
                                  const upd = [...formData.lines];
                                  upd[idx].harga = Number(e.target.value);
                                  setFormData({ ...formData, lines: upd });
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
                                  const upd = [...formData.lines];
                                  upd[idx].diskon = Number(e.target.value);
                                  setFormData({ ...formData, lines: upd });
                                }}
                                className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900 text-right"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.ppnRate}
                                onChange={(e) => {
                                  const upd = [...formData.lines];
                                  upd[idx].ppnRate = Number(e.target.value);
                                  setFormData({ ...formData, lines: upd });
                                }}
                                className="w-full border border-slate-300 dark:border-slate-600 rounded p-1 text-xs bg-white dark:bg-slate-900 text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-medium">
                              {lineTotal.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(idx)}
                                disabled={formData.lines.length <= 1}
                                className="text-slate-400 hover:text-rose-500 disabled:opacity-30"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end">
                <div className="w-72 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Subtotal:</span>
                    <span>Rp {calculatedTotals.subtotal.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Total Diskon:</span>
                    <span>- Rp {calculatedTotals.totalDiskon.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Total PPN:</span>
                    <span>+ Rp {calculatedTotals.totalPpn.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="border-t border-slate-300 dark:border-slate-700 pt-2 flex justify-between font-bold text-sm text-slate-900 dark:text-white">
                    <span>Total:</span>
                    <span>Rp {calculatedTotals.grandTotal.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSubmit('DRAFT')}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
                >
                  Simpan DRAFT
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSubmit('OPEN')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  {saving ? 'Menyimpan...' : 'Simpan & Buka (OPEN)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detail SO */}
      {showDetailModal && selectedSo && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-indigo-600" />
                  Detail Pesanan Penjualan: {selectedSo.noDokumen}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  ID: {selectedSo.id} {selectedSo.externalRef && `| Ref PO: ${selectedSo.externalRef}`}
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
                  <span className="text-slate-400">Pelanggan:</span>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {selectedSo.partner?.nama}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Tanggal SO:</span>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {new Date(selectedSo.tanggal).toLocaleDateString('id-ID')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Status:</span>
                  <div className="mt-1">{getStatusBadge(selectedSo.status)}</div>
                </div>
                <div>
                  <span className="text-slate-400">Total Nilai:</span>
                  <p className="font-semibold text-indigo-600 text-sm">
                    {selectedSo.mata_uang} {Number(selectedSo.total).toLocaleString('id-ID')}
                  </p>
                </div>
              </div>

              {selectedSo.catatan && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                  <span className="font-semibold">Catatan:</span> {selectedSo.catatan}
                </div>
              )}

              {/* Lines Fulfillment Matrix */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                  Matriks Pengiriman & Penagihan
                </h3>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="p-2.5">Barang / Deskripsi</th>
                        <th className="p-2.5 text-right">Dipesan</th>
                        <th className="p-2.5 text-right">Dikirim (DO)</th>
                        <th className="p-2.5 text-right">Ditagih (Inv)</th>
                        <th className="p-2.5 text-right">Sisa Kirim</th>
                        <th className="p-2.5 text-right">Harga Satuan</th>
                        <th className="p-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {selectedSo.lines.map((line) => {
                        const sisa = Math.max(0, Number(line.qty) - Number(line.qtyDikirim));
                        return (
                          <tr key={line.id} className="bg-white dark:bg-slate-800">
                            <td className="p-2.5">
                              <span className="font-medium text-slate-900 dark:text-white">
                                {line.item ? `${line.item.kode} - ${line.item.nama}` : line.deskripsi}
                              </span>
                              {line.item && (
                                <p className="text-[11px] text-slate-400">{line.deskripsi}</p>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-semibold">
                              {Number(line.qty).toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right text-blue-600 font-semibold">
                              {Number(line.qtyDikirim).toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right text-emerald-600 font-semibold">
                              {Number(line.qtyDitagih).toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right text-amber-600 font-semibold">
                              {sisa.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right">
                              {Number(line.harga).toLocaleString('id-ID')}
                            </td>
                            <td className="p-2.5 text-right font-medium">
                              {(Number(line.qty) * Number(line.harga)).toLocaleString('id-ID')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
              <div className="flex gap-2">
                {(selectedSo.status === 'OPEN' || selectedSo.status === 'PARTIAL') && (
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      if (onNavigateToDo) onNavigateToDo(selectedSo.id);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Truck className="h-4 w-4" />
                    Proses Pengiriman (Surat Jalan DO)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tutup SO (Force Close) */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Archive className="h-5 w-5 text-purple-600" />
              Tutup Sisa Pesanan Penjualan
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Menutup SO akan membatalkan sisa kuantitas yang belum dikirim dan mengubah status SO menjadi <strong>CLOSED</strong>.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Alasan Penutupan:
              </label>
              <textarea
                value={closeAlasan}
                onChange={(e) => setCloseAlasan(e.target.value)}
                placeholder="Misal: Pelanggan membatalkan sisa pengiriman"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCloseModal(false);
                  setTargetSoId(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium"
              >
                Konfirmasi Tutup SO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
