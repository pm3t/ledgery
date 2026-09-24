import React, { useState, useEffect } from 'react';
import { api, Tenant, TrialBalanceReport as ITrialBalanceReport, BalanceSheetReport as IBalanceSheetReport, IncomeStatementReport as IIncomeStatementReport, CashFlowReport as ICashFlowReport, Dimension } from '../services/api';
import { Download, FileText, BarChart3, TrendingUp, Layers, RefreshCw, Loader2 } from 'lucide-react';
import { TrialBalanceReport } from '../components/reports/TrialBalanceReport';
import { BalanceSheetReport } from '../components/reports/BalanceSheetReport';
import { IncomeStatementReport } from '../components/reports/IncomeStatementReport';
import { CashFlowReport } from '../components/reports/CashFlowReport';
import {
  exportTrialBalanceToExcel,
  exportBalanceSheetToExcel,
  exportIncomeStatementToExcel,
  exportCashFlowToExcel,
  exportToPdf,
} from '../utils/reportExport';

interface Props {
  currentTenant: Tenant | null;
}

type ReportTab = 'trial-balance' | 'balance-sheet' | 'income-statement' | 'cash-flow';

export const FinancialReportsPage: React.FC<Props> = ({ currentTenant }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('trial-balance');
  const [loading, setLoading] = useState(false);
  
  // State Filter
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [enableCompare, setEnableCompare] = useState(false);
  const [compStartDate, setCompStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0]);
  const [compEndDate, setCompEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]);

  // Data Laporan
  const [trialBalanceData, setTrialBalanceData] = useState<ITrialBalanceReport | null>(null);
  const [balanceSheetData, setBalanceSheetData] = useState<IBalanceSheetReport | null>(null);
  const [incomeStatementData, setIncomeStatementData] = useState<IIncomeStatementReport | null>(null);
  const [cashFlowData, setCashFlowData] = useState<ICashFlowReport | null>(null);
  
  // Dimensi
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [selectedDimensionId, setSelectedDimensionId] = useState<string>('');
  const [selectedDimensionValueId, setSelectedDimensionValueId] = useState<string>('');
  const [incomeStatementByDimData, setIncomeStatementByDimData] = useState<any[] | null>(null);

  const fetchReport = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      if (activeTab === 'trial-balance') {
        const data = await api.getTrialBalance(currentTenant.id, startDate, endDate, selectedDimensionValueId || undefined);
        setTrialBalanceData(data);
      } else if (activeTab === 'balance-sheet') {
        // Balance sheet menggunakan endDate sebagai tanggal as of
        const data = await api.getBalanceSheet(currentTenant.id, endDate);
        setBalanceSheetData(data);
      } else if (activeTab === 'income-statement') {
        if (selectedDimensionId) {
          const data = await api.getIncomeStatementByDimension(currentTenant.id, selectedDimensionId, startDate, endDate);
          setIncomeStatementByDimData(data);
          setIncomeStatementData(null);
        } else {
          const data = await api.getIncomeStatement(
            currentTenant.id, 
            startDate, 
            endDate, 
            enableCompare ? compStartDate : undefined, 
            enableCompare ? compEndDate : undefined
          );
          setIncomeStatementData(data);
          setIncomeStatementByDimData(null);
        }
      } else if (activeTab === 'cash-flow') {
        const data = await api.getCashFlow(currentTenant.id, startDate, endDate);
        setCashFlowData(data);
      }
    } catch (err: any) {
      alert(`Gagal mengambil laporan: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch tiap kali tab atau tenant berubah, filter dibiarkan manual via tombol "Refresh"
  useEffect(() => {
    fetchReport();
    if (currentTenant && dimensions.length === 0) {
      api.getDimensions().then(setDimensions).catch(console.error);
    }
  }, [activeTab, currentTenant]);

  const handleExport = (format: 'pdf' | 'excel') => {
    if (!currentTenant) return;

    const namaPerusahaan = currentTenant.nama_perusahaan;
    const reportTitles: Record<ReportTab, string> = {
      'trial-balance': 'Neraca Saldo',
      'balance-sheet': 'Neraca (Balance Sheet)',
      'income-statement': 'Laporan Laba Rugi',
      'cash-flow': 'Laporan Arus Kas',
    };

    if (format === 'pdf') {
      // Ekspor via browser print dialog (tekan Ctrl+P → Save as PDF)
      exportToPdf('report-content-area', reportTitles[activeTab]);
      return;
    }

    // Ekspor Excel — pastikan data laporan sudah dimuat dulu
    if (activeTab === 'trial-balance') {
      if (!trialBalanceData) { alert('Muat laporan terlebih dahulu sebelum mengekspor.'); return; }
      exportTrialBalanceToExcel(trialBalanceData, namaPerusahaan, startDate, endDate);
    } else if (activeTab === 'balance-sheet') {
      if (!balanceSheetData) { alert('Muat laporan terlebih dahulu sebelum mengekspor.'); return; }
      exportBalanceSheetToExcel(balanceSheetData, namaPerusahaan, endDate);
    } else if (activeTab === 'income-statement') {
      if (!incomeStatementData) { alert('Muat laporan terlebih dahulu sebelum mengekspor.'); return; }
      exportIncomeStatementToExcel(incomeStatementData, namaPerusahaan, startDate, endDate);
    } else if (activeTab === 'cash-flow') {
      if (!cashFlowData) { alert('Muat laporan terlebih dahulu sebelum mengekspor.'); return; }
      exportCashFlowToExcel(cashFlowData, namaPerusahaan, startDate, endDate);
    }
  };

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-indigo-400" />
            Laporan Keuangan
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Analisis dan cetak laporan keuangan untuk <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>.
          </p>
        </div>

        {/* Tombol Export */}
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('excel')}
            title="Unduh sebagai file Excel (.xlsx)"
            className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={() => handleExport('pdf')}
            title="Cetak sebagai PDF (gunakan 'Save as PDF' di dialog print)"
            className="bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-4 overflow-x-auto">
          {[
            { id: 'trial-balance', label: 'Neraca Saldo', icon: <FileText className="w-4 h-4" /> },
            { id: 'balance-sheet', label: 'Neraca (Balance Sheet)', icon: <Layers className="w-4 h-4" /> },
            { id: 'income-statement', label: 'Laba Rugi', icon: <TrendingUp className="w-4 h-4" /> },
            { id: 'cash-flow', label: 'Arus Kas', icon: <RefreshCw className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as ReportTab);
                setSelectedDimensionValueId('');
                setSelectedDimensionId('');
              }}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-end gap-4 shadow-sm">
        {activeTab !== 'balance-sheet' && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Periode Awal</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-400">
            {activeTab === 'balance-sheet' ? 'Tanggal As Of (Periode Akhir)' : 'Periode Akhir'}
          </label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        {activeTab === 'income-statement' && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Grup Dimensi (Opsional)</label>
            <select
              value={selectedDimensionId}
              onChange={e => { setSelectedDimensionId(e.target.value); setEnableCompare(false); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">-- Tidak Digrup --</option>
              {dimensions.map(d => (
                <option key={d.id} value={d.id}>{d.nama_dimension}</option>
              ))}
            </select>
          </div>
        )}

        {activeTab === 'trial-balance' && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Dimensi (Opsional)</label>
            <select
              value={selectedDimensionValueId}
              onChange={e => setSelectedDimensionValueId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">-- Semua Dimensi --</option>
              {dimensions.map(d => (
                <optgroup key={d.id} label={d.nama_dimension}>
                  {d.values.filter(v => v.isActive).map(v => (
                    <option key={v.id} value={v.id}>
                      {d.nama_dimension}: {v.kode} - {v.nama}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        {activeTab === 'income-statement' && !selectedDimensionId && (
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 h-[38px] gap-2">
            <input type="checkbox" id="enableCompare" checked={enableCompare} onChange={e => setEnableCompare(e.target.checked)} className="rounded text-indigo-500 bg-slate-900 border-slate-700 focus:ring-indigo-500 focus:ring-offset-slate-900" />
            <label htmlFor="enableCompare" className="text-sm font-medium text-slate-300 cursor-pointer">Bandingkan?</label>
          </div>
        )}

        {activeTab === 'income-statement' && !selectedDimensionId && enableCompare && (
          <>
            <div className="space-y-1 border-l border-slate-700 pl-4">
              <label className="text-xs font-semibold text-amber-400">Periode Pembanding Awal</label>
              <input type="date" value={compStartDate} onChange={e => setCompStartDate(e.target.value)} className="w-full bg-slate-950 border border-amber-900 rounded-lg px-3 py-2 text-sm text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-amber-400">Periode Pembanding Akhir</label>
              <input type="date" value={compEndDate} onChange={e => setCompEndDate(e.target.value)} className="w-full bg-slate-950 border border-amber-900 rounded-lg px-3 py-2 text-sm text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
          </>
        )}

        <button onClick={fetchReport} disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2 h-[38px] rounded-lg transition-colors flex items-center justify-center min-w-[120px]">
          {loading ? 'Memuat...' : 'Terapkan Filter'}
        </button>
      </div>

      {/* Content Area — diberi id agar exportToPdf bisa mengaksesnya */}
      <div id="report-content-area">
        {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            Memproses laporan keuangan, harap tunggu...
          </div>
        ) : (
          <>
            {activeTab === 'trial-balance' && trialBalanceData && <TrialBalanceReport data={trialBalanceData} />}
            {activeTab === 'balance-sheet' && balanceSheetData && <BalanceSheetReport data={balanceSheetData} />}
            {activeTab === 'income-statement' && incomeStatementData && <IncomeStatementReport data={incomeStatementData} />}
            {activeTab === 'income-statement' && incomeStatementByDimData && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-white mb-4">Laba Rugi per Dimensi</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {incomeStatementByDimData.map(rep => (
                    <div key={rep.dimensionValue.id} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                      <h4 className="text-md font-semibold text-indigo-400 mb-2">{rep.dimensionValue.kode} - {rep.dimensionValue.nama}</h4>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-300">Pendapatan</span>
                        <span className="text-emerald-400">{currentTenant.mata_uang} {rep.totalPendapatan.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-300">Beban</span>
                        <span className="text-rose-400">{currentTenant.mata_uang} {rep.totalBeban.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold border-t border-slate-700 pt-2 mt-2">
                        <span className="text-slate-200">Laba Bersih</span>
                        <span className={rep.labaBersih >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{currentTenant.mata_uang} {rep.labaBersih.toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'cash-flow' && cashFlowData && <CashFlowReport data={cashFlowData} />}
          </>
        )}
      </div>
    </div>
  );
};
