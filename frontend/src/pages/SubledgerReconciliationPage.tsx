import React, { useState, useEffect } from 'react';
import {
  api,
  Tenant,
  SubledgerReconciliationSummary,
  ReconciliationAccountResult,
} from '../services/api';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Scale,
  FileText,
  BookOpen,
  ArrowRight,
  ShieldAlert,
  Info,
  Calendar,
  Layers,
} from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
  onNavigate?: (tab: string) => void;
}

export const SubledgerReconciliationPage: React.FC<Props> = ({ currentTenant, onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SubledgerReconciliationSummary | null>(null);
  const [tanggal, setTanggal] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedTab, setSelectedTab] = useState<'ar' | 'ap' | 'inventory' | 'grIrClearing'>('ar');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchReconciliation = async () => {
    if (!currentTenant) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getSubledgerReconciliation(currentTenant.id, tanggal);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load subledger reconciliation:', err);
      setErrorMsg(err.message || 'Gagal memuat data rekonsiliasi sub ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliation();
  }, [currentTenant?.id, tanggal]);

  const formatCurrency = (val: number | undefined | null) => {
    if (val === undefined || val === null) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const getAccountDetail = (key: 'ar' | 'ap' | 'inventory' | 'grIrClearing'): ReconciliationAccountResult | undefined => {
    return data?.accounts?.[key];
  };

  const selectedAccount = getAccountDetail(selectedTab);

  const renderCard = (
    key: 'ar' | 'ap' | 'inventory' | 'grIrClearing',
    label: string,
    badgeTitle: string,
    isFeatureEnabled: boolean,
  ) => {
    const acc = getAccountDetail(key);
    const isSelected = selectedTab === key;
    const isOk = acc?.status === 'OK';
    const selisih = acc?.selisih || 0;

    return (
      <div
        onClick={() => setSelectedTab(key)}
        className={`cursor-pointer rounded-xl border p-5 transition-all shadow-sm ${
          isSelected
            ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {badgeTitle}
              </span>
              {!isFeatureEnabled && (
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500 font-medium">
                  Modul Nonaktif
                </span>
              )}
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{label}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              {acc?.account ? `${acc.account.kode} - ${acc.account.nama}` : 'Akun kontrol belum diatur'}
            </p>
          </div>
          <span
            className={`inline-flex items-center space-x-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isOk
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
            }`}
          >
            {isOk ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>SEIMBANG</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>SELISIH</span>
              </>
            )}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Saldo Buku Besar (GL)</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              {formatCurrency(acc?.glBalance)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Saldo Sub Ledger</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              {formatCurrency(acc?.subledgerBalance)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 dark:border-slate-800 pt-2 text-xs">
          <span className="font-medium text-slate-600 dark:text-slate-400">Selisih Rekonsiliasi:</span>
          <span
            className={`font-mono font-bold ${
              Math.abs(selisih) < 0.01
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatCurrency(selisih)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Scale className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Rekonsiliasi Sub Ledger vs Buku Besar
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Audit integritas saldo antara Buku Besar (GL) dan saldo dokumen transaksi Sub Ledger (AR, AP, Inventory, GR/IR).
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Per Tanggal:</span>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-900 dark:text-white outline-none"
            />
          </div>

          <button
            onClick={fetchReconciliation}
            disabled={loading}
            className="inline-flex items-center space-x-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>Audit Sekarang</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
          {errorMsg}
        </div>
      )}

      {/* Audit Banner */}
      {data && (
        <div
          className={`rounded-xl border p-5 shadow-sm ${
            data.isFullyReconciled
              ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20'
              : 'border-rose-200 bg-rose-50/70 dark:border-rose-900/40 dark:bg-rose-950/20'
          }`}
        >
          <div className="flex items-start space-x-3.5">
            {data.isFullyReconciled ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h2
                className={`text-base font-bold ${
                  data.isFullyReconciled
                    ? 'text-emerald-900 dark:text-emerald-200'
                    : 'text-rose-900 dark:text-rose-200'
                }`}
              >
                {data.isFullyReconciled
                  ? 'Buku Besar & Sub Ledger Terkonsiliasi Sempurna'
                  : `Ditemukan Selisih Rekonsiliasi Sebesar ${formatCurrency(data.totalSelisihAbsolut)}`}
              </h2>
              <p
                className={`mt-1 text-sm ${
                  data.isFullyReconciled
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}
              >
                {data.isFullyReconciled
                  ? `Seluruh akun kontrol (AR, AP, Persediaan, GR/IR Clearing) memiliki saldo yang sama persis dengan rincian dokumen subledger per tanggal ${data.tanggal}.`
                  : `Terdapat ketidaksesuaian saldo pada akun kontrol. Gunakan tabel drill-down di bawah untuk mengidentifikasi jurnal langsung tanpa dokumen atau transaksi yang belum terjurnal.`}
              </p>

              {data.setting.blockPeriodCloseOnRecon && (
                <div className="mt-3 inline-flex items-center space-x-1.5 rounded-md bg-amber-100/80 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>
                    Kebijakan Aktif: Penutupan Periode Akuntansi diblokir bila terdapat selisih rekonsiliasi.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {renderCard('ar', 'Piutang Usaha (AR)', 'Akun AR', !!data?.setting.arEnabled)}
        {renderCard('ap', 'Hutang Usaha (AP)', 'Akun AP', !!data?.setting.apEnabled)}
        {renderCard('inventory', 'Persediaan Barang', 'Inventory', !!data?.setting.inventoryEnabled)}
        {renderCard('grIrClearing', 'Barang Diterima Belum Ditagih', 'GR/IR Clearing', !!data?.setting.orderManagementEnabled)}
      </div>

      {/* Detail & Drill-Down Section */}
      {selectedAccount && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          {/* Detail Tabs */}
          <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Rincian & Drill-Down:{' '}
                  {selectedTab === 'ar' && 'Piutang Usaha (AR)'}
                  {selectedTab === 'ap' && 'Hutang Usaha (AP)'}
                  {selectedTab === 'inventory' && 'Persediaan Barang'}
                  {selectedTab === 'grIrClearing' && 'GR/IR Clearing'}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    selectedAccount.status === 'OK'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400'
                  }`}
                >
                  {selectedAccount.status === 'OK' ? 'COCOK' : 'ADA SELISIH'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selectedAccount.keterangan}
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500">Selisih Akun Ini:</span>
              <div
                className={`text-base font-bold font-mono ${
                  Math.abs(selectedAccount.selisih) < 0.01
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatCurrency(selectedAccount.selisih)}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Drill Down 1: Jurnal Mentah / Direct Posting tanpa Tautan Dokumen */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <BookOpen className="h-4 w-4 text-indigo-500" />
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Jurnal Buku Besar Mentah / Tanpa Tautan Dokumen Subledger
                  </h4>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono font-medium text-slate-600 dark:text-slate-300">
                    {selectedAccount.drillDown?.summary?.totalRawJournals || 0} jurnal
                  </span>
                </div>
                {selectedAccount.drillDown?.summary?.totalRawJournalValue ? (
                  <span className="text-xs text-slate-500 font-mono">
                    Total Nilai: {formatCurrency(selectedAccount.drillDown.summary.totalRawJournalValue)}
                  </span>
                ) : null}
              </div>

              {selectedAccount.drillDown?.rawOrUnlinkedJournals &&
              selectedAccount.drillDown.rawOrUnlinkedJournals.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-2.5">No Jurnal</th>
                        <th className="px-4 py-2.5">Tanggal</th>
                        <th className="px-4 py-2.5">Deskripsi</th>
                        <th className="px-4 py-2.5 text-right">Debit</th>
                        <th className="px-4 py-2.5 text-right">Kredit</th>
                        <th className="px-4 py-2.5">Catatan Audit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedAccount.drillDown.rawOrUnlinkedJournals.map((j: any) => (
                        <tr key={j.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-2.5 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                            {j.journalNumber || j.id}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                            {j.date ? new Date(j.date).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{j.description || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                            {formatCurrency(j.debit)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                            {formatCurrency(j.credit)}
                          </td>
                          <td className="px-4 py-2.5 text-amber-600 dark:text-amber-400 font-medium">
                            {j.reason || 'Direct manual posting ke akun kontrol'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 text-xs text-slate-500 text-center">
                  Tidak ditemukan jurnal mentah tanpa dokumen pada akun kontrol ini.
                </div>
              )}
            </div>

            {/* Drill Down 2: Dokumen Subledger Tanpa Jurnal / Status Gantung */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Dokumen Subledger Belum Terposting / Tanpa Jurnal Terkait
                  </h4>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono font-medium text-slate-600 dark:text-slate-300">
                    {selectedAccount.drillDown?.summary?.totalOrphanDocs || 0} dokumen
                  </span>
                </div>
              </div>

              {selectedAccount.drillDown?.unpostedOrOrphanDocs &&
              selectedAccount.drillDown.unpostedOrOrphanDocs.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-2.5">No Dokumen</th>
                        <th className="px-4 py-2.5">Tipe Dokumen</th>
                        <th className="px-4 py-2.5">Tanggal</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5 text-right">Nilai / Saldo</th>
                        <th className="px-4 py-2.5">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedAccount.drillDown.unpostedOrOrphanDocs.map((doc: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-2.5 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                            {doc.noDokumen || doc.id}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{doc.type || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                            {doc.tanggal ? new Date(doc.tanggal).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                              {doc.status || 'UNPOSTED'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                            {formatCurrency(doc.saldo ?? doc.total ?? doc.jumlah ?? doc.nilai)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {doc.keterangan || 'Dokumen belum terposting ke jurnal Buku Besar'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 text-xs text-slate-500 text-center">
                  Seluruh dokumen subledger telah terposting ke jurnal Buku Besar secara valid.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

