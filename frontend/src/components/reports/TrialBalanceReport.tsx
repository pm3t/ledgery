import React from 'react';
import { TrialBalanceReport as ITrialBalanceReport } from '../../services/api';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  data: ITrialBalanceReport;
}

export const TrialBalanceReport: React.FC<Props> = ({ data }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
        <h3 className="font-bold text-lg text-white">Neraca Saldo</h3>
        {data.isBalanced ? (
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Balanced
          </span>
        ) : (
          <span className="px-3 py-1 bg-rose-500/10 text-rose-400 text-xs font-bold rounded-full flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> Unbalanced
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <th className="p-4 font-semibold">Kode Akun</th>
              <th className="p-4 font-semibold">Nama Akun</th>
              <th className="p-4 font-semibold text-right text-indigo-400/80">Debit</th>
              <th className="p-4 font-semibold text-right text-indigo-400/80">Kredit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {data.items.map((item) => {
              // Jika saldo 0, tidak usah tampilkan atau tampilkan 0
              if (item.debit === 0 && item.kredit === 0) return null;
              
              // Tampilkan saldo normal
              const isDebitNormal = item.coa.kategori === 'ASET' || item.coa.kategori === 'BEBAN';
              const saldoDebit = isDebitNormal ? item.saldo : (item.saldo < 0 ? -item.saldo : 0);
              const saldoKredit = !isDebitNormal ? item.saldo : (item.saldo < 0 ? -item.saldo : 0);
              
              return (
                <tr key={item.coa.id} className="hover:bg-slate-800/30">
                  <td className="p-4 text-slate-400">{item.coa.kode_akun}</td>
                  <td className="p-4 font-medium text-slate-200">{item.coa.nama_akun}</td>
                  <td className="p-4 text-right text-slate-300">
                    {saldoDebit > 0 ? saldoDebit.toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="p-4 text-right text-slate-300">
                    {saldoKredit > 0 ? saldoKredit.toLocaleString('id-ID') : '-'}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-950">
              <td colSpan={2} className="p-4 font-bold text-right text-white">TOTAL</td>
              <td className="p-4 text-right font-bold text-indigo-400 border-t border-slate-700">
                {data.totalDebit.toLocaleString('id-ID')}
              </td>
              <td className="p-4 text-right font-bold text-indigo-400 border-t border-slate-700">
                {data.totalKredit.toLocaleString('id-ID')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
