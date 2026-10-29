import React, { useState, useEffect, useMemo } from 'react';
import {
  api,
  Tenant,
  Dimension,
  DimensionAnalysisReport,
} from '../services/api';
import {
  Download,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRightLeft,
  Building,
  Info,
} from 'lucide-react';
import {
  exportDimensionAnalysisToExcel,
  exportToPdf,
} from '../utils/reportExport';

interface Props {
  currentTenant: Tenant | null;
}

export const DimensionAnalysisPage: React.FC<Props> = ({ currentTenant }) => {
  // Master Dimensions
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [selectedDimensionId, setSelectedDimensionId] = useState<string>('');

  // Parameters
  const [tipeSaldo, setTipeSaldo] = useState<'MUTASI' | 'AS_OF'>('MUTASI');
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [hideZeroBalances, setHideZeroBalances] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Report Data & Loading State
  const [loading, setLoading] = useState<boolean>(false);
  const [reportData, setReportData] = useState<DimensionAnalysisReport | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Fetch Dimensions for Tenant
  useEffect(() => {
    if (!currentTenant) return;
    api
      .getDimensions()
      .then((dims) => {
        setDimensions(dims);
        if (dims.length > 0 && !selectedDimensionId) {
          setSelectedDimensionId(dims[0].id);
        }
      })
      .catch((err) => {
        console.error('Gagal mengambil daftar dimensi:', err);
      });
  }, [currentTenant]);

  // Fetch Matrix Data
  const fetchReport = async () => {
    if (!currentTenant || !selectedDimensionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDimensionAnalysis(currentTenant.id, {
        dimensionId: selectedDimensionId,
        tipeSaldo,
        startDate: tipeSaldo === 'MUTASI' ? startDate : undefined,
        endDate,
        kategori: selectedCategory !== 'ALL' ? selectedCategory : undefined,
      });
      setReportData(data);
    } catch (err: any) {
      setError(err.message || 'Gagal mengambil data analisa dimensi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDimensionId) {
      fetchReport();
    }
  }, [selectedDimensionId, tipeSaldo, selectedCategory]);

  // Format Helper
  const formatRupiah = (val: number) => {
    if (val === 0) return '-';
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const formatted = new Intl.NumberFormat('id-ID', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(absVal);
    return isNegative ? `(${formatted})` : formatted;
  };

  // Filtered Rows for Display (search & zero-balance toggle)
  const filteredRows = useMemo(() => {
    if (!reportData) return [];
    return reportData.rows.filter((row) => {
      // Filter search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKode = row.coa.kode_akun.toLowerCase().includes(q);
        const matchNama = row.coa.nama_akun.toLowerCase().includes(q);
        if (!matchKode && !matchNama) return false;
      }
      // Filter zero balance
      if (hideZeroBalances) {
        const isAllZero =
          row.total === 0 &&
          Object.values(row.values).every((v) => Math.abs(v) < 0.0001);
        if (isAllZero) return false;
      }
      return true;
    });
  }, [reportData, searchQuery, hideZeroBalances]);

  // Active Dimension Object
  const currentDimObj = useMemo(() => {
    return dimensions.find((d) => d.id === selectedDimensionId);
  }, [dimensions, selectedDimensionId]);

  // Handle Exports
  const handleExportExcel = () => {
    if (!reportData || !currentTenant || !currentDimObj) return;
    exportDimensionAnalysisToExcel(
      reportData,
      currentTenant.nama_perusahaan,
      tipeSaldo,
      startDate,
      endDate,
      currentDimObj.nama_dimension,
    );
  };

  const handlePrint = () => {
    if (!currentDimObj) return;
    exportToPdf(
      'printable-dimension-matrix',
      `Analisa Per Dimensi - ${currentDimObj.nama_dimension}`,
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Analisa Per Dimensi
              </h1>
              <p className="text-sm text-slate-400">
                Matriks perbandingan saldo akun berdasarkan dimensi analitik (Cost Center, Area, Project, dll.)
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchReport}
            disabled={loading || !selectedDimensionId}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!reportData || loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={handlePrint}
            disabled={!reportData || loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            Cetak PDF
          </button>
        </div>
      </div>

      {/* Panel Parameter & Filter */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Filter className="w-4 h-4 text-indigo-400" />
            Parameter Matriks Analisa
          </div>
          <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700/60">
            {dimensions.length} Dimensi Tersedia
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Parameter 1: Tipe Saldo */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
              Tipe Saldo
            </label>
            <div className="grid grid-cols-2 p-1 bg-slate-950/70 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setTipeSaldo('MUTASI')}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  tipeSaldo === 'MUTASI'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mutasi
              </button>
              <button
                type="button"
                onClick={() => setTipeSaldo('AS_OF')}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  tipeSaldo === 'AS_OF'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                As Of
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {tipeSaldo === 'MUTASI'
                ? 'Pergerakan saldo dalam rentang tanggal'
                : 'Saldo kumulatif s.d tanggal akhir'}
            </p>
          </div>

          {/* Parameter 2: Dimensi yang Dianalisis */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Pilih Dimensi (Kolom)
            </label>
            <select
              value={selectedDimensionId}
              onChange={(e) => setSelectedDimensionId(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
            >
              {dimensions.length === 0 && (
                <option value="">Belum ada dimensi di tenant ini</option>
              )}
              {dimensions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nama_dimension} ({d.values?.length || 0} Nilai)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Kolom akan memetakan nilai dari dimensi ini
            </p>
          </div>

          {/* Parameter 3: Tanggal Dari */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Tanggal Dari
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={tipeSaldo === 'AS_OF'}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {tipeSaldo === 'AS_OF'
                ? 'Tidak aktif untuk mode kumulatif (As Of)'
                : 'Awal periode mutasi'}
            </p>
          </div>

          {/* Parameter 4: Tanggal Sampai */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Tanggal Sampai
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={fetchReport}
                disabled={loading || !selectedDimensionId}
                className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center shrink-0"
              >
                Terapkan
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {tipeSaldo === 'AS_OF' ? 'Posisi saldo per tanggal ini' : 'Batas akhir periode'}
            </p>
          </div>
        </div>

        {/* Secondary Toolbar: Filter Kategori & Search */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
              <Building className="w-3 h-3" />
              Kategori:
            </span>
            {[
              { id: 'ALL', label: 'Semua' },
              { id: 'ASET', label: 'Aset' },
              { id: 'LIABILITAS', label: 'Liabilitas' },
              { id: 'EKUITAS', label: 'Ekuitas' },
              { id: 'PENDAPATAN', label: 'Pendapatan' },
              { id: 'BEBAN', label: 'Beban' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-slate-700 text-white border border-slate-600'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search & Hide Zero Balance */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari akun..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950/70 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors w-44"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
              <input
                type="checkbox"
                checked={hideZeroBalances}
                onChange={(e) => setHideZeroBalances(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0 focus:ring-offset-0"
              />
              Sembunyikan Saldo 0
            </label>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-rose-400 text-sm flex items-center gap-3">
          <Info className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Matrix Table Container */}
      <div
        id="printable-dimension-matrix"
        className="bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl"
      >
        {/* Printable Header (Visible only when printed) */}
        <div className="hidden print:block p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold">{currentTenant?.nama_perusahaan}</h2>
          <h3 className="text-base font-semibold">
            ANALISA PER DIMENSI: {currentDimObj?.nama_dimension.toUpperCase()}
          </h3>
          <p className="text-xs text-slate-600">
            {tipeSaldo === 'AS_OF'
              ? `As Of: ${new Date(endDate).toLocaleDateString('id-ID')}`
              : `Mutasi: ${new Date(startDate).toLocaleDateString('id-ID')} s/d ${new Date(endDate).toLocaleDateString('id-ID')}`}
          </p>
        </div>

        {/* Scrollable Pivot Matrix Table */}
        <div className="overflow-x-auto max-h-[700px] relative">
          <table className="w-full text-left text-xs border-collapse">
            {/* Header Columns */}
            <thead className="bg-slate-950 text-slate-300 uppercase tracking-wider font-semibold sticky top-0 z-20 shadow-sm border-b border-slate-800">
              <tr>
                <th className="py-3 px-3.5 sticky left-0 z-30 bg-slate-950 min-w-[100px] border-r border-slate-800/80 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                  Kode Akun
                </th>
                <th className="py-3 px-3.5 sticky left-[100px] z-30 bg-slate-950 min-w-[200px] border-r border-slate-800/80 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                  Nama Akun
                </th>
                <th className="py-3 px-3 text-center min-w-[90px] border-r border-slate-800/80">
                  Kategori
                </th>

                {/* Dimension Columns */}
                {reportData?.columns.map((col) => (
                  <th
                    key={col.id}
                    className="py-3 px-3.5 text-right min-w-[130px] border-r border-slate-800/80 bg-slate-950"
                  >
                    <div className="font-semibold text-slate-200 truncate">{col.nama}</div>
                    <div className="text-[10px] text-indigo-400 font-mono tracking-normal">{col.kode}</div>
                  </th>
                ))}

                {/* Unassigned Dimension Column */}
                {reportData?.hasUnassigned && (
                  <th className="py-3 px-3.5 text-right min-w-[130px] border-r border-slate-800/80 bg-amber-950/20 text-amber-300">
                    <div className="font-semibold truncate">Tanpa Dimensi</div>
                    <div className="text-[10px] text-amber-400/70 font-mono tracking-normal">UNASSIGNED</div>
                  </th>
                )}

                {/* Row Total Column */}
                <th className="py-3 px-4 text-right min-w-[140px] bg-indigo-950/40 text-indigo-200 font-bold">
                  <div>TOTAL</div>
                  <div className="text-[10px] text-indigo-400 tracking-normal font-normal">Seluruh Kolom</div>
                </th>
              </tr>
            </thead>

            {/* Table Body (Rows: COA, Cells: Values) */}
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      (reportData?.columns.length || 0) +
                      (reportData?.hasUnassigned ? 4 : 3)
                    }
                    className="py-16 text-center text-slate-400"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                      <span className="text-sm">Memuat matriks analisa per dimensi...</span>
                    </div>
                  </td>
                </tr>
              ) : !reportData || filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      (reportData?.columns.length || 0) +
                      (reportData?.hasUnassigned ? 4 : 3)
                    }
                    className="py-16 text-center text-slate-400"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Layers className="w-8 h-8 text-slate-600" />
                      <span className="text-sm font-medium text-slate-300">
                        {dimensions.length === 0
                          ? 'Tenant ini belum memiliki master Dimensi. Silakan buat di menu Manajemen Dimensi.'
                          : 'Tidak ada data transaksi yang cocok dengan filter yang dipilih.'}
                      </span>
                      {hideZeroBalances && (
                        <button
                          type="button"
                          onClick={() => setHideZeroBalances(false)}
                          className="text-xs text-indigo-400 hover:underline mt-1"
                        >
                          Tampilkan akun bersaldo 0
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  return (
                    <tr
                      key={row.coa.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Sticky Left: Kode Akun */}
                      <td className="py-2.5 px-3.5 sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-850 font-mono text-slate-300 font-medium border-r border-slate-800/80 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                        <div className="flex items-center gap-1.5">
                          {row.coa.kode_akun}
                          {row.coa.isControlAccount && (
                            <span className="text-[10px] text-amber-400" title="Akun Kontrol / Subledger">
                              🛡️
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sticky Left: Nama Akun */}
                      <td className="py-2.5 px-3.5 sticky left-[100px] z-10 bg-slate-900 group-hover:bg-slate-850 text-slate-200 border-r border-slate-800/80 shadow-[2px_0_5px_rgba(0,0,0,0.3)] truncate max-w-[240px]">
                        {row.coa.nama_akun}
                      </td>

                      {/* Kategori Badge */}
                      <td className="py-2.5 px-3 text-center border-r border-slate-800/80">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            row.coa.kategori === 'ASET'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : row.coa.kategori === 'LIABILITAS'
                              ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                              : row.coa.kategori === 'EKUITAS'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : row.coa.kategori === 'PENDAPATAN'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {row.coa.kategori}
                        </span>
                      </td>

                      {/* Matrix Value Cells per Dimension Column */}
                      {reportData.columns.map((col) => {
                        const val = row.values[col.id] || 0;
                        return (
                          <td
                            key={col.id}
                            className={`py-2.5 px-3.5 text-right font-mono border-r border-slate-800/80 ${
                              val === 0
                                ? 'text-slate-600'
                                : val < 0
                                ? 'text-rose-400 font-medium'
                                : 'text-slate-200'
                            }`}
                          >
                            {formatRupiah(val)}
                          </td>
                        );
                      })}

                      {/* Matrix Value Cell for Unassigned */}
                      {reportData.hasUnassigned && (
                        <td
                          className={`py-2.5 px-3.5 text-right font-mono border-r border-slate-800/80 bg-amber-950/10 ${
                            (row.values['UNASSIGNED'] || 0) === 0
                              ? 'text-slate-600'
                              : (row.values['UNASSIGNED'] || 0) < 0
                              ? 'text-rose-400 font-medium'
                              : 'text-amber-200'
                          }`}
                        >
                          {formatRupiah(row.values['UNASSIGNED'] || 0)}
                        </td>
                      )}

                      {/* Row Total */}
                      <td
                        className={`py-2.5 px-4 text-right font-mono font-semibold bg-indigo-950/20 ${
                          row.total === 0
                            ? 'text-slate-600'
                            : row.total < 0
                            ? 'text-rose-400'
                            : 'text-indigo-200'
                        }`}
                      >
                        {formatRupiah(row.total)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer Summary (Totals per column & Grand Total) */}
            {reportData && filteredRows.length > 0 && (
              <tfoot className="bg-slate-950 font-semibold border-t-2 border-slate-700 sticky bottom-0 z-20 shadow-md">
                <tr className="text-slate-100">
                  <td className="py-3 px-3.5 sticky left-0 z-30 bg-slate-950 border-r border-slate-800 font-bold text-white shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                    TOTAL
                  </td>
                  <td className="py-3 px-3.5 sticky left-[100px] z-30 bg-slate-950 border-r border-slate-800 text-slate-400 text-[11px] shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                    Ringkasan Seluruh Akun
                  </td>
                  <td className="py-3 px-3 border-r border-slate-800 text-center text-slate-500">
                    -
                  </td>

                  {/* Dimension Column Totals */}
                  {reportData.columns.map((col) => {
                    const colTotal = reportData.columnTotals[col.id] || 0;
                    return (
                      <td
                        key={col.id}
                        className={`py-3 px-3.5 text-right font-mono border-r border-slate-800 ${
                          colTotal < 0 ? 'text-rose-400' : 'text-slate-100'
                        }`}
                      >
                        {formatRupiah(colTotal)}
                      </td>
                    );
                  })}

                  {/* Unassigned Total */}
                  {reportData.hasUnassigned && (
                    <td
                      className={`py-3 px-3.5 text-right font-mono border-r border-slate-800 bg-amber-950/30 ${
                        (reportData.columnTotals['UNASSIGNED'] || 0) < 0
                          ? 'text-rose-400'
                          : 'text-amber-200'
                      }`}
                    >
                      {formatRupiah(reportData.columnTotals['UNASSIGNED'] || 0)}
                    </td>
                  )}

                  {/* Grand Total */}
                  <td
                    className={`py-3 px-4 text-right font-mono font-bold text-sm bg-indigo-950/60 ${
                      reportData.grandTotal < 0
                        ? 'text-rose-400'
                        : 'text-emerald-300'
                    }`}
                  >
                    {formatRupiah(reportData.grandTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

