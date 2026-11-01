import React, { useState, useEffect } from 'react';
import {
  api,
  Tenant,
  SubledgerReconciliationSummary,
  ReconciliationAccountResult,
  ReconciliationCashBankResult,
  ReconciliationFixedAssetResult,
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
  Landmark,
  Package,
  ExternalLink,
} from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
  onNavigate?: (tab: string) => void;
}

type TabType = 'cashBank' | 'ar' | 'ap' | 'inventory' | 'grIrClearing' | 'fixedAsset';

export const SubledgerReconciliationPage: React.FC<Props> = ({ currentTenant, onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SubledgerReconciliationSummary | null>(null);
  const [tanggal, setTanggal] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedTab, setSelectedTab] = useState<TabType>('cashBank');
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

  const getGlBalance = (tab: TabType): number => {
    if (!data?.accounts) return 0;
    if (tab === 'cashBank') return data.accounts.cashBank?.totalGlBalance || 0;
    if (tab === 'fixedAsset') {
      const fa = data.accounts.fixedAsset;
      return (fa?.totalGlPerolehan || 0) - (fa?.totalGlAkumulasi || 0) + (fa?.totalGlCip || 0);
    }
    return (data.accounts as any)[tab]?.glBalance || 0;
  };

  const getSubledgerBalance = (tab: TabType): number => {
    if (!data?.accounts) return 0;
    if (tab === 'cashBank') return data.accounts.cashBank?.totalSubledgerBalance || 0;
    if (tab === 'fixedAsset') {
      const fa = data.accounts.fixedAsset;
      return (fa?.totalSubledgerPerolehan || 0) - (fa?.totalSubledgerAkumulasi || 0) + (fa?.totalSubledgerCip || 0);
    }
    return (data.accounts as any)[tab]?.subledgerBalance || 0;
  };

  const getSelisih = (tab: TabType): number => {
    if (!data?.accounts) return 0;
    if (tab === 'cashBank') return data.accounts.cashBank?.totalSelisih || 0;
    if (tab === 'fixedAsset') return data.accounts.fixedAsset?.totalSelisih || 0;
    return (data.accounts as any)[tab]?.selisih || 0;
  };

  const getStatus = (tab: TabType): 'OK' | 'SELISIH' => {
    if (!data?.accounts) return 'OK';
    if (tab === 'cashBank') return data.accounts.cashBank?.status || 'OK';
    if (tab === 'fixedAsset') return data.accounts.fixedAsset?.status || 'OK';
    return (data.accounts as any)[tab]?.status || 'OK';
  };

  const renderCard = (
    key: TabType,
    label: string,
    badgeTitle: string,
    isFeatureEnabled: boolean,
    icon: React.ElementType,
  ) => {
    const isSelected = selectedTab === key;
    const isOk = getStatus(key) === 'OK';
    const selisih = getSelisih(key);
    const glBal = getGlBalance(key);
    const subBal = getSubledgerBalance(key);
    const IconComp = icon;

    return (
      <div
        onClick={() => setSelectedTab(key)}
        className={`cursor-pointer rounded-xl border p-4 transition-all shadow-sm ${
          isSelected
            ? 'border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/20'
            : 'border-[#cbdcd0] bg-white hover:border-[#a4c2ab]'
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <IconComp className="h-4 w-4 text-emerald-700" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#556c5e]">
                {badgeTitle}
              </span>
              {!isFeatureEnabled && (
                <span className="rounded bg-[#edf2ea] px-1.5 py-0.5 text-[10px] text-[#556c5e] font-semibold border border-[#cbdcd0]">
                  Nonaktif
                </span>
              )}
            </div>
            <h3 className="mt-1 text-sm font-bold text-[#142820]">{label}</h3>
          </div>
          <span
            className={`inline-flex items-center space-x-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              isOk
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {isOk ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                <span>COCOK</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3" />
                <span>SELISIH</span>
              </>
            )}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#edf2ea] pt-2 text-xs">
          <div>
            <div className="text-[10px] text-[#556c5e] font-medium">Saldo GL</div>
            <div className="font-bold font-mono text-[#142820] text-[11px] mt-0.5">
              {formatCurrency(glBal)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#556c5e] font-medium">Saldo Sub Ledger</div>
            <div className="font-bold font-mono text-[#142820] text-[11px] mt-0.5">
              {formatCurrency(subBal)}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between border-t border-dashed border-[#edf2ea] pt-2 text-xs">
          <span className="font-semibold text-[#556c5e] text-[11px]">Selisih:</span>
          <span
            className={`font-mono font-bold text-xs ${
              Math.abs(selisih) < 0.01 ? 'text-emerald-700' : 'text-rose-700'
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
      {/* Header Halaman */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Scale className="h-6 w-6 text-emerald-700" />
            <h1 className="text-2xl font-bold tracking-tight text-[#142820]">
              Rekonsiliasi Sub Ledger vs Buku Besar
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#556c5e]">
            Audit integritas saldo antara Buku Besar (GL) dan saldo dokumen subledger (Kas/Bank, Piutang, Hutang, Persediaan, GR/IR, Aktiva Tetap).
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 rounded-xl border border-[#cbdcd0] bg-white px-3 py-1.5 shadow-sm">
            <Calendar className="h-4 w-4 text-emerald-700" />
            <span className="text-xs font-semibold text-[#142820]">Per Tanggal:</span>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#142820] outline-none"
            />
          </div>

          <button
            onClick={fetchReconciliation}
            disabled={loading}
            className="inline-flex items-center space-x-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>Audit Sekarang</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Audit Banner */}
      {data && (
        <div
          className={`rounded-2xl border p-5 shadow-sm ${
            data.isFullyReconciled
              ? 'border-emerald-300 bg-[#f0fdf4]'
              : 'border-rose-300 bg-rose-50'
          }`}
        >
          <div className="flex items-start space-x-3.5">
            {data.isFullyReconciled ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-rose-700 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h2
                className={`text-base font-bold ${
                  data.isFullyReconciled ? 'text-emerald-900' : 'text-rose-900'
                }`}
              >
                {data.isFullyReconciled
                  ? 'Buku Besar & Sub Ledger Terkonsiliasi Sempurna'
                  : `Ditemukan Selisih Rekonsiliasi Sebesar ${formatCurrency(data.totalSelisihAbsolut)}`}
              </h2>
              <p
                className={`mt-1 text-sm ${
                  data.isFullyReconciled ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {data.isFullyReconciled
                  ? `Seluruh akun kontrol (Kas & Bank, Piutang, Hutang, Persediaan, GR/IR Clearing, Aktiva Tetap) memiliki saldo yang sama persis dengan rincian dokumen subledger per tanggal ${data.tanggal}.`
                  : `Terdapat ketidaksesuaian saldo pada akun kontrol. Gunakan tabel drill-down di bawah untuk mengidentifikasi jurnal langsung tanpa dokumen atau transaksi yang belum terjurnal.`}
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {data.setting.blockPeriodCloseOnRecon && (
                  <span className="inline-flex items-center space-x-1.5 rounded-lg bg-amber-100 px-2.5 py-1 font-semibold text-amber-900 border border-amber-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Kebijakan Aktif: Closing periode diblokir jika ada selisih subledger</span>
                  </span>
                )}
                {data.setting.blockPeriodCloseOnBankRecon && (
                  <span className="inline-flex items-center space-x-1.5 rounded-lg bg-amber-100 px-2.5 py-1 font-semibold text-amber-900 border border-amber-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Kebijakan Aktif: Closing periode diblokir jika rekonsiliasi bank belum SELESAI</span>
                  </span>
                )}
                {data.setting.blockPeriodCloseOnDepreciation && (
                  <span className="inline-flex items-center space-x-1.5 rounded-lg bg-amber-100 px-2.5 py-1 font-semibold text-amber-900 border border-amber-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Kebijakan Aktif: Closing periode diblokir jika penyusutan aset belum diposting</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6 Cards Grid (Kas/Bank, AR, AP, Inventory, GR/IR, Aktiva Tetap) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {renderCard('cashBank', 'Kas & Bank', 'Kas & Bank', !!data?.setting.cashBankEnabled, Landmark)}
        {renderCard('ar', 'Piutang Usaha', 'Piutang AR', !!data?.setting.arEnabled, FileText)}
        {renderCard('ap', 'Hutang Usaha', 'Hutang AP', !!data?.setting.apEnabled, FileText)}
        {renderCard('inventory', 'Persediaan', 'Persediaan', !!data?.setting.inventoryEnabled, Layers)}
        {renderCard('grIrClearing', 'GR/IR Kliring', 'GR/IR', !!data?.setting.orderManagementEnabled, Scale)}
        {renderCard('fixedAsset', 'Aktiva Tetap', 'Aktiva Tetap', !!data?.setting.fixedAssetEnabled, Package)}
      </div>

      {/* DETAIL & DRILL DOWN: KAS & BANK */}
      {selectedTab === 'cashBank' && data?.accounts.cashBank && (
        <div className="rounded-2xl border border-[#cbdcd0] bg-white shadow-sm overflow-hidden">
          <div className="border-b border-[#cbdcd0] bg-[#f7faf6] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Landmark className="h-5 w-5 text-emerald-700" />
                <h3 className="text-base font-bold text-[#142820]">
                  Rincian Rekonsiliasi Kas & Bank per Rekening
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    data.accounts.cashBank.status === 'OK'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {data.accounts.cashBank.status === 'OK' ? 'COCOK' : 'ADA SELISIH'}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#556c5e]">
                Membandingkan saldo GL akun bertipe CASH_BANK dengan total mutasi CashBankEntry per rekening.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#556c5e] font-medium">Total Selisih Kas & Bank:</span>
              <div
                className={`text-base font-bold font-mono ${
                  Math.abs(data.accounts.cashBank.totalSelisih) < 0.01 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatCurrency(data.accounts.cashBank.totalSelisih)}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Tabel Rekening Kas & Bank */}
            <div className="overflow-x-auto rounded-xl border border-[#cbdcd0]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold">
                  <tr>
                    <th className="px-4 py-3">Kode & Nama Rekening</th>
                    <th className="px-4 py-3">Jenis</th>
                    <th className="px-4 py-3">Akun GL</th>
                    <th className="px-4 py-3 text-right">Saldo GL</th>
                    <th className="px-4 py-3 text-right">Saldo Buku Kas (Subledger)</th>
                    <th className="px-4 py-3 text-right">Selisih</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8df]">
                  {data.accounts.cashBank.accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-[#f7faf6]">
                      <td className="px-4 py-3 font-semibold text-[#142820]">
                        {acc.kode} - {acc.nama}
                      </td>
                      <td className="px-4 py-3 text-[#556c5e]">{acc.jenis}</td>
                      <td className="px-4 py-3 font-mono text-[#142820]">
                        {acc.chartOfAccount.kode_akun} - {acc.chartOfAccount.nama_akun}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#142820]">
                        {formatCurrency(acc.glBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#142820]">
                        {formatCurrency(acc.subledgerBalance)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          Math.abs(acc.selisih) < 0.01 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatCurrency(acc.selisih)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            acc.status === 'OK'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {acc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {onNavigate && (
                          <button
                            onClick={() => onNavigate('cash-reports')}
                            className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline inline-flex items-center gap-1"
                          >
                            <span>Buku Kas</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Drill Down Kas: Jurnal Mentah Tanpa Entri Buku Kas */}
            {data.accounts.cashBank.drillDown.rawOrUnlinkedJournals.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <h4 className="text-sm font-bold text-[#142820]">
                    Jurnal Masuk ke Akun Kas/Bank Tanpa Entri Buku Kas (Direct Posting / Gagal Capture)
                  </h4>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    {data.accounts.cashBank.drillDown.rawOrUnlinkedJournals.length} Jurnal
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-amber-200 bg-[#fffbeb]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fef3c7] text-[#92400e] font-bold">
                      <tr>
                        <th className="px-4 py-2.5">No Voucher</th>
                        <th className="px-4 py-2.5">Tanggal</th>
                        <th className="px-4 py-2.5">Rekening Terkait</th>
                        <th className="px-4 py-2.5">Deskripsi</th>
                        <th className="px-4 py-2.5 text-right">Nominal</th>
                        <th className="px-4 py-2.5">Penyebab</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-200/60">
                      {data.accounts.cashBank.drillDown.rawOrUnlinkedJournals.map((j: any, idx: number) => (
                        <tr key={idx} className="hover:bg-amber-100/50">
                          <td className="px-4 py-2 font-mono font-bold text-[#142820]">{j.noVoucher}</td>
                          <td className="px-4 py-2 text-[#556c5e]">
                            {new Date(j.tanggal).toLocaleDateString('id-ID')}
                          </td>
                          <td className="px-4 py-2 font-semibold text-[#142820]">{j.rekening}</td>
                          <td className="px-4 py-2 text-[#142820]">{j.deskripsi}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-[#142820]">
                            {formatCurrency(j.jumlah)}
                          </td>
                          <td className="px-4 py-2 text-amber-900 font-medium">{j.penyebab}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL & DRILL DOWN: AKTIVA TETAP */}
      {selectedTab === 'fixedAsset' && data?.accounts.fixedAsset && (
        <div className="rounded-2xl border border-[#cbdcd0] bg-white shadow-sm overflow-hidden">
          <div className="border-b border-[#cbdcd0] bg-[#f7faf6] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Package className="h-5 w-5 text-emerald-700" />
                <h3 className="text-base font-bold text-[#142820]">
                  Rincian Rekonsiliasi Aktiva Tetap per Kategori
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    data.accounts.fixedAsset.status === 'OK'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {data.accounts.fixedAsset.status === 'OK' ? 'COCOK' : 'ADA SELISIH'}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#556c5e]">
                Membandingkan saldo GL akun perolehan, akumulasi penyusutan/penurunan nilai, dan CIP vs kartu aset subledger.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#556c5e] font-medium">Total Selisih Aktiva Tetap:</span>
              <div
                className={`text-base font-bold font-mono ${
                  Math.abs(data.accounts.fixedAsset.totalSelisih) < 0.01 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatCurrency(data.accounts.fixedAsset.totalSelisih)}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Tabel Kategori Aktiva Tetap */}
            <div className="overflow-x-auto rounded-xl border border-[#cbdcd0]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold">
                  <tr>
                    <th className="px-4 py-3">Kategori Aset</th>
                    <th className="px-4 py-3 text-right">Perolehan (GL)</th>
                    <th className="px-4 py-3 text-right">Perolehan (Subledger)</th>
                    <th className="px-4 py-3 text-right">Akumulasi (GL)</th>
                    <th className="px-4 py-3 text-right">Akumulasi (Subledger)</th>
                    <th className="px-4 py-3 text-right">CIP (GL vs Sub)</th>
                    <th className="px-4 py-3 text-right">Total Selisih</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8df]">
                  {data.accounts.fixedAsset.categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-[#f7faf6]">
                      <td className="px-4 py-3 font-semibold text-[#142820]">
                        {cat.kode} - {cat.nama}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#142820]">
                        {formatCurrency(cat.perolehan.glBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#142820]">
                        {formatCurrency(cat.perolehan.subledgerBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#142820]">
                        {formatCurrency(cat.akumulasi.glBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#142820]">
                        {formatCurrency(cat.akumulasi.subledgerBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#556c5e]">
                        {cat.cip ? `${formatCurrency(cat.cip.glBalance)} / ${formatCurrency(cat.cip.subledgerBalance)}` : '-'}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          Math.abs(cat.totalSelisih) < 0.01 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatCurrency(cat.totalSelisih)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            cat.status === 'OK'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {cat.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Drill Down: Mismatched Assets (Akumulasi Tercatat != Jumlah Entri) */}
            {data.accounts.fixedAsset.drillDown.mismatchedAssets.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-700" />
                  <h4 className="text-sm font-bold text-[#142820]">
                    Inkonsistensi Internal Kartu Aset (Akumulasi Tercatat ≠ Total Entri Penyusutan)
                  </h4>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                    {data.accounts.fixedAsset.drillDown.mismatchedAssets.length} Aset
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-rose-200 bg-rose-50/50">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-rose-100/70 text-rose-900 font-bold">
                      <tr>
                        <th className="px-4 py-2.5">No Aset</th>
                        <th className="px-4 py-2.5">Nama Aset</th>
                        <th className="px-4 py-2.5">Kategori</th>
                        <th className="px-4 py-2.5 text-right">Akumulasi Kartu</th>
                        <th className="px-4 py-2.5 text-right">Total Entri Aktif</th>
                        <th className="px-4 py-2.5 text-right">Selisih</th>
                        <th className="px-4 py-2.5">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-200">
                      {data.accounts.fixedAsset.drillDown.mismatchedAssets.map((a: any, idx: number) => (
                        <tr key={idx} className="hover:bg-rose-100/40">
                          <td className="px-4 py-2 font-mono font-bold text-[#142820]">{a.noAset}</td>
                          <td className="px-4 py-2 font-semibold text-[#142820]">{a.nama}</td>
                          <td className="px-4 py-2 text-[#556c5e]">{a.kategori}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-[#142820]">
                            {formatCurrency(a.akumulasiTercatat)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-[#142820]">
                            {formatCurrency(a.totalEntriPenyusutan)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-rose-700">
                            {formatCurrency(a.selisih)}
                          </td>
                          <td className="px-4 py-2 text-rose-800 font-medium">{a.keterangan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL & DRILL DOWN: AR, AP, INVENTORY, GR/IR */}
      {(selectedTab === 'ar' || selectedTab === 'ap' || selectedTab === 'inventory' || selectedTab === 'grIrClearing') && (
        (() => {
          const acc = data?.accounts?.[selectedTab];
          if (!acc) return null;
          return (
            <div className="rounded-2xl border border-[#cbdcd0] bg-white shadow-sm overflow-hidden">
              <div className="border-b border-[#cbdcd0] bg-[#f7faf6] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-[#142820]">
                      Rincian & Drill-Down:{' '}
                      {selectedTab === 'ar' && 'Piutang Usaha (AR)'}
                      {selectedTab === 'ap' && 'Hutang Usaha (AP)'}
                      {selectedTab === 'inventory' && 'Persediaan Barang'}
                      {selectedTab === 'grIrClearing' && 'GR/IR Clearing'}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        acc.status === 'OK'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {acc.status === 'OK' ? 'COCOK' : 'ADA SELISIH'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#556c5e]">
                    {acc.keterangan}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-[#556c5e] font-medium">Selisih Akun Ini:</span>
                  <div
                    className={`text-base font-bold font-mono ${
                      Math.abs(acc.selisih) < 0.01 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatCurrency(acc.selisih)}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <BookOpen className="h-4 w-4 text-emerald-700" />
                      <h4 className="text-sm font-bold text-[#142820]">
                        Jurnal Buku Besar Mentah / Tanpa Tautan Dokumen Subledger
                      </h4>
                      <span className="rounded-full bg-[#edf2ea] px-2 py-0.5 text-xs font-mono font-bold text-[#142820]">
                        {acc.drillDown?.summary?.totalRawJournals || 0} jurnal
                      </span>
                    </div>
                  </div>

                  {acc.drillDown?.rawOrUnlinkedJournals &&
                  acc.drillDown.rawOrUnlinkedJournals.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-[#cbdcd0]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#eaf1e8] text-[#142e20] uppercase font-bold">
                          <tr>
                            <th className="px-4 py-2.5">No Voucher</th>
                            <th className="px-4 py-2.5">Tanggal</th>
                            <th className="px-4 py-2.5">Deskripsi</th>
                            <th className="px-4 py-2.5 text-right">Debit</th>
                            <th className="px-4 py-2.5 text-right">Kredit</th>
                            <th className="px-4 py-2.5">Penyebab Audit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8df]">
                          {acc.drillDown.rawOrUnlinkedJournals.map((j: any, idx: number) => (
                            <tr key={idx} className="hover:bg-[#f7faf6]">
                              <td className="px-4 py-2.5 font-mono font-bold text-emerald-700">
                                {j.noVoucher || j.id}
                              </td>
                              <td className="px-4 py-2.5 text-[#556c5e]">
                                {j.tanggal ? new Date(j.tanggal).toLocaleDateString('id-ID') : '-'}
                              </td>
                              <td className="px-4 py-2.5 text-[#142820] font-medium">{j.deskripsi || '-'}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-[#142820]">
                                {j.tipe === 'DEBIT' ? formatCurrency(j.jumlah) : '-'}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-[#142820]">
                                {j.tipe === 'KREDIT' ? formatCurrency(j.jumlah) : '-'}
                              </td>
                              <td className="px-4 py-2.5 text-rose-700 font-medium">
                                {j.penyebab || 'Direct posting ke akun kontrol'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#cbdcd0] p-4 text-center text-xs text-[#556c5e]">
                      Tidak ada jurnal langsung tanpa dokumen subledger.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};
