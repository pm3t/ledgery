import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Package,
  Truck,
  Layers,
  RefreshCw,
  Building2,
  Calendar,
  DollarSign,
  PieChart,
  BarChart2,
  Scale,
} from 'lucide-react';
import { api, Tenant } from '../../services/api';

interface OrderReportsPageProps {
  currentTenant: Tenant | null;
}

export const OrderReportsPage: React.FC<OrderReportsPageProps> = ({ currentTenant }) => {
  const [activeTab, setActiveTab] = useState<'outstanding' | 'fulfillment' | 'gr-ir'>('outstanding');
  const [loading, setLoading] = useState<boolean>(false);

  // Filters
  const [reportType, setReportType] = useState<'ALL' | 'PO' | 'SO'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Report Data States
  const [outstandingData, setOutstandingData] = useState<any>({
    purchaseOrders: [],
    salesOrders: [],
    totalOutstandingPoValue: 0,
    totalOutstandingSoValue: 0,
  });

  const [fulfillmentData, setFulfillmentData] = useState<any>({
    poFulfillments: [],
    soFulfillments: [],
  });

  const [grIrData, setGrIrData] = useState<any>(null);

  const fetchCurrentReport = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      if (activeTab === 'outstanding') {
        const data = await api.getOutstandingOrdersReport(currentTenant.id, {
          type: reportType,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });
        setOutstandingData(data);
      } else if (activeTab === 'fulfillment') {
        const data = await api.getOrderFulfillmentReport(currentTenant.id, {
          type: reportType,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });
        setFulfillmentData(data);
      } else if (activeTab === 'gr-ir') {
        const data = await api.getGrIrClearingReport(currentTenant.id);
        setGrIrData(data);
      }
    } catch (err) {
      console.error('Gagal memuat laporan pesanan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentReport();
  }, [currentTenant, activeTab, reportType]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart2 className="h-7 w-7 text-indigo-600" />
            Laporan & Rekonsiliasi Pesanan
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Analisis pesanan yang belum terpenuhi, matriks pemenuhan (dipesan vs dikirim/diterima vs ditagih), dan audit rekonsiliasi kliring GR/IR.
          </p>
        </div>
        <button
          onClick={fetchCurrentReport}
          className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 text-xs font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          Perbarui Data
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('outstanding')}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'outstanding'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Clock className="h-4 w-4" />
          Pesanan Belum Terpenuhi (Outstanding)
        </button>
        <button
          onClick={() => setActiveTab('fulfillment')}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'fulfillment'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Layers className="h-4 w-4" />
          Matriks Pemenuhan (Fulfillment)
        </button>
        <button
          onClick={() => setActiveTab('gr-ir')}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'gr-ir'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Scale className="h-4 w-4" />
          Rekonsiliasi Kliring GR/IR
        </button>
      </div>

      {/* Filter Bar (for outstanding & fulfillment) */}
      {activeTab !== 'gr-ir' && (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Tipe Pesanan:</span>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              <option value="ALL">Semua (PO & SO)</option>
              <option value="PO">Hanya Pembelian (PO)</option>
              <option value="SO">Hanya Penjualan (SO)</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Periode:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
            <span className="text-xs text-slate-400">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
            <button
              onClick={fetchCurrentReport}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium"
            >
              Terapkan
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: OUTSTANDING ORDERS */}
      {activeTab === 'outstanding' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">
                Outstanding PO (Belum Diterima dari Vendor)
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                Rp {Number(outstandingData.totalOutstandingPoValue || 0).toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {outstandingData.purchaseOrders?.length || 0} nomor PO aktif menunggu barang
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase">
                Outstanding SO (Belum Dikirim ke Pelanggan)
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                Rp {Number(outstandingData.totalOutstandingSoValue || 0).toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {outstandingData.salesOrders?.length || 0} nomor SO aktif menunggu pengiriman
              </p>
            </div>
          </div>

          {/* PO Outstanding Section */}
          {(reportType === 'ALL' || reportType === 'PO') && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  Pesanan Pembelian Belum Diterima (Outstanding PO)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="p-3">No. PO</th>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Umur Order</th>
                      <th className="p-3">Barang / Deskripsi</th>
                      <th className="p-3 text-right">Qty Pesan</th>
                      <th className="p-3 text-right">Qty Terima</th>
                      <th className="p-3 text-right">Sisa Belum Diterima</th>
                      <th className="p-3 text-right">Nilai Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="text-center py-6 text-slate-400">
                          Memuat data...
                        </td>
                      </tr>
                    ) : outstandingData.purchaseOrders?.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-6 text-slate-400">
                          Tidak ada PO outstanding.
                        </td>
                      </tr>
                    ) : (
                      outstandingData.purchaseOrders?.flatMap((po: any) =>
                        po.lines.map((l: any, idx: number) => (
                          <tr key={`${po.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            {idx === 0 ? (
                              <>
                                <td className="p-3 font-semibold text-slate-900 dark:text-white" rowSpan={po.lines.length}>
                                  {po.noDokumen}
                                </td>
                                <td className="p-3 whitespace-nowrap" rowSpan={po.lines.length}>
                                  {new Date(po.tanggal).toLocaleDateString('id-ID')}
                                </td>
                                <td className="p-3 font-medium" rowSpan={po.lines.length}>
                                  {po.vendorNama}
                                </td>
                                <td className="p-3 whitespace-nowrap" rowSpan={po.lines.length}>
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${po.umurHari > 14 ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30' : 'bg-slate-100 text-slate-700'}`}>
                                    {po.umurHari} hari
                                  </span>
                                </td>
                              </>
                            ) : null}
                            <td className="p-3">
                              {l.itemKode} - {l.itemNama}
                            </td>
                            <td className="p-3 text-right">{l.qtyDipesan}</td>
                            <td className="p-3 text-right text-emerald-600 font-medium">{l.qtyDiterima}</td>
                            <td className="p-3 text-right text-rose-600 font-semibold">{l.sisaQty} {l.satuan}</td>
                            <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">
                              Rp {l.sisaNilai.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SO Outstanding Section */}
          {(reportType === 'ALL' || reportType === 'SO') && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Truck className="h-4 w-4 text-emerald-600" />
                  Pesanan Penjualan Belum Dikirim (Outstanding SO)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="p-3">No. SO</th>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Pelanggan</th>
                      <th className="p-3">Umur Order</th>
                      <th className="p-3">Barang / Deskripsi</th>
                      <th className="p-3 text-right">Qty Pesan</th>
                      <th className="p-3 text-right">Qty Kirim</th>
                      <th className="p-3 text-right">Sisa Belum Dikirim</th>
                      <th className="p-3 text-right">Nilai Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="text-center py-6 text-slate-400">
                          Memuat data...
                        </td>
                      </tr>
                    ) : outstandingData.salesOrders?.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-6 text-slate-400">
                          Tidak ada SO outstanding.
                        </td>
                      </tr>
                    ) : (
                      outstandingData.salesOrders?.flatMap((so: any) =>
                        so.lines.map((l: any, idx: number) => (
                          <tr key={`${so.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            {idx === 0 ? (
                              <>
                                <td className="p-3 font-semibold text-slate-900 dark:text-white" rowSpan={so.lines.length}>
                                  {so.noDokumen}
                                </td>
                                <td className="p-3 whitespace-nowrap" rowSpan={so.lines.length}>
                                  {new Date(so.tanggal).toLocaleDateString('id-ID')}
                                </td>
                                <td className="p-3 font-medium" rowSpan={so.lines.length}>
                                  {so.customerNama}
                                </td>
                                <td className="p-3 whitespace-nowrap" rowSpan={so.lines.length}>
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${so.umurHari > 14 ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30' : 'bg-slate-100 text-slate-700'}`}>
                                    {so.umurHari} hari
                                  </span>
                                </td>
                              </>
                            ) : null}
                            <td className="p-3">
                              {l.itemKode} - {l.itemNama}
                            </td>
                            <td className="p-3 text-right">{l.qtyDipesan}</td>
                            <td className="p-3 text-right text-emerald-600 font-medium">{l.qtyDikirim}</td>
                            <td className="p-3 text-right text-rose-600 font-semibold">{l.sisaQty} {l.satuan}</td>
                            <td className="p-3 text-right font-semibold text-slate-900 dark:text-white">
                              Rp {l.sisaNilai.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ORDER FULFILLMENT */}
      {activeTab === 'fulfillment' && (
        <div className="space-y-6">
          {/* PO Fulfillment */}
          {(reportType === 'ALL' || reportType === 'PO') && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  Matriks Pemenuhan Pembelian (PO $\rightarrow$ GR $\rightarrow$ Bill)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="p-3">No. PO</th>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Barang</th>
                      <th className="p-3 text-right">Dipesan</th>
                      <th className="p-3 text-right">Diterima</th>
                      <th className="p-3 text-right">Ditagih</th>
                      <th className="p-3">Progres Fisik</th>
                      <th className="p-3">Progres Tagihan</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="text-center py-6 text-slate-400">
                          Memuat data...
                        </td>
                      </tr>
                    ) : fulfillmentData.poFulfillments?.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-6 text-slate-400">
                          Belum ada data pemenuhan PO.
                        </td>
                      </tr>
                    ) : (
                      fulfillmentData.poFulfillments?.flatMap((po: any) =>
                        po.lines.map((l: any, idx: number) => (
                          <tr key={`${po.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            {idx === 0 ? (
                              <>
                                <td className="p-3 font-semibold text-slate-900 dark:text-white" rowSpan={po.lines.length}>
                                  {po.noDokumen}
                                </td>
                                <td className="p-3 whitespace-nowrap" rowSpan={po.lines.length}>
                                  {new Date(po.tanggal).toLocaleDateString('id-ID')}
                                </td>
                                <td className="p-3 font-medium" rowSpan={po.lines.length}>
                                  {po.vendorNama}
                                </td>
                              </>
                            ) : null}
                            <td className="p-3">{l.itemKode} - {l.itemNama}</td>
                            <td className="p-3 text-right font-medium">{l.qtyDipesan}</td>
                            <td className="p-3 text-right text-blue-600 font-medium">{l.qtyDiterima}</td>
                            <td className="p-3 text-right text-emerald-600 font-medium">{l.qtyDitagih}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 w-24">
                                <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${l.persenDiterima >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(100, l.persenDiterima)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-500">{l.persenDiterima}%</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 w-24">
                                <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${l.persenDitagih >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(100, l.persenDitagih)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-500">{l.persenDitagih}%</span>
                              </div>
                            </td>
                            {idx === 0 ? (
                              <td className="p-3 text-center" rowSpan={po.lines.length}>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {po.status}
                                </span>
                              </td>
                            ) : null}
                          </tr>
                        ))
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SO Fulfillment */}
          {(reportType === 'ALL' || reportType === 'SO') && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Truck className="h-4 w-4 text-emerald-600" />
                  Matriks Pemenuhan Penjualan (SO $\rightarrow$ DO $\rightarrow$ Invoice)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="p-3">No. SO</th>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Pelanggan</th>
                      <th className="p-3">Barang</th>
                      <th className="p-3 text-right">Dipesan</th>
                      <th className="p-3 text-right">Dikirim</th>
                      <th className="p-3 text-right">Ditagih</th>
                      <th className="p-3">Progres Kirim</th>
                      <th className="p-3">Progres Faktur</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="text-center py-6 text-slate-400">
                          Memuat data...
                        </td>
                      </tr>
                    ) : fulfillmentData.soFulfillments?.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-6 text-slate-400">
                          Belum ada data pemenuhan SO.
                        </td>
                      </tr>
                    ) : (
                      fulfillmentData.soFulfillments?.flatMap((so: any) =>
                        so.lines.map((l: any, idx: number) => (
                          <tr key={`${so.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            {idx === 0 ? (
                              <>
                                <td className="p-3 font-semibold text-slate-900 dark:text-white" rowSpan={so.lines.length}>
                                  {so.noDokumen}
                                </td>
                                <td className="p-3 whitespace-nowrap" rowSpan={so.lines.length}>
                                  {new Date(so.tanggal).toLocaleDateString('id-ID')}
                                </td>
                                <td className="p-3 font-medium" rowSpan={so.lines.length}>
                                  {so.customerNama}
                                </td>
                              </>
                            ) : null}
                            <td className="p-3">{l.itemKode} - {l.itemNama}</td>
                            <td className="p-3 text-right font-medium">{l.qtyDipesan}</td>
                            <td className="p-3 text-right text-blue-600 font-medium">{l.qtyDikirim}</td>
                            <td className="p-3 text-right text-emerald-600 font-medium">{l.qtyDitagih}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 w-24">
                                <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${l.persenDikirim >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(100, l.persenDikirim)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-500">{l.persenDikirim}%</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 w-24">
                                <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${l.persenDitagih >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(100, l.persenDitagih)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-500">{l.persenDitagih}%</span>
                              </div>
                            </td>
                            {idx === 0 ? (
                              <td className="p-3 text-center" rowSpan={so.lines.length}>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {so.status}
                                </span>
                              </td>
                            ) : null}
                          </tr>
                        ))
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GR/IR CLEARING RECONCILIATION */}
      {activeTab === 'gr-ir' && grIrData && (
        <div className="space-y-6">
          {/* Status Alert Banner */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              grIrData.statusRekonsiliasi === 'RECONCILED'
                ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            {grIrData.statusRekonsiliasi === 'RECONCILED' ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-rose-600 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="font-bold text-sm">
                Status Rekonsiliasi Kliring GR/IR:{' '}
                {grIrData.statusRekonsiliasi === 'RECONCILED'
                  ? 'COCOK SEMPURNA (RECONCILED)'
                  : 'DITEMUKAN SELISIH'}
              </h4>
              <p className="text-xs mt-1">{grIrData.keterangan}</p>
            </div>
          </div>

          {/* Audit Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase">Akun Kliring GR/IR</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                {grIrData.grIrAccount?.kode || 'Belum Diatur'}
              </p>
              <p className="text-xs text-slate-400">
                {grIrData.grIrAccount?.nama || 'PostingSetup: GR_IR_CLEARING'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <p className="text-xs font-medium text-blue-600 uppercase">Saldo Buku Besar (GL)</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                Rp {Number(grIrData.glBalance || 0).toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-slate-400">Posisi Kredit Bersih di GL</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <p className="text-xs font-medium text-indigo-600 uppercase">Total Subledger Belum Ditagih</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                Rp {Number(grIrData.totalSubledgerUnbilled || 0).toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-slate-400">{grIrData.items?.length || 0} baris GR belum ditagih</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <p className="text-xs font-medium text-rose-600 uppercase">Selisih Rekonsiliasi</p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  Math.abs(Number(grIrData.selisih || 0)) < 0.01 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                Rp {Number(grIrData.selisih || 0).toLocaleString('id-ID')}
              </p>
              <p className="text-xs text-slate-400">GL minus Subledger</p>
            </div>
          </div>

          {/* Unbilled GR Line Items Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Rincian Barang Diterima Belum Ditagih (Unbilled Goods Receipts)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="p-3">No. GR</th>
                    <th className="p-3">Tanggal</th>
                    <th className="p-3">PO Asal</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Gudang</th>
                    <th className="p-3">Barang</th>
                    <th className="p-3 text-right">Qty Terima</th>
                    <th className="p-3 text-right">Qty Ditagih</th>
                    <th className="p-3 text-right">Sisa Belum Ditagih</th>
                    <th className="p-3 text-right">Biaya Satuan</th>
                    <th className="p-3 text-right">Nilai Belum Ditagih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {grIrData.items?.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-6 text-slate-400">
                        Tidak ada penerimaan barang yang tertunda penagihan.
                      </td>
                    </tr>
                  ) : (
                    grIrData.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">{item.noGr}</td>
                        <td className="p-3 whitespace-nowrap">{new Date(item.tanggalGr).toLocaleDateString('id-ID')}</td>
                        <td className="p-3 text-indigo-600 font-medium">{item.noPo}</td>
                        <td className="p-3 font-medium">{item.vendorNama}</td>
                        <td className="p-3">{item.warehouseNama}</td>
                        <td className="p-3">{item.itemKode} - {item.itemNama}</td>
                        <td className="p-3 text-right">{item.qtyDiterima}</td>
                        <td className="p-3 text-right text-emerald-600">{item.qtyDitagih}</td>
                        <td className="p-3 text-right text-amber-600 font-semibold">{item.sisaQtyBelumDitagih} {item.satuan}</td>
                        <td className="p-3 text-right">Rp {Number(item.biayaSatuan).toLocaleString('id-ID')}</td>
                        <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                          Rp {Number(item.nilaiBelumDitagih).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

