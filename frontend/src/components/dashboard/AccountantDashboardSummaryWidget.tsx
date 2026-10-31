import React, { useState, useEffect } from 'react';
import { api, Tenant, AccountantDashboardSummary } from '../../services/api';
import {
  TrendingUp,
  CreditCard,
  Package,
  Clock,
  ShoppingCart,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
  onNavigate?: (tab: string) => void;
}

export const AccountantDashboardSummaryWidget: React.FC<Props> = ({ currentTenant, onNavigate }) => {
  const [data, setData] = useState<AccountantDashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentTenant) return;
    let isMounted = true;
    setLoading(true);

    api.getAccountantDashboardSummary(currentTenant.id)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        console.warn('Dashboard summary not available or subledger off:', err?.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentTenant?.id]);

  if (!currentTenant || (!loading && !data)) return null;

  const formatCurrency = (val: number | undefined | null) => {
    if (val === undefined || val === null) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-center space-x-2 text-xs text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
        <span>Memuat ringkasan sub ledger & buku besar...</span>
      </div>
    );
  }

  const isReconciled = data?.statusRekonsiliasi === 'OK';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Scale className="h-4 w-4 text-indigo-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Ringkasan Keuangan & Sub Ledger
          </h3>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate('subledger-reconciliation')}
            className="flex items-center space-x-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <span>Halaman Audit Rekonsiliasi</span>
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Piutang */}
        <div
          onClick={() => onNavigate?.('ar-invoices')}
          className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 hover:border-slate-700 transition-all shadow-sm group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Total Piutang (AR)</span>
            <TrendingUp className="h-3.5 w-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-white font-mono">
            {formatCurrency(data?.totalPiutang)}
          </div>
          <div className="mt-1 text-[10px] text-slate-500">Saldo invoice belum lunas</div>
        </div>

        {/* Total Hutang */}
        <div
          onClick={() => onNavigate?.('ap-bills')}
          className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 hover:border-slate-700 transition-all shadow-sm group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Total Hutang (AP)</span>
            <CreditCard className="h-3.5 w-3.5 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-white font-mono">
            {formatCurrency(data?.totalHutang)}
          </div>
          <div className="mt-1 text-[10px] text-slate-500">Saldo tagihan belum dibayar</div>
        </div>

        {/* Nilai Persediaan */}
        <div
          onClick={() => onNavigate?.('inventory-reports')}
          className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 hover:border-slate-700 transition-all shadow-sm group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Nilai Persediaan</span>
            <Package className="h-3.5 w-3.5 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-white font-mono">
            {formatCurrency(data?.nilaiPersediaan)}
          </div>
          <div className="mt-1 text-[10px] text-slate-500">Total valuasi stok gudang</div>
        </div>

        {/* Faktur Jatuh Tempo */}
        <div
          onClick={() => onNavigate?.('ar-reports')}
          className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 hover:border-slate-700 transition-all shadow-sm group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Jatuh Tempo (Overdue)</span>
            <Clock className="h-3.5 w-3.5 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-rose-400 font-mono">
            {data?.jumlahFakturJatuhTempo || 0} Faktur
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {data?.detailJatuhTempo?.piutangJatuhTempo || 0} AR / {data?.detailJatuhTempo?.hutangJatuhTempo || 0} AP
          </div>
        </div>

        {/* Pesanan Terbuka */}
        <div
          onClick={() => onNavigate?.('order-sales-orders')}
          className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 hover:border-slate-700 transition-all shadow-sm group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Pesanan Terbuka</span>
            <ShoppingCart className="h-3.5 w-3.5 text-purple-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-white font-mono">
            {(data?.jumlahPoTerbuka || 0) + (data?.jumlahSoTerbuka || 0)} Order
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {data?.jumlahSoTerbuka || 0} SO / {data?.jumlahPoTerbuka || 0} PO
          </div>
        </div>

        {/* Status Rekonsiliasi */}
        <div
          onClick={() => onNavigate?.('subledger-reconciliation')}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-sm group ${
            isReconciled
              ? 'border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-500/50'
              : 'border-rose-500/30 bg-rose-950/20 hover:border-rose-500/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">Rekonsiliasi GL</span>
            {isReconciled ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            )}
          </div>
          <div
            className={`mt-1.5 text-sm font-bold font-mono ${
              isReconciled ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isReconciled ? 'SEIMBANG (OK)' : 'ADA SELISIH'}
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {isReconciled ? 'Selisih Rp 0' : `Selisih ${formatCurrency(data?.totalSelisihAbsolut)}`}
          </div>
        </div>
      </div>
    </div>
  );
};

