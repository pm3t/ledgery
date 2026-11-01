import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  PieChart,
  TrendingUp,
  RefreshCw,
  Search,
  Calendar,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  api,
  CashBankAccount,
} from '../../services/api';

/**
 * Halaman Laporan Kas & Bank:
 * 1. Buku Kas / Bank (Buku Pembantu Rekening dengan Saldo Berjalan)
 * 2. Posisi Kas & Bank (Ringkasan Saldo Multicurrency & Nilai Fungsional)
 * 3. Proyeksi Arus Kas (Perkiraan Inflow/Outflow berdasarkan Jatuh Tempo AR/AP)
 */
export const CashReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'BUKU_KAS' | 'POSISI' | 'PROYEKSI'>('BUKU_KAS');
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reconStatusFilter, setReconStatusFilter] = useState<'ALL' | 'UNRECONCILED' | 'CLEARED'>('ALL');

  // Report Data States
  const [cashBookData, setCashBookData] = useState<any>(null);
  const [positionData, setPositionData] = useState<any>(null);
  const [projectionData, setProjectionData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await api.getCashAccounts();
        const accs = Array.isArray(res) ? res : [];
        setAccounts(accs);
        if (accs.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accs[0].id);
        }
      } catch (err: any) {
        console.error('Gagal memuat akun kas/bank:', err);
      }
    };
    fetchAccounts();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      if (activeTab === 'BUKU_KAS' && selectedAccountId) {
        const res = await api.getCashBookReport(selectedAccountId, { startDate, endDate });
        setCashBookData(res);
      } else if (activeTab === 'POSISI') {
        const res = await api.getCashPositionReport(endDate);
        setPositionData(res);
      } else if (activeTab === 'PROYEKSI') {
        const res = await api.getCashProjectionReport(60, 'WEEKLY');
        setProjectionData(res);
      }
    } catch (err: any) {
      console.error('Gagal memuat laporan kas/bank:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId || activeTab !== 'BUKU_KAS') {
      loadReport();
    }
  }, [activeTab, selectedAccountId, startDate, endDate]);

  const formatCurrency = (val: number | undefined | null, curr = 'IDR') => {
    if (val === undefined || val === null) return '0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-emerald-700" />
            Laporan Kas & Bank
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Pantau pergerakan mutasi harian, posisi saldo real-time, dan proyeksi likuiditas keuangan perusahaan.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReport}
          disabled={loading}
          className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition-colors shadow-sm self-start md:self-auto"
          title="Muat Ulang Laporan"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

      {/* Tabs Pilihan Laporan */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {[
          { id: 'BUKU_KAS', label: 'Buku Kas / Bank', icon: BookOpen },
          { id: 'POSISI', label: 'Posisi Kas & Bank', icon: PieChart },
          { id: 'PROYEKSI', label: 'Proyeksi Arus Kas (60 Hari)', icon: TrendingUp },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          TAB 1: BUKU KAS / BANK (RUNNING BALANCE)
          ========================================================================= */}
      {activeTab === 'BUKU_KAS' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="w-full md:w-64">
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Pilih Rekening Kas / Bank
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.kode} - {acc.nama} ({acc.mata_uang})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Dari Tanggal</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Sampai Tanggal</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Status Rekonsiliasi</label>
                <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter('ALL')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      reconStatusFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter('UNRECONCILED')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      reconStatusFilter === 'UNRECONCILED'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Belum Rekonsiliasi
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconStatusFilter('CLEARED')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      reconStatusFilter === 'CLEARED'
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cleared
                  </button>
                </div>
              </div>
            </div>

            {/* Ringkasan Saldo Box */}
            {cashBookData && (
              <div className="flex items-center gap-4 bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-xs w-full md:w-auto justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 font-semibold uppercase">Saldo Awal</div>
                  <div className="font-mono font-bold text-slate-800">
                    {formatCurrency(cashBookData.saldoAwal, cashBookData.account?.mata_uang)}
                  </div>
                </div>
                <div className="h-8 w-px bg-emerald-200" />
                <div>
                  <div className="text-[10px] text-emerald-800 font-bold uppercase">Saldo Akhir</div>
                  <div className="font-mono font-bold text-emerald-950 text-sm">
                    {formatCurrency(cashBookData.saldoAkhir, cashBookData.account?.mata_uang)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Table Mutasi Buku Kas */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-800">
                <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
                  <tr>
                    <th className="py-3 px-4 font-bold">Tanggal</th>
                    <th className="py-3 px-4 font-bold">Tipe Sumber</th>
                    <th className="py-3 px-4 font-bold">Keterangan Transaksi</th>
                    <th className="py-3 px-4 text-right font-bold text-emerald-800">Masuk (Debit)</th>
                    <th className="py-3 px-4 text-right font-bold text-rose-800">Keluar (Kredit)</th>
                    <th className="py-3 px-4 text-right font-bold">Saldo Berjalan</th>
                    <th className="py-3 px-4 text-center font-bold">Status Rekon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        Memuat data mutasi buku kas...
                      </td>
                    </tr>
                  ) : !cashBookData || !cashBookData.entries || cashBookData.entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        Tidak ada transaksi pada rentang tanggal yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    cashBookData.entries
                      .filter((entry: any) => {
                        if (reconStatusFilter === 'UNRECONCILED') return !entry.clearedAt;
                        if (reconStatusFilter === 'CLEARED') return !!entry.clearedAt;
                        return true;
                      })
                      .map((entry: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4 font-mono text-slate-600">
                            {new Date(entry.tanggal).toLocaleDateString('id-ID')}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {entry.sourceType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-800 max-w-sm truncate">{entry.keterangan || '-'}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700">
                            {entry.arah === 'MASUK' ? formatCurrency(entry.jumlah, cashBookData.account?.mata_uang) : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-rose-700">
                            {entry.arah === 'KELUAR' ? formatCurrency(entry.jumlah, cashBookData.account?.mata_uang) : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(entry.saldoBerjalan, cashBookData.account?.mata_uang)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {entry.clearedAt ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                                title={`Cleared pada ${new Date(entry.clearedAt).toLocaleString('id-ID')}`}
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                Cleared
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300"
                                title="Belum dicocokkan dalam rekonsiliasi bank"
                              >
                                <Clock className="w-3 h-3 text-slate-400" />
                                Belum Rekonsiliasi
                              </span>
                            )}
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

      {/* =========================================================================
          TAB 2: POSISI KAS & BANK (MULTICURRENCY & SUMMARY)
          ========================================================================= */}
      {activeTab === 'POSISI' && (
        <div className="space-y-4">
          {positionData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase">Grand Total Nilai Kas & Bank</div>
                <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">
                  {formatCurrency(positionData.grandTotalFungsional, positionData.tenantMataUang)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Nilai ekuivalen dalam mata uang fungsional ({positionData.tenantMataUang})
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase">Total Rekening Bank</div>
                <div className="text-2xl font-bold font-mono text-indigo-700 mt-1">
                  {formatCurrency(positionData.summaryByJenis?.BANK || 0, positionData.tenantMataUang)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Dana simpanan di rekening giro & tabungan</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase">Kas Operasional & Kas Kecil</div>
                <div className="text-2xl font-bold font-mono text-amber-700 mt-1">
                  {formatCurrency(
                    (positionData.summaryByJenis?.KAS_TUNAI || 0) + (positionData.summaryByJenis?.KAS_KECIL || 0),
                    positionData.tenantMataUang,
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Kas tunai fisik & imprest petty cash</div>
              </div>
            </div>
          )}

          {/* Table Breakdown Semua Rekening */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-800">
                <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
                  <tr>
                    <th className="py-3 px-4 font-bold">Kode Rekening</th>
                    <th className="py-3 px-4 font-bold">Nama Rekening</th>
                    <th className="py-3 px-4 font-bold">Jenis</th>
                    <th className="py-3 px-4 font-bold">Mata Uang</th>
                    <th className="py-3 px-4 text-right font-bold">Saldo Mata Uang Asli</th>
                    <th className="py-3 px-4 text-right font-bold">Kurs Valas</th>
                    <th className="py-3 px-4 text-right font-bold text-emerald-900">Nilai Fungsional (IDR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        Memuat data posisi kas...
                      </td>
                    </tr>
                  ) : !positionData || positionData.accounts?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        Belum ada rekening kas atau bank.
                      </td>
                    </tr>
                  ) : (
                    positionData.accounts.map((acc: any) => (
                      <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{acc.kode}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{acc.nama}</td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {acc.jenis}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">{acc.mata_uang}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(acc.saldoAsli, acc.mata_uang)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {acc.kurs ? acc.kurs.toLocaleString('id-ID') : '1'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">
                          {formatCurrency(acc.saldoFungsional, positionData.tenantMataUang)}
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

      {/* =========================================================================
          TAB 3: PROYEKSI ARUS KAS (60 HARI BERDASARKAN JATUH TEMPO AR & AP)
          ========================================================================= */}
      {activeTab === 'PROYEKSI' && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Model Proyeksi Likuiditas Otomatis</div>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                Proyeksi dihitung dari posisi kas saat ini ditambah estimasi penerimaan piutang (AR Invoices) dan dikurangi
                estimasi pembayaran tagihan vendor (AP Bills) yang berstatus POSTED sesuai tanggal jatuh temponya.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-800">
                <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
                  <tr>
                    <th className="py-3 px-4 font-bold">Periode / Interval</th>
                    <th className="py-3 px-4 font-bold">Rentang Tanggal</th>
                    <th className="py-3 px-4 text-right font-bold text-emerald-700">Estimasi Masuk (Piutang AR)</th>
                    <th className="py-3 px-4 text-right font-bold text-rose-700">Estimasi Keluar (Hutang AP)</th>
                    <th className="py-3 px-4 text-right font-bold">Net Arus Kas</th>
                    <th className="py-3 px-4 text-right font-bold text-emerald-900">Proyeksi Saldo Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        Menghitung proyeksi arus kas...
                      </td>
                    </tr>
                  ) : !projectionData || projectionData.buckets?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        Tidak ada data piutang atau tagihan terbuka untuk diproyeksikan.
                      </td>
                    </tr>
                  ) : (
                    projectionData.buckets.map((b: any) => (
                      <tr key={b.bucketIndex} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{b.label}</td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {b.startDate} s/d {b.endDate}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">
                          {formatCurrency(b.projectedInflow)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-rose-700">
                          {formatCurrency(b.projectedOutflow)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold">
                          <span className={b.netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {formatCurrency(b.netCashFlow)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                          {formatCurrency(b.projectedBalance)}
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
export default CashReportsPage;

