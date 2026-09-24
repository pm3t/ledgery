import React from 'react';
import { CashFlowReport as ICashFlowReport } from '../../services/api';
import { Activity, Briefcase, Landmark } from 'lucide-react';

interface Props {
  data: ICashFlowReport;
}

export const CashFlowReport: React.FC<Props> = ({ data }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h3 className="font-bold text-xl text-white">Laporan Arus Kas</h3>
        <p className="text-sm text-slate-400 mt-1">Metode Tidak Langsung (Indirect Method)</p>
      </div>

      <div className="space-y-6">
        {/* AKTIVITAS OPERASI */}
        <div className="bg-slate-950/50 rounded-xl border border-slate-800 p-5">
          <h4 className="font-bold text-emerald-400 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
            <Activity className="w-5 h-5" /> Arus Kas dari Aktivitas Operasi
          </h4>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-2 text-slate-200 font-medium">Laba (Rugi) Bersih</td>
                <td className="py-2 text-right font-medium text-white">{data.labaBersih.toLocaleString('id-ID')}</td>
              </tr>
              <tr>
                <td colSpan={2} className="py-2 text-slate-400 italic text-xs pt-4">Penyesuaian untuk merekonsiliasi laba bersih menjadi kas bersih:</td>
              </tr>
              {data.aktivitasOperasi.penyesuaian.map((adj, i) => (
                <tr key={i} className="text-slate-300 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2 pl-4 flex justify-between">
                    <span>{adj.keterangan}</span>
                    <span className="text-slate-500 text-xs">{adj.akun}</span>
                  </td>
                  <td className="py-2 text-right">{adj.nilai.toLocaleString('id-ID')}</td>
                </tr>
              ))}
              {data.aktivitasOperasi.penyesuaian.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-2 pl-4 text-slate-500 text-xs">Tidak ada penyesuaian non-kas.</td>
                </tr>
              )}
              <tr className="border-t border-slate-700">
                <td className="py-3 font-bold text-slate-300">Kas Bersih dari Aktivitas Operasi</td>
                <td className="py-3 font-bold text-emerald-400 text-right">{data.aktivitasOperasi.netKas.toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* AKTIVITAS INVESTASI */}
        <div className="bg-slate-950/50 rounded-xl border border-slate-800 p-5 opacity-60">
          <h4 className="font-bold text-amber-400 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
            <Briefcase className="w-5 h-5" /> Arus Kas dari Aktivitas Investasi
          </h4>
          <p className="text-sm text-slate-400 italic mb-2">Belum ada pemetaan aktivitas investasi di versi MVP.</p>
          <div className="flex justify-between border-t border-slate-700 pt-3">
            <span className="font-bold text-slate-300">Kas Bersih dari Aktivitas Investasi</span>
            <span className="font-bold text-amber-400">{data.aktivitasInvestasi.netKas.toLocaleString('id-ID')}</span>
          </div>
        </div>

        {/* AKTIVITAS PENDANAAN */}
        <div className="bg-slate-950/50 rounded-xl border border-slate-800 p-5 opacity-60">
          <h4 className="font-bold text-violet-400 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
            <Landmark className="w-5 h-5" /> Arus Kas dari Aktivitas Pendanaan
          </h4>
          <p className="text-sm text-slate-400 italic mb-2">Belum ada pemetaan aktivitas pendanaan di versi MVP.</p>
          <div className="flex justify-between border-t border-slate-700 pt-3">
            <span className="font-bold text-slate-300">Kas Bersih dari Aktivitas Pendanaan</span>
            <span className="font-bold text-violet-400">{data.aktivitasPendanaan.netKas.toLocaleString('id-ID')}</span>
          </div>
        </div>

        {/* TOTAL KENAIKAN/PENURUNAN KAS */}
        <div className="bg-indigo-950/40 border-2 border-indigo-500/30 rounded-xl p-5 flex justify-between items-center shadow-lg">
          <span className="font-bold text-lg text-white">Kenaikan (Penurunan) Bersih Kas</span>
          <span className={`font-bold text-2xl ${data.netKenaikanKas >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {data.netKenaikanKas.toLocaleString('id-ID')}
          </span>
        </div>
      </div>
    </div>
  );
};
