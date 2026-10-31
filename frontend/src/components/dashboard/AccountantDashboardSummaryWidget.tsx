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
      <div className="rounded-2xl border border-stone-200 bg-white p-4 flex items-center justify-center space-x-2 text-xs text-stone-500 shadow-xs">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
        <span>Memuat ringkasan sub ledger & buku besar...</span>
      </div>
    );
  }

  const isReconciled = data?.statusRekonsiliasi === 'OK';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Scale className="h-4 w-4 text-emerald-700" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
            Ringkasan Keuangan & Sub Ledger
          </h3>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate('subledger-reconciliation')}
            className="flex items-center space-x-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
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
          className="cursor-pointer rounded-xl border border-stone-200 bg-white p-3.5 hover:border-emerald-600/40 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500">Total Piutang (AR)</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-stone-900 font-mono">
            {formatCurrency(data?.totalPiutang)}
          </div>
          <div className="mt-1 text-[10px] text-stone-400">Saldo invoice belum lunas</div>
        </div>

        {/* Total Hutang */}
        <div
          onClick={() => onNavigate?.('ap-bills')}
          className="cursor-pointer rounded-xl border border-stone-200 bg-white p-3.5 hover:border-amber-600/40 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500">Total Hutang (AP)</span>
            <CreditCard className="h-3.5 w-3.5 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-stone-900 font-mono">
            {formatCurrency(data?.totalHutang)}
          </div>
          <div className="mt-1 text-[10px] text-stone-400">Saldo tagihan belum dibayar</div>
        </div>

        {/* Nilai Persediaan */}
        <div
          onClick={() => onNavigate?.('inventory-reports')}
          className="cursor-pointer rounded-xl border border-stone-200 bg-white p-3.5 hover:border-teal-600/40 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500">Nilai Persediaan</span>
            <Package className="h-3.5 w-3.5 text-teal-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-stone-900 font-mono">
            {formatCurrency(data?.nilaiPersediaan)}
          </div>
          <div className="mt-1 text-[10px] text-stone-400">Total valuasi stok gudang</div>
        </div>

        {/* Faktur Jatuh Tempo */}
        <div
          onClick={() => onNavigate?.('ar-reports')}
          className="cursor-pointer rounded-xl border border-stone-200 bg-white p-3.5 hover:border-rose-600/40 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500">Jatuh Tempo (Overdue)</span>
            <Clock className="h-3.5 w-3.5 text-rose-500 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-rose-600 font-mono">
            {data?.jumlahFakturJatuhTempo || 0} Faktur
          </div>
          <div className="mt-1 text-[10px] text-stone-400">
            {data?.detailJatuhTempo?.piutangJatuhTempo || 0} AR / {data?.detailJatuhTempo?.hutangJatuhTempo || 0} AP
          </div>
        </div>

        {/* Pesanan Terbuka */}
        <div
          onClick={() => onNavigate?.('order-sales-orders')}
          className="cursor-pointer rounded-xl border border-stone-200 bg-white p-3.5 hover:border-stone-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-500">Pesanan Terbuka</span>
            <ShoppingCart className="h-3.5 w-3.5 text-stone-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-stone-900 font-mono">
            {(data?.jumlahPoTerbuka || 0) + (data?.jumlahSoTerbuka || 0)} Order
          </div>
          <div className="mt-1 text-[10px] text-stone-400">
            {data?.jumlahSoTerbuka || 0} SO / {data?.jumlahPoTerbuka || 0} PO
          </div>
        </div>

        {/* Status Rekonsiliasi */}
        <div
          onClick={() => onNavigate?.('subledger-reconciliation')}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all shadow-xs group ${
            isReconciled
              ? 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-400'
              : 'border-rose-200 bg-rose-50/70 hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-600">Rekonsiliasi GL</span>
            {isReconciled ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
            )}
          </div>
          <div
            className={`mt-1.5 text-sm font-bold font-mono ${
              isReconciled ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {isReconciled ? 'SEIMBANG (OK)' : 'ADA SELISIH'}
          </div>
          <div className="mt-1 text-[10px] text-stone-500">
            {isReconciled ? 'Selisih Rp 0' : `Selisih ${formatCurrency(data?.totalSelisihAbsolut)}`}
          </div>
        </div>
      </div>
    </div>
  );
};

