import React from 'react';
import { BalanceSheetReport as IBalanceSheetReport } from '../../services/api';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  data: IBalanceSheetReport;
}

export const BalanceSheetReport: React.FC<Props> = ({ data }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 space-y-8">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h3 className="font-bold text-xl text-white">Neraca (Balance Sheet)</h3>
          <p className="text-sm text-slate-400 mt-1">Laporan posisi keuangan</p>
        </div>
        {data.isBalanced ? (
          <span className="px-4 py-2 bg-emerald-500/10 text-emerald-400 text-sm font-bold rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Aset = Liabilitas + Ekuitas
          </span>
        ) : (
          <span className="px-4 py-2 bg-rose-500/10 text-rose-400 text-sm font-bold rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Tidak Balance
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Kolom ASET */}
        <div>
          <h4 className="font-bold text-lg text-emerald-400 border-b border-slate-800 pb-2 mb-4">ASET</h4>
          <table className="w-full text-sm">
            <tbody>
              {data.aset.map(item => (
                <tr key={item.coa.id} className="border-b border-slate-800/50">
                  <td className="py-3 text-slate-300">{item.coa.kode_akun} - {item.coa.nama_akun}</td>
                  <td className="py-3 text-right font-medium text-slate-200">{item.saldo.toLocaleString('id-ID')}</td>
                </tr>
              ))}
              <tr className="bg-emerald-950/20">
                <td className="py-3 px-2 font-bold text-emerald-500">TOTAL ASET</td>
                <td className="py-3 px-2 text-right font-bold text-emerald-400 text-lg border-t-2 border-emerald-500/50">
                  {data.totalAset.toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Kolom LIABILITAS & EKUITAS */}
        <div className="space-y-8">
          <div>
            <h4 className="font-bold text-lg text-rose-400 border-b border-slate-800 pb-2 mb-4">LIABILITAS</h4>
            <table className="w-full text-sm">
              <tbody>
                {data.liabilitas.map(item => (
                  <tr key={item.coa.id} className="border-b border-slate-800/50">
                    <td className="py-3 text-slate-300">{item.coa.kode_akun} - {item.coa.nama_akun}</td>
                    <td className="py-3 text-right font-medium text-slate-200">{item.saldo.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
                <tr className="bg-rose-950/20">
                  <td className="py-3 px-2 font-bold text-rose-500">TOTAL LIABILITAS</td>
                  <td className="py-3 px-2 text-right font-bold text-rose-400 border-t border-rose-500/50">
                    {data.totalLiabilitas.toLocaleString('id-ID')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="font-bold text-lg text-indigo-400 border-b border-slate-800 pb-2 mb-4">EKUITAS</h4>
            <table className="w-full text-sm">
              <tbody>
                {data.ekuitas.map(item => (
                  <tr key={item.coa.id} className="border-b border-slate-800/50">
                    <td className="py-3 text-slate-300">{item.coa.kode_akun} - {item.coa.nama_akun}</td>
                    <td className="py-3 text-right font-medium text-slate-200">{item.saldo.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-800/50 bg-indigo-950/10">
                  <td className="py-3 px-2 text-slate-300 italic">Laba/Rugi Tahun Berjalan</td>
                  <td className="py-3 px-2 text-right font-medium text-slate-200 italic">{data.labaBersihBerjalan.toLocaleString('id-ID')}</td>
                </tr>
                <tr className="bg-indigo-950/20">
                  <td className="py-3 px-2 font-bold text-indigo-400">TOTAL EKUITAS</td>
                  <td className="py-3 px-2 text-right font-bold text-indigo-300 border-t border-indigo-500/50">
                    {data.totalEkuitas.toLocaleString('id-ID')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* TOTAL PASIVA */}
          <table className="w-full text-sm mt-4">
            <tbody>
              <tr className="bg-slate-800/50">
                <td className="py-4 px-3 font-bold text-white text-lg">TOTAL LIABILITAS & EKUITAS</td>
                <td className="py-4 px-3 text-right font-bold text-white text-lg border-t-2 border-slate-600">
                  {data.totalPasiva.toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
