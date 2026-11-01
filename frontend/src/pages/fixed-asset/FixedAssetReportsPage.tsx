import React, { useState, useEffect } from 'react';
import {
  api,
  Tenant,
  AssetCategory,
} from '../../services/api';
import {
  FileSpreadsheet,
  Download,
  Printer,
  RefreshCw,
  Search,
  Filter,
  Package,
  Calendar,
  Layers,
  Percent,
  TrendingDown,
  Clock,
  ArrowRightLeft,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface Props {
  currentTenant: Tenant | null;
  onNavigate?: (tab: string) => void;
}

type ReportTab =
  | 'list'
  | 'roll-forward'
  | 'commercial-vs-fiscal'
  | 'by-dimension'
  | 'projection'
  | 'disposal-gain-loss';

export const FixedAssetReportsPage: React.FC<Props> = ({ currentTenant, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('list');
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Date filters
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear());

  // Report Data States
  const [listData, setListData] = useState<any>(null);
  const [rollForwardData, setRollForwardData] = useState<any>(null);
  const [commVsFiscalData, setCommVsFiscalData] = useState<any>(null);
  const [byDimData, setByDimData] = useState<any>(null);
  const [projectionData, setProjectionData] = useState<any>(null);
  const [disposalData, setDisposalData] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (!currentTenant) return;
    api.getAssetCategories().then(setCategories).catch(console.error);
  }, [currentTenant]);

  const fetchReport = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      if (activeTab === 'list') {
        const res = await api.getFixedAssetListReport({
          asOfDate,
          categoryId: selectedCategory || undefined,
        });
        setListData(res);
      } else if (activeTab === 'roll-forward') {
        const res = await api.getFixedAssetRollForwardReport({
          startDate,
          endDate,
          categoryId: selectedCategory || undefined,
        });
        setRollForwardData(res);
      } else if (activeTab === 'commercial-vs-fiscal') {
        const res = await api.getFixedAssetCommercialVsFiscal({
          fiscalYear,
          categoryId: selectedCategory || undefined,
        });
        setCommVsFiscalData(res);
      } else if (activeTab === 'by-dimension') {
        const res = await api.getFixedAssetDepreciationByDimension({
          startDate,
          endDate,
        });
        setByDimData(res);
      } else if (activeTab === 'projection') {
        const res = await api.getFixedAssetProjectionReport({
          categoryId: selectedCategory || undefined,
          years: 5,
        });
        setProjectionData(res);
      } else if (activeTab === 'disposal-gain-loss') {
        const res = await api.getFixedAssetDisposalGainLoss({
          startDate,
          endDate,
          categoryId: selectedCategory || undefined,
        });
        setDisposalData(res);
      }
    } catch (err) {
      console.error('Failed to load asset report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [currentTenant, activeTab, asOfDate, startDate, endDate, fiscalYear, selectedCategory]);

  const formatRupiah = (val?: number | null) => {
    if (val === undefined || val === null || val === 0) return '-';
    const isNeg = val < 0;
    const formatted = new Intl.NumberFormat('id-ID', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(val));
    return isNeg ? `(${formatted})` : formatted;
  };

  // Export to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    let wsData: any[][] = [];
    let fileName = `Laporan_Aset_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (activeTab === 'list' && listData) {
      wsData.push(['No. Aset', 'Kode Tag', 'Nama Aset', 'Kategori', 'Tgl Perolehan', 'Status', 'Harga Perolehan', 'Akumulasi Komersial', 'Nilai Tercatat', 'Akumulasi Fiskal', 'Nilai Sisa Fiskal']);
      listData.items.forEach((item: any) => {
        wsData.push([
          item.noAset,
          item.tagCode,
          item.nama,
          item.kategori,
          item.tanggalPerolehan,
          item.status,
          item.hargaPerolehan,
          item.akumulasiKomersial,
          item.nilaiTercatatKomersial,
          item.akumulasiFiskal,
          item.nilaiBukuFiskal,
        ]);
      });
      fileName = `Daftar_Aset_Tetap_${asOfDate}.xlsx`;
    } else if (activeTab === 'roll-forward' && rollForwardData) {
      wsData.push(['Kategori', 'Cost Saldo Awal', 'Cost Penambahan', 'Cost Pelepasan', 'Cost Saldo Akhir', 'Akumulasi Awal', 'Beban Periode', 'Penurunan Nilai', 'Akumulasi Pelepasan', 'Akumulasi Akhir', 'Nilai Buku Awal', 'Nilai Buku Akhir']);
      rollForwardData.rows.forEach((r: any) => {
        wsData.push([
          `${r.kode} - ${r.nama}`,
          r.costBeginning,
          r.costAddition,
          r.costDisposal,
          r.costEnding,
          r.depBeginning,
          r.depExpense,
          r.depImpairment,
          r.depDisposal,
          r.depEnding,
          r.carryingBeginning,
          r.carryingEnding,
        ]);
      });
      fileName = `Mutasi_RollForward_Aset_${startDate}_sd_${endDate}.xlsx`;
    } else if (activeTab === 'commercial-vs-fiscal' && commVsFiscalData) {
      wsData.push(['No. Aset', 'Nama Aset', 'Kategori', 'Kelompok Fiskal', 'Tarif Fiskal', 'Beban Komersial', 'Beban Fiskal', 'Selisih (Koreksi)', 'Arah Koreksi', 'Nilai Buku Komersial', 'Nilai Sisa Fiskal', 'Beda Temporer']);
      commVsFiscalData.items.forEach((r: any) => {
        wsData.push([
          r.noAset,
          r.nama,
          r.kategori,
          r.kelompokFiskal,
          r.tarifFiskal,
          r.bebanKomersial,
          r.bebanFiskal,
          r.selisihPenyusutan,
          r.koreksiFiskal,
          r.nilaiTercatatKomersial,
          r.nilaiSisaBukuFiskal,
          r.bedaTemporer,
        ]);
      });
      fileName = `Rekonsiliasi_Komersial_Fiskal_${fiscalYear}.xlsx`;
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), fileName);
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 border border-emerald-300 rounded-2xl text-emerald-800">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#142820]">
                Laporan Finansial Aktiva Tetap
              </h1>
              <p className="text-sm text-[#556c5e]">
                Daftar aset per tanggal, mutasi roll-forward (PSAK 216/238), rekonsiliasi komersial vs fiskal, dan proyeksi penyusutan.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#edf2ea] text-[#142820] border border-[#cbdcd0] rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-700 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#edf2ea] text-[#142820] border border-[#cbdcd0] rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Cetak
          </button>
        </div>
      </div>

      {/* Tabs Menu Laporan */}
      <div className="flex border-b border-[#cbdcd0] space-x-1 overflow-x-auto">
        {[
          { id: 'list', label: 'Daftar Aset per Tanggal', icon: Package },
          { id: 'roll-forward', label: 'Mutasi Roll-Forward (PSAK 216)', icon: Layers },
          { id: 'commercial-vs-fiscal', label: 'Rekonsiliasi Komersial vs Fiskal', icon: Percent },
          { id: 'by-dimension', label: 'Penyusutan per Dimensi', icon: Building2 },
          { id: 'projection', label: 'Proyeksi Penyusutan', icon: TrendingDown },
          { id: 'disposal-gain-loss', label: 'Laba / Rugi Pelepasan', icon: ArrowRightLeft },
        ].map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ReportTab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                isActive
                  ? 'border-emerald-700 text-emerald-800 bg-emerald-50/50'
                  : 'border-transparent text-[#556c5e] hover:text-[#142820] hover:bg-[#edf2ea]'
              }`}
            >
              <IconComp className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Panel Parameter & Filter */}
      <div className="bg-white border border-[#cbdcd0] rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-4">
        {activeTab === 'list' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#142820]">Posisi Tanggal:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="bg-white border border-[#cbdcd0] rounded-xl px-3 py-1.5 text-xs text-[#142820] font-medium"
            />
          </div>
        )}

        {(activeTab === 'roll-forward' || activeTab === 'by-dimension' || activeTab === 'disposal-gain-loss') && (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[#142820]">Tanggal Dari:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-[#cbdcd0] rounded-xl px-3 py-1.5 text-xs text-[#142820] font-medium"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[#142820]">Sampai:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-[#cbdcd0] rounded-xl px-3 py-1.5 text-xs text-[#142820] font-medium"
              />
            </div>
          </>
        )}

        {activeTab === 'commercial-vs-fiscal' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#142820]">Tahun Fiskal:</span>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(parseInt(e.target.value, 10))}
              className="bg-white border border-[#cbdcd0] rounded-xl px-3 py-1.5 text-xs text-[#142820] font-medium"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  Tahun {y}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Kategori Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-[#142820]">Kategori:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-white border border-[#cbdcd0] rounded-xl px-3 py-1.5 text-xs text-[#142820] font-medium"
          >
            <option value="">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kode} - {c.nama}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 1. TAB: DAFTAR ASET TETAP PER TANGGAL */}
      {activeTab === 'list' && listData && (
        <div className="bg-white border border-[#cbdcd0] rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 bg-[#f7faf6] border-b border-[#cbdcd0] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-[#556c5e]">Total Unit Aset:</span>
                <span className="ml-1.5 font-bold text-[#142820]">{listData.totalAssets} unit</span>
              </div>
              <div>
                <span className="text-[#556c5e]">Total Harga Perolehan:</span>
                <span className="ml-1.5 font-bold font-mono text-[#142820]">
                  {formatRupiah(listData.totals.totalPerolehan)}
                </span>
              </div>
              <div>
                <span className="text-[#556c5e]">Akumulasi Komersial:</span>
                <span className="ml-1.5 font-bold font-mono text-rose-700">
                  {formatRupiah(listData.totals.totalAkumulasiKomersial)}
                </span>
              </div>
              <div>
                <span className="text-[#556c5e]">Nilai Tercatat Bersih:</span>
                <span className="ml-1.5 font-bold font-mono text-emerald-800">
                  {formatRupiah(listData.totals.totalNilaiTercatatKomersial)}
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold border-b border-[#cbdcd0]">
                <tr>
                  <th className="py-3 px-3.5">No. Aset</th>
                  <th className="py-3 px-3.5">Kode Tag</th>
                  <th className="py-3 px-3.5">Nama Aset</th>
                  <th className="py-3 px-3.5">Kategori</th>
                  <th className="py-3 px-3.5 text-center">Kelompok Fiskal</th>
                  <th className="py-3 px-3.5 text-center">Tgl Perolehan</th>
                  <th className="py-3 px-3.5 text-right">Harga Perolehan</th>
                  <th className="py-3 px-3.5 text-right">Akumulasi Komersial</th>
                  <th className="py-3 px-3.5 text-right">Nilai Tercatat</th>
                  <th className="py-3 px-3.5 text-right">Nilai Sisa Fiskal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8df]">
                {listData.items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-[#f7faf6]">
                    <td className="py-2.5 px-3.5 font-mono font-bold text-[#142820]">{item.noAset}</td>
                    <td className="py-2.5 px-3.5 font-mono text-[#556c5e]">{item.tagCode}</td>
                    <td className="py-2.5 px-3.5 font-semibold text-[#142820]">{item.nama}</td>
                    <td className="py-2.5 px-3.5 text-[#556c5e]">{item.kategori}</td>
                    <td className="py-2.5 px-3.5 text-center text-[#556c5e]">{item.kelompokFiskal}</td>
                    <td className="py-2.5 px-3.5 text-center text-[#556c5e]">{item.tanggalPerolehan}</td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#142820]">
                      {formatRupiah(item.hargaPerolehan)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-rose-700">
                      {formatRupiah(item.akumulasiKomersial)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-emerald-800 bg-[#f0fdf4]">
                      {formatRupiah(item.nilaiTercatatKomersial)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-teal-800">
                      {formatRupiah(item.nilaiBukuFiskal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. TAB: MUTASI ROLL-FORWARD (PSAK 216 / PSAK 238) */}
      {activeTab === 'roll-forward' && rollForwardData && (
        <div className="bg-white border border-[#cbdcd0] rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 bg-[#f7faf6] border-b border-[#cbdcd0]">
            <h3 className="text-sm font-bold text-[#142820]">
              Tabel Mutasi Saldo Aset Tetap (Roll-Forward Schedule)
            </h3>
            <p className="text-xs text-[#556c5e] mt-0.5">
              Standar Acuan: {rollForwardData.standards}. Seluruh saldo akhir konsisten dengan akun kontrol Neraca.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold border-b border-[#cbdcd0]">
                <tr>
                  <th rowSpan={2} className="py-3 px-3.5 border-r border-[#cbdcd0]">Kategori Aset</th>
                  <th colSpan={4} className="py-2 px-3 text-center border-r border-[#cbdcd0] bg-[#e2ede1]">
                    Harga Perolehan (Cost)
                  </th>
                  <th colSpan={4} className="py-2 px-3 text-center border-r border-[#cbdcd0] bg-[#fee2e2] text-rose-900">
                    Akumulasi Penyusutan & Penurunan Nilai
                  </th>
                  <th colSpan={2} className="py-2 px-3 text-center bg-[#dcfce7] text-emerald-900">
                    Nilai Tercatat Bersih
                  </th>
                </tr>
                <tr className="border-t border-[#cbdcd0] text-[10px]">
                  <th className="py-2 px-3 text-right">Saldo Awal</th>
                  <th className="py-2 px-3 text-right">Penambahan</th>
                  <th className="py-2 px-3 text-right">Pengurangan</th>
                  <th className="py-2 px-3 text-right border-r border-[#cbdcd0] font-bold">Saldo Akhir</th>

                  <th className="py-2 px-3 text-right">Saldo Awal</th>
                  <th className="py-2 px-3 text-right">Beban Periode</th>
                  <th className="py-2 px-3 text-right">Pengurangan</th>
                  <th className="py-2 px-3 text-right border-r border-[#cbdcd0] font-bold">Saldo Akhir</th>

                  <th className="py-2 px-3 text-right">Awal</th>
                  <th className="py-2 px-3 text-right font-bold">Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8df]">
                {rollForwardData.rows.map((row: any) => (
                  <tr key={row.categoryId} className="hover:bg-[#f7faf6]">
                    <td className="py-2.5 px-3.5 font-bold text-[#142820] border-r border-[#cbdcd0]">
                      {row.kode} - {row.nama}
                    </td>

                    {/* Cost */}
                    <td className="py-2.5 px-3 text-right font-mono text-[#142820]">{formatRupiah(row.costBeginning)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">{formatRupiah(row.costAddition)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-700">{formatRupiah(row.costDisposal)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#142820] border-r border-[#cbdcd0] bg-[#f9fbf8]">
                      {formatRupiah(row.costEnding)}
                    </td>

                    {/* Akumulasi */}
                    <td className="py-2.5 px-3 text-right font-mono text-rose-700">{formatRupiah(row.depBeginning)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-700">{formatRupiah(row.depExpense)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">{formatRupiah(row.depDisposal)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-800 border-r border-[#cbdcd0] bg-[#fff5f5]">
                      {formatRupiah(row.depEnding)}
                    </td>

                    {/* Carrying */}
                    <td className="py-2.5 px-3 text-right font-mono text-[#556c5e]">{formatRupiah(row.carryingBeginning)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-900 bg-[#f0fdf4]">
                      {formatRupiah(row.carryingEnding)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#eaf1e8] font-bold border-t-2 border-[#cbdcd0]">
                <tr>
                  <td className="py-3 px-3.5 border-r border-[#cbdcd0] font-bold text-[#142e20]">TOTAL (NERACA)</td>
                  <td className="py-3 px-3 text-right font-mono">{formatRupiah(rollForwardData.totals.costBeginning)}</td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-700">{formatRupiah(rollForwardData.totals.costAddition)}</td>
                  <td className="py-3 px-3 text-right font-mono text-rose-700">{formatRupiah(rollForwardData.totals.costDisposal)}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold border-r border-[#cbdcd0]">{formatRupiah(rollForwardData.totals.costEnding)}</td>

                  <td className="py-3 px-3 text-right font-mono text-rose-700">{formatRupiah(rollForwardData.totals.depBeginning)}</td>
                  <td className="py-3 px-3 text-right font-mono text-rose-700">{formatRupiah(rollForwardData.totals.depExpense)}</td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-700">{formatRupiah(rollForwardData.totals.depDisposal)}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold border-r border-[#cbdcd0] text-rose-800">{formatRupiah(rollForwardData.totals.depEnding)}</td>

                  <td className="py-3 px-3 text-right font-mono">{formatRupiah(rollForwardData.totals.carryingBeginning)}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-900">{formatRupiah(rollForwardData.totals.carryingEnding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 3. TAB: REKONSILIASI KOMERSIAL VS FISKAL (PAJAK) */}
      {activeTab === 'commercial-vs-fiscal' && commVsFiscalData && (
        <div className="bg-white border border-[#cbdcd0] rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 bg-[#f7faf6] border-b border-[#cbdcd0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#142820]">
                Rekonsiliasi Penyusutan & Pelepasan Fiskal (Lampiran SPT Tahunan PPh Badan)
              </h3>
              <p className="text-xs text-[#556c5e] mt-0.5">{commVsFiscalData.catatanPajak}</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="p-2.5 rounded-xl border border-amber-300 bg-[#fffbeb] text-amber-900">
                <span className="font-semibold">Koreksi Fiskal Bersih:</span>
                <span className="ml-1.5 font-bold font-mono">
                  {formatRupiah(commVsFiscalData.summary.totalKoreksiFiskal)} ({commVsFiscalData.summary.arahKoreksi})
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold border-b border-[#cbdcd0]">
                <tr>
                  <th className="py-3 px-3.5">No. Aset</th>
                  <th className="py-3 px-3.5">Nama Aset</th>
                  <th className="py-3 px-3.5">Kelompok Fiskal</th>
                  <th className="py-3 px-3.5 text-center">Tarif Fiskal</th>
                  <th className="py-3 px-3.5 text-right">Penyusutan Komersial</th>
                  <th className="py-3 px-3.5 text-right">Penyusutan Fiskal</th>
                  <th className="py-3 px-3.5 text-right">Selisih (Koreksi)</th>
                  <th className="py-3 px-3.5 text-right">Sisa Buku Komersial</th>
                  <th className="py-3 px-3.5 text-right">Sisa Buku Fiskal</th>
                  <th className="py-3 px-3.5 text-right">Beda Temporer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8df]">
                {commVsFiscalData.items.map((r: any) => (
                  <tr key={r.assetId} className="hover:bg-[#f7faf6]">
                    <td className="py-2.5 px-3.5 font-mono font-bold text-[#142820]">{r.noAset}</td>
                    <td className="py-2.5 px-3.5 font-semibold text-[#142820]">{r.nama}</td>
                    <td className="py-2.5 px-3.5 text-[#556c5e]">{r.kelompokFiskal}</td>
                    <td className="py-2.5 px-3.5 text-center font-mono text-[#556c5e]">{r.tarifFiskal}</td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#142820]">
                      {formatRupiah(r.bebanKomersial)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-teal-800">
                      {formatRupiah(r.bebanFiskal)}
                    </td>
                    <td
                      className={`py-2.5 px-3.5 text-right font-mono font-bold ${
                        r.selisihPenyusutan > 0 ? 'text-amber-800' : r.selisihPenyusutan < 0 ? 'text-blue-800' : 'text-slate-400'
                      }`}
                    >
                      {formatRupiah(r.selisihPenyusutan)} ({r.koreksiFiskal})
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-[#142820]">
                      {formatRupiah(r.nilaiTercatatKomersial)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-teal-800">
                      {formatRupiah(r.nilaiSisaBukuFiskal)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-purple-900 bg-[#faf5ff]">
                      {formatRupiah(r.bedaTemporer)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. TAB: PENYUSUTAN PER DIMENSI */}
      {activeTab === 'by-dimension' && byDimData && (
        <div className="bg-white border border-[#cbdcd0] rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 bg-[#f7faf6] border-b border-[#cbdcd0] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#142820]">
              Alokasi Beban Penyusutan Berdasarkan Dimensi Analitik
            </h3>
            <span className="text-xs font-bold font-mono text-emerald-800">
              Total Beban: {formatRupiah(byDimData.grandTotal)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold border-b border-[#cbdcd0]">
                <tr>
                  <th className="py-3 px-3.5">Nama Dimensi</th>
                  <th className="py-3 px-3.5">Kode Nilai</th>
                  <th className="py-3 px-3.5">Nama Nilai (Departemen / Lokasi)</th>
                  <th className="py-3 px-3.5 text-center">Jumlah Unit Aset</th>
                  <th className="py-3 px-3.5 text-right">Total Beban Penyusutan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8df]">
                {byDimData.items.map((d: any, idx: number) => (
                  <tr key={idx} className="hover:bg-[#f7faf6]">
                    <td className="py-2.5 px-3.5 font-bold text-[#142820]">{d.namaDimensi}</td>
                    <td className="py-2.5 px-3.5 font-mono text-emerald-700">{d.kodeNilai}</td>
                    <td className="py-2.5 px-3.5 font-semibold text-[#142820]">{d.namaNilai}</td>
                    <td className="py-2.5 px-3.5 text-center font-bold text-[#556c5e]">{d.jumlahAset} unit</td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#142820]">
                      {formatRupiah(d.totalBeban)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. TAB: PROYEKSI PENYUSUTAN */}
      {activeTab === 'projection' && projectionData && (
        <div className="bg-white border border-[#cbdcd0] rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 bg-[#f7faf6] border-b border-[#cbdcd0]">
            <h3 className="text-sm font-bold text-[#142820]">
              Proyeksi Beban Penyusutan 5 Tahun ke Depan
            </h3>
            <p className="text-xs text-[#556c5e] mt-0.5">
              Simulasi beban penyusutan komersial dan fiskal untuk perencanaan anggaran tahunan.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold border-b border-[#cbdcd0]">
                <tr>
                  <th className="py-3 px-3.5">Tahun Proyeksi</th>
                  <th className="py-3 px-3.5 text-right">Beban Penyusutan Komersial</th>
                  <th className="py-3 px-3.5 text-right">Beban Penyusutan Fiskal</th>
                  <th className="py-3 px-3.5 text-right">Estimasi Selisih Koreksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8df]">
                {projectionData.years.map((y: any) => (
                  <tr key={y.year} className="hover:bg-[#f7faf6]">
                    <td className="py-3 px-3.5 font-bold text-[#142820]">Tahun {y.year}</td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-[#142820]">
                      {formatRupiah(y.totalKomersial)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-teal-800">
                      {formatRupiah(y.totalFiskal)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-amber-800">
                      {formatRupiah(y.totalKomersial - y.totalFiskal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TAB: LABA / RUGI PELEPASAN */}
      {activeTab === 'disposal-gain-loss' && disposalData && (
        <div className="bg-white border border-[#cbdcd0] rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 bg-[#f7faf6] border-b border-[#cbdcd0] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#142820]">
              Laporan Laba / Rugi Pelepasan Aset Tetap
            </h3>
            <span className="text-xs font-bold font-mono text-[#142820]">
              Total Laba/Rugi Komersial: {formatRupiah(disposalData.totals.totalLabaRugiKomersial)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold border-b border-[#cbdcd0]">
                <tr>
                  <th className="py-3 px-3.5">No. Dokumen</th>
                  <th className="py-3 px-3.5">Tanggal</th>
                  <th className="py-3 px-3.5">Aset</th>
                  <th className="py-3 px-3.5">Tipe</th>
                  <th className="py-3 px-3.5 text-right">Harga Jual</th>
                  <th className="py-3 px-3.5 text-right">Nilai Buku Komersial</th>
                  <th className="py-3 px-3.5 text-right">Laba / (Rugi) Komersial</th>
                  <th className="py-3 px-3.5 text-right">Nilai Sisa Fiskal</th>
                  <th className="py-3 px-3.5 text-right">Laba / (Rugi) Fiskal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8df]">
                {disposalData.items.map((d: any) => (
                  <tr key={d.id} className="hover:bg-[#f7faf6]">
                    <td className="py-2.5 px-3.5 font-mono font-bold text-[#142820]">{d.noDokumen}</td>
                    <td className="py-2.5 px-3.5 text-[#556c5e]">{d.tanggal}</td>
                    <td className="py-2.5 px-3.5 font-semibold text-[#142820]">{d.noAset} - {d.namaAset}</td>
                    <td className="py-2.5 px-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#edf2ea] text-[#142820]">
                        {d.tipe}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#142820]">
                      {formatRupiah(d.hargaJual)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-[#556c5e]">
                      {formatRupiah(d.nilaiBukuKomersial)}
                    </td>
                    <td
                      className={`py-2.5 px-3.5 text-right font-mono font-bold ${
                        d.labaRugiKomersial >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatRupiah(d.labaRugiKomersial)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-teal-800">
                      {formatRupiah(d.nilaiBukuFiskal)}
                    </td>
                    <td
                      className={`py-2.5 px-3.5 text-right font-mono font-bold ${
                        d.labaRugiFiskal >= 0 ? 'text-teal-700' : 'text-rose-700'
                      }`}
                    >
                      {formatRupiah(d.labaRugiFiskal)}
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
};

