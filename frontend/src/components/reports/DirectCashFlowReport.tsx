import React from 'react';
import { Activity, Briefcase, Landmark, HelpCircle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export interface DirectCashFlowItem {
  kodeAkun: string;
  namaAkun: string;
  nominal: number;
}

export interface DirectCashFlowCategoryGroup {
  arusKasMasuk: number;
  arusKasKeluar: number;
  arusKasBersih: number;
  rincian: DirectCashFlowItem[];
}

export interface DirectCashFlowData {
  periode: {
    startDate: string | null;
    endDate: string | null;
  };
  operasi: DirectCashFlowCategoryGroup;
  investasi: DirectCashFlowCategoryGroup;
  pendanaan: DirectCashFlowCategoryGroup;
  belumDikategorikan: DirectCashFlowCategoryGroup;
  kenaikanPenurunanBersihKas: number;
  saldoAwalKas: number;
  saldoAkhirKas: number;
}

interface Props {
  data: DirectCashFlowData;
  mataUang?: string;
}

export const DirectCashFlowReport: React.FC<Props> = ({ data, mataUang = 'IDR' }) => {
  const formatNum = (num: number) => {
    return (
      <span className={num < 0 ? 'text-rose-400 font-semibold' : 'text-slate-100 font-semibold'}>
        {num < 0 ? `(${Math.abs(num).toLocaleString('id-ID')})` : num.toLocaleString('id-ID')}
      </span>
    );
  };

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    colorClass: string,
    group: DirectCashFlowCategoryGroup,
    emptyMessage = 'Tidak ada transaksi kas pada aktivitas ini.'
  ) => {
    return (
      <div className="bg-slate-950/50 rounded-xl border border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
          <h4 className={`font-bold ${colorClass} flex items-center gap-2`}>
            {icon} {title}
          </h4>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-emerald-400 flex items-center gap-1">
              <ArrowDownLeft className="w-3.5 h-3.5" /> In: {group.arusKasMasuk.toLocaleString('id-ID')}
            </span>
            <span className="text-rose-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> Out: {group.arusKasKeluar.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase border-b border-slate-800/60 pb-2">
              <th className="text-left font-semibold py-1">Akun Lawan</th>
              <th className="text-right font-semibold py-1">Arus Kas Bersih ({mataUang})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {group.rincian.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-3 text-slate-500 text-xs italic">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              group.rincian.map((item, i) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 text-slate-300">
                    <span className="font-mono text-xs text-slate-400 mr-2">{item.kodeAkun}</span>
                    <span className="font-medium">{item.namaAkun}</span>
                  </td>
                  <td className="py-2.5 text-right font-mono">{formatNum(item.nominal)}</td>
                </tr>
              ))
            )}
            <tr className="border-t-2 border-slate-700 font-bold bg-slate-900/40">
              <td className="py-3 text-slate-200">Arus Kas Bersih {title}</td>
              <td className="py-3 text-right font-mono text-base">{formatNum(group.arusKasBersih)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-xl text-white">Laporan Arus Kas Metode Langsung</h3>
          <p className="text-sm text-slate-400 mt-1">
            Menampilkan rincian penerimaan dan pengeluaran kas berdasarkan kategori akun lawan
          </p>
        </div>
        <div className="text-xs bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300 font-mono">
          Periode: {data.periode.startDate || 'Awal'} s/d {data.periode.endDate || 'Sekarang'}
        </div>
      </div>

      <div className="space-y-6">
        {/* Ringkasan Saldo Awal */}
        <div className="flex justify-between items-center bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <span className="text-sm font-semibold text-slate-300">Saldo Awal Kas & Setara Kas</span>
          <span className="text-base font-bold font-mono text-white">
            {mataUang} {data.saldoAwalKas.toLocaleString('id-ID')}
          </span>
        </div>

        {/* 1. AKTIVITAS OPERASI */}
        {renderSection(
          'Aktivitas Operasi',
          <Activity className="w-5 h-5" />,
          'text-emerald-400',
          data.operasi
        )}

        {/* 2. AKTIVITAS INVESTASI */}
        {renderSection(
          'Aktivitas Investasi',
          <Briefcase className="w-5 h-5" />,
          'text-blue-400',
          data.investasi
        )}

        {/* 3. AKTIVITAS PENDANAAN */}
        {renderSection(
          'Aktivitas Pendanaan',
          <Landmark className="w-5 h-5" />,
          'text-purple-400',
          data.pendanaan
        )}

        {/* 4. BELUM DIKATEGORIKAN (Bila ada) */}
        {data.belumDikategorikan.rincian.length > 0 &&
          renderSection(
            'Belum Dikategorikan (Unassigned Category)',
            <HelpCircle className="w-5 h-5" />,
            'text-amber-400',
            data.belumDikategorikan,
            'Semua akun lawan sudah memiliki kategori arus kas.'
          )}

        {/* Rekonsiliasi & Saldo Akhir */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-center text-sm border-b border-slate-800/80 pb-3">
            <span className="font-semibold text-slate-300">Kenaikan (Penurunan) Bersih Kas & Setara Kas</span>
            <span className="font-mono text-base font-bold">
              {formatNum(data.kenaikanPenurunanBersihKas)}
            </span>
          </div>
          <div className="flex justify-between items-center text-base font-bold text-white pt-1">
            <span className="text-emerald-300">Saldo Akhir Kas & Setara Kas</span>
            <span className="font-mono text-lg text-emerald-400">
              {mataUang} {data.saldoAkhirKas.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

