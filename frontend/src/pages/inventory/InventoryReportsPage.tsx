import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Layers,
  Calendar,
  Building2,
  Package,
  Search,
  Download,
  Filter,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  Clock,
  DollarSign,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { api, Tenant, Warehouse, Item } from '../../services/api';

interface InventoryReportsPageProps {
  currentTenant: Tenant | null;
}

export const InventoryReportsPage: React.FC<InventoryReportsPageProps> = ({ currentTenant }) => {
  const [activeTab, setActiveTab] = useState<'current' | 'card' | 'fifo' | 'valuation'>('current');

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockItems, setStockItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  // Tab 1: Current Stock
  const [currentWarehouseId, setCurrentWarehouseId] = useState('');
  const [currentSearch, setCurrentSearch] = useState('');
  const [currentGroupCode, setCurrentGroupCode] = useState('');
  const [currentStockData, setCurrentStockData] = useState<any[]>([]);

  // Tab 2: Stock Card
  const [cardItemId, setCardItemId] = useState('');
  const [cardWarehouseId, setCardWarehouseId] = useState('');
  const [cardStartDate, setCardStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [cardEndDate, setCardEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockCardData, setStockCardData] = useState<any | null>(null);
  const [expandedMovements, setExpandedMovements] = useState<Record<number, boolean>>({});

  // Tab 3: FIFO Layers & Aging
  const [fifoItemId, setFifoItemId] = useState('');
  const [fifoWarehouseId, setFifoWarehouseId] = useState('');
  const [fifoData, setFifoData] = useState<any | null>(null);
  const [expandedFifoItems, setExpandedFifoItems] = useState<Record<string, boolean>>({});

  // Tab 4: Valuation As-Of Date
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().split('T')[0]);
  const [valuationWarehouseId, setValuationWarehouseId] = useState('');
  const [valuationData, setValuationData] = useState<any | null>(null);

  // Initial load of master warehouses and items
  useEffect(() => {
    if (!currentTenant) return;
    const fetchMasters = async () => {
      try {
        const [whRes, itemRes] = await Promise.all([
          api.getWarehouses(currentTenant.id, true),
          api.getItems(currentTenant.id, { tipe: 'STOK', isActive: true }),
        ]);
        const whList = Array.isArray(whRes) ? whRes : [];
        const itList = Array.isArray(itemRes) ? itemRes : [];
        setWarehouses(whList);
        setStockItems(itList);

        if (itList.length > 0) setCardItemId(itList[0].id);
        if (whList.length > 0) {
          setCardWarehouseId(whList[0].id);
        }
      } catch (err) {
        console.error('Failed to load masters for inventory reports', err);
      }
    };
    fetchMasters();
  }, [currentTenant]);

  // Load Tab 1
  const loadCurrentStock = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getCurrentStockReport(currentTenant.id, {
        warehouseId: currentWarehouseId || undefined,
        search: currentSearch || undefined,
        groupCode: currentGroupCode || undefined,
      });
      setCurrentStockData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'current') {
      loadCurrentStock();
    }
  }, [activeTab, currentTenant, currentWarehouseId, currentGroupCode]);

  // Load Tab 2
  const loadStockCard = async () => {
    if (!currentTenant || !cardItemId || !cardWarehouseId) return;
    setLoading(true);
    try {
      const data = await api.getStockCardReport(
        currentTenant.id,
        cardItemId,
        cardWarehouseId,
        cardStartDate,
        cardEndDate
      );
      setStockCardData(data);
    } catch (err) {
      console.error(err);
      setStockCardData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'card') {
      loadStockCard();
    }
  }, [activeTab, currentTenant, cardItemId, cardWarehouseId, cardStartDate, cardEndDate]);

  // Load Tab 3
  const loadFifoLayers = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getFifoLayersReport(
        currentTenant.id,
        fifoItemId || undefined,
        fifoWarehouseId || undefined
      );
      setFifoData(data);
    } catch (err) {
      console.error(err);
      setFifoData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'fifo') {
      loadFifoLayers();
    }
  }, [activeTab, currentTenant, fifoItemId, fifoWarehouseId]);

  // Load Tab 4
  const loadValuation = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getInventoryValuationReport(
        currentTenant.id,
        valuationDate,
        valuationWarehouseId || undefined
      );
      setValuationData(data);
    } catch (err) {
      console.error(err);
      setValuationData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'valuation') {
      loadValuation();
    }
  }, [activeTab, currentTenant, valuationDate, valuationWarehouseId]);

  // Export functions
  const exportCurrentStockCsv = () => {
    if (currentStockData.length === 0) return;
    const headers = ['Kode Barang,Nama Barang,Kategori,Satuan,Metode,Kode Gudang,Nama Gudang,Qty,Biaya Rata-rata,Total Nilai'];
    const rows = currentStockData.map((d) =>
      [
        `"${d.itemKode}"`,
        `"${d.itemNama}"`,
        `"${d.groupCode || ''}"`,
        `"${d.satuan}"`,
        `"${d.valuationMethod}"`,
        `"${d.warehouseKode}"`,
        `"${d.warehouseNama}"`,
        d.qty,
        d.biayaRataRata,
        d.totalNilai,
      ].join(',')
    );
    const blob = new Blob([headers.concat(rows).join('\n')], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `Stok_Saat_Ini_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportStockCardCsv = () => {
    if (!stockCardData || !stockCardData.mutasi) return;
    const headers = ['Tanggal,Tipe,No Dokumen,Qty,Biaya Satuan,Nilai Mutasi,Saldo Qty,Saldo Nilai'];
    const rows = stockCardData.mutasi.map((m: any) =>
      [
        `"${m.tanggal}"`,
        `"${m.tipe}"`,
        `"${m.noDokumen || ''}"`,
        m.qty,
        m.biayaSatuan,
        m.nilai,
        m.saldoQty,
        m.saldoNilai,
      ].join(',')
    );
    const blob = new Blob([headers.concat(rows).join('\n')], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `Kartu_Stok_${stockCardData.item?.kode}_${cardStartDate}_${cardEndDate}.csv`);
  };

  const exportFifoLayersCsv = () => {
    if (!fifoData || !fifoData.items) return;
    const headers = ['Kode Barang,Nama Barang,Gudang,Tanggal Masuk,Umur (Hari),Qty Awal,Qty Sisa,Biaya Satuan,Total Nilai'];
    const rows: string[] = [];
    fifoData.items.forEach((it: any) => {
      it.layers.forEach((l: any) => {
        rows.push(
          [
            `"${it.itemKode}"`,
            `"${it.itemNama}"`,
            `"${it.warehouseNama}"`,
            `"${l.tanggalMasuk}"`,
            l.umurHari,
            l.qtyAwal,
            l.qtySisa,
            l.biayaSatuan,
            l.totalNilai,
          ].join(',')
        );
      });
    });
    const blob = new Blob([headers.concat(rows).join('\n')], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `Lapisan_FIFO_Aging_${new Date().toISOString().split('T')[0]}.csv`);
  };

  // Grand totals for current stock
  const currentTotalQty = currentStockData.reduce((sum, d) => sum + Number(d.qty || 0), 0);
  const currentTotalNilai = currentStockData.reduce((sum, d) => sum + Number(d.totalNilai || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-indigo-600" />
            Laporan Persediaan & Valuasi
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Pantau posisi stok riil, buku mutasi kartu stok, audit lapisan biaya FIFO, dan evaluasi nilai persediaan.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-6 pt-3 rounded-t-xl">
        <button
          onClick={() => setActiveTab('current')}
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'current'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package className="w-4 h-4" />
          Stok Saat Ini
        </button>
        <button
          onClick={() => setActiveTab('card')}
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'card'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Kartu Stok (Mutasi)
        </button>
        <button
          onClick={() => setActiveTab('fifo')}
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'fifo'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          Lapisan FIFO & Aging
        </button>
        <button
          onClick={() => setActiveTab('valuation')}
          className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'valuation'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Valuasi Posisi Tanggal
        </button>
      </div>

      {/* TAB 1: STOK SAAT INI */}
      {activeTab === 'current' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase">Jumlah Baris Stok</span>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {currentStockData.length.toLocaleString('id-ID')} Baris
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase">Total Kuantitas Fisik</span>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {currentTotalQty.toLocaleString('id-ID')}
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase">Total Nilai Buku Persediaan</span>
              <div className="text-2xl font-bold text-indigo-600 mt-1">
                Rp {currentTotalNilai.toLocaleString('id-ID', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari kode atau nama barang..."
                value={currentSearch}
                onChange={(e) => setCurrentSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadCurrentStock()}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={currentWarehouseId}
              onChange={(e) => setCurrentWarehouseId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Semua Gudang</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.kode} - {w.nama}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Filter Kategori"
              value={currentGroupCode}
              onChange={(e) => setCurrentGroupCode(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
            />
            <button
              onClick={exportCurrentStockCsv}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Ekspor CSV
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Barang</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Kategori</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Metode</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Gudang</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty On Hand</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Biaya Satuan Rata-rata</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Nilai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        Memuat data stok...
                      </td>
                    </tr>
                  ) : currentStockData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        Tidak ada data stok untuk kriteria yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    currentStockData.map((d, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{d.itemNama}</div>
                          <div className="text-xs text-gray-500 font-mono">{d.itemKode}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{d.groupCode || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                              d.valuationMethod === 'FIFO'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {d.valuationMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          {d.warehouseKode} - {d.warehouseNama}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {Number(d.qty).toLocaleString('id-ID')} {d.satuan}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          Rp {Number(d.biayaRataRata).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600">
                          Rp {Number(d.totalNilai).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
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

      {/* TAB 2: KARTU STOK */}
      {activeTab === 'card' && (
        <div className="space-y-6">
          {/* Card Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Pilih Barang *</label>
              <select
                value={cardItemId}
                onChange={(e) => setCardItemId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {stockItems.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.kode} - {it.nama} ({it.valuationMethod})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Pilih Gudang *</label>
              <select
                value={cardWarehouseId}
                onChange={(e) => setCardWarehouseId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.kode} - {w.nama}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={cardStartDate}
                onChange={(e) => setCardStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={cardEndDate}
                onChange={(e) => setCardEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {stockCardData && (
            <div className="space-y-4">
              {/* Header Info Banner */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {stockCardData.item?.nama} ({stockCardData.item?.kode})
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Gudang: {stockCardData.warehouse?.nama} ({stockCardData.warehouse?.kode}) | Metode:{' '}
                    <span className="font-mono font-semibold">{stockCardData.item?.valuationMethod}</span>
                  </p>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-xs text-gray-500 block">Saldo Awal</span>
                    <span className="font-semibold text-gray-800">
                      {Number(stockCardData.saldoAwal?.qty || 0).toLocaleString('id-ID')} {stockCardData.item?.satuan} (Rp{' '}
                      {Number(stockCardData.saldoAwal?.nilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })})
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Saldo Akhir</span>
                    <span className="font-bold text-indigo-600">
                      {Number(stockCardData.saldoAkhir?.qty || 0).toLocaleString('id-ID')} {stockCardData.item?.satuan} (Rp{' '}
                      {Number(stockCardData.saldoAkhir?.nilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })})
                    </span>
                  </div>
                  <button
                    onClick={exportStockCardCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </div>

              {/* Mutasi Table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tanggal</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipe Mutasi</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">No Dokumen</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Kuantitas</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Biaya Satuan</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Nilai Mutasi</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {/* Saldo Awal Row */}
                    <tr className="bg-gray-50/50 font-medium">
                      <td className="px-4 py-2.5 text-gray-500">{cardStartDate}</td>
                      <td colSpan={2} className="px-4 py-2.5 text-gray-700">SALDO AWAL</td>
                      <td className="px-4 py-2.5 text-right">-</td>
                      <td className="px-4 py-2.5 text-right">-</td>
                      <td className="px-4 py-2.5 text-right">-</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                        {Number(stockCardData.saldoAwal?.qty || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                        Rp {Number(stockCardData.saldoAwal?.nilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>

                    {/* Movements */}
                    {stockCardData.mutasi.map((m: any, idx: number) => {
                      const isQtyPositive = Number(m.qty) > 0;
                      const hasLayers = m.consumedLayers && m.consumedLayers.length > 0;
                      const isExpanded = !!expandedMovements[idx];

                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-600">
                              {new Date(m.tanggal).toLocaleDateString('id-ID')}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-medium text-xs text-gray-800">{m.tipe}</span>
                              {hasLayers && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMovements({ ...expandedMovements, [idx]: !isExpanded })
                                  }
                                  className="ml-2 inline-flex items-center text-xs text-indigo-600 hover:text-indigo-800 underline"
                                >
                                  {isExpanded ? 'Tutup Lapisan' : 'Lihat Lapisan FIFO'}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                              {m.noDokumen || '-'}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right font-bold ${
                                isQtyPositive ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {isQtyPositive ? `+${m.qty}` : m.qty}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700">
                              Rp {Number(m.biayaSatuan).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-900 font-semibold">
                              Rp {Number(m.nilai).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                              {Number(m.saldoQty).toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                              Rp {Number(m.saldoNilai).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>

                          {/* Expanded FIFO layers consumed detail */}
                          {hasLayers && isExpanded && (
                            <tr className="bg-purple-50/50">
                              <td colSpan={8} className="px-6 py-3">
                                <div className="text-xs font-semibold text-purple-900 mb-1.5">
                                  Rincian Lapisan FIFO yang Dikonsumsi Pengeluaran Ini:
                                </div>
                                <div className="border border-purple-200 rounded-lg overflow-hidden bg-white">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-purple-100/60 text-purple-900">
                                      <tr>
                                        <th className="px-3 py-1.5 text-left">Tanggal Lapisan Masuk</th>
                                        <th className="px-3 py-1.5 text-right">Qty Dikonsumsi</th>
                                        <th className="px-3 py-1.5 text-right">Biaya Satuan Lapisan</th>
                                        <th className="px-3 py-1.5 text-right">Total HPP Lapisan</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-purple-100">
                                      {m.consumedLayers.map((c: any, ci: number) => (
                                        <tr key={ci}>
                                          <td className="px-3 py-1.5 text-gray-700">
                                            {c.layer?.tanggalMasuk
                                              ? new Date(c.layer.tanggalMasuk).toLocaleDateString('id-ID')
                                              : '-'}
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-semibold text-purple-700">
                                            {Number(c.qty).toLocaleString('id-ID')}
                                          </td>
                                          <td className="px-3 py-1.5 text-right text-gray-700">
                                            Rp {Number(c.biayaSatuan).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-bold text-gray-900">
                                            Rp {(Number(c.qty) * Number(c.biayaSatuan)).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FIFO LAYERS & AGING */}
      {activeTab === 'fifo' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <select
              value={fifoWarehouseId}
              onChange={(e) => setFifoWarehouseId(e.target.value)}
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
              value={fifoItemId}
              onChange={(e) => setFifoItemId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Semua Barang FIFO</option>
              {stockItems
                .filter((it) => it.valuationMethod === 'FIFO')
                .map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.kode} - {it.nama}
                  </option>
                ))}
            </select>
            <button
              onClick={exportFifoLayersCsv}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 ml-auto"
            >
              <Download className="w-4 h-4" /> Ekspor CSV
            </button>
          </div>

          {fifoData && (
            <div className="space-y-6">
              {/* Grand Total Card */}
              <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 rounded-xl shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-semibold text-purple-200">
                    Grand Total Nilai Persediaan FIFO Aktif
                  </span>
                  <div className="text-3xl font-bold mt-1">
                    Rp {Number(fifoData.grandTotalNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-purple-200 mt-1">
                    Berdasarkan lapisan biaya aktual yang belum habis terkonsumsi
                  </p>
                </div>
              </div>

              {/* Items List with Layers and Aging */}
              <div className="space-y-4">
                {fifoData.items?.length === 0 ? (
                  <div className="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500">
                    Tidak ada lapisan stok FIFO aktif untuk filter ini.
                  </div>
                ) : (
                  fifoData.items?.map((it: any) => {
                    const isExp = !!expandedFifoItems[it.itemId + it.warehouseId];
                    return (
                      <div
                        key={it.itemId + it.warehouseId}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                      >
                        <div
                          onClick={() =>
                            setExpandedFifoItems({
                              ...expandedFifoItems,
                              [it.itemId + it.warehouseId]: !isExp,
                            })
                          }
                          className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 cursor-pointer hover:bg-gray-50/80 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {isExp ? (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            )}
                            <div>
                              <h4 className="font-bold text-gray-900">{it.itemNama}</h4>
                              <p className="text-xs text-gray-500 font-mono">
                                {it.itemKode} • Gudang: {it.warehouseNama} ({it.warehouseKode})
                              </p>
                            </div>
                          </div>

                          {/* Aging Buckets Mini Table */}
                          <div className="flex items-center gap-4 text-xs">
                            <div className="text-center px-2 py-1 bg-emerald-50 text-emerald-800 rounded border border-emerald-200">
                              <span className="block font-semibold">0-30 Hari</span>
                              <span>Rp {Number(it.agingBuckets?.bucket0_30 || 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div className="text-center px-2 py-1 bg-amber-50 text-amber-800 rounded border border-amber-200">
                              <span className="block font-semibold">31-60 Hari</span>
                              <span>Rp {Number(it.agingBuckets?.bucket31_60 || 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div className="text-center px-2 py-1 bg-orange-50 text-orange-800 rounded border border-orange-200">
                              <span className="block font-semibold">61-90 Hari</span>
                              <span>Rp {Number(it.agingBuckets?.bucket61_90 || 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div className="text-center px-2 py-1 bg-rose-50 text-rose-800 rounded border border-rose-200">
                              <span className="block font-semibold">&gt;90 Hari</span>
                              <span>Rp {Number(it.agingBuckets?.bucketOver90 || 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div className="text-right pl-3 border-l border-gray-200">
                              <span className="text-xs text-gray-500 block">Total Nilai</span>
                              <span className="font-bold text-sm text-indigo-600">
                                Rp {Number(it.totalNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Expandable Individual Layers */}
                        {isExp && (
                          <div className="border-t border-gray-200 p-4 bg-gray-50">
                            <h5 className="text-xs font-bold text-gray-700 uppercase mb-2">
                              Rincian Lapisan Masuk Aktif (Tersisa)
                            </h5>
                            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                              <table className="min-w-full text-xs divide-y divide-gray-200">
                                <thead className="bg-gray-50 text-gray-600">
                                  <tr>
                                    <th className="px-3 py-2 text-left">Tanggal Masuk</th>
                                    <th className="px-3 py-2 text-right">Umur</th>
                                    <th className="px-3 py-2 text-right">Qty Awal</th>
                                    <th className="px-3 py-2 text-right">Qty Sisa</th>
                                    <th className="px-3 py-2 text-right">Biaya Satuan Asli</th>
                                    <th className="px-3 py-2 text-right">Total Nilai Lapisan</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {it.layers?.map((layer: any, li: number) => (
                                    <tr key={li} className="hover:bg-gray-50">
                                      <td className="px-3 py-2 font-medium text-gray-800">
                                        {new Date(layer.tanggalMasuk).toLocaleDateString('id-ID')}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-gray-600">
                                        {layer.umurHari} hari
                                      </td>
                                      <td className="px-3 py-2 text-right text-gray-600">
                                        {Number(layer.qtyAwal).toLocaleString('id-ID')}
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-emerald-700">
                                        {Number(layer.qtySisa).toLocaleString('id-ID')} {it.satuan}
                                      </td>
                                      <td className="px-3 py-2 text-right text-gray-800">
                                        Rp {Number(layer.biayaSatuan).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-gray-900">
                                        Rp {Number(layer.totalNilai).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: VALUASI PERSEDIAAN POSISI TANGGAL */}
      {activeTab === 'valuation' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Posisi Per Tanggal *
              </label>
              <input
                type="date"
                value={valuationDate}
                onChange={(e) => setValuationDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Gudang
              </label>
              <select
                value={valuationWarehouseId}
                onChange={(e) => setValuationWarehouseId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Semua Gudang</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.kode} - {w.nama}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {valuationData && (
            <div className="space-y-6">
              {/* Warehouse Summaries */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-xl">
                  <span className="text-xs uppercase font-semibold text-indigo-700">
                    Grand Total Valuasi Persediaan
                  </span>
                  <div className="text-2xl font-bold text-indigo-900 mt-1">
                    Rp {Number(valuationData.grandTotalNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-xs text-indigo-600 mt-1 block">
                    Per {new Date(valuationData.asOfDate).toLocaleDateString('id-ID')}
                  </span>
                </div>
                {valuationData.summaryByWarehouse?.map((sw: any, idx: number) => (
                  <div key={idx} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <span className="text-xs uppercase font-semibold text-gray-500">
                      {sw.warehouseNama} ({sw.warehouseKode})
                    </span>
                    <div className="text-xl font-bold text-gray-900 mt-1">
                      Rp {Number(sw.totalNilai || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-xs text-gray-500 mt-1 block">
                      Total Qty: {Number(sw.totalQty || 0).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Items List */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Barang</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Kategori</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Metode</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Gudang</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                          Qty Per Tanggal
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                          Biaya Satuan
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                          Total Nilai
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {valuationData.items?.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                            Tidak ada persediaan pada tanggal tersebut.
                          </td>
                        </tr>
                      ) : (
                        valuationData.items?.map((it: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-gray-900">{it.itemNama}</div>
                              <div className="text-xs text-gray-500 font-mono">{it.itemKode}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{it.groupCode || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 text-gray-800">
                                {it.valuationMethod}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-800">
                              {it.warehouseKode} - {it.warehouseNama}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900">
                              {Number(it.qty).toLocaleString('id-ID')} {it.satuan}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">
                              Rp {Number(it.biayaRataRata).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-indigo-600">
                              Rp {Number(it.totalNilai).toLocaleString('id-ID', { minimumFractionDigits: 2 })}
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
      )}
    </div>
  );
};

