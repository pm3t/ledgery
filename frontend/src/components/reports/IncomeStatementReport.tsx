import React from 'react';
import { IncomeStatementReport as IIncomeStatementReport } from '../../services/api';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  data: IIncomeStatementReport;
}

export const IncomeStatementReport: React.FC<Props> = ({ data }) => {
  const { main, comparison, hasComparison } = data;

  const renderValue = (val: number, compVal?: number) => {
    if (!hasComparison || compVal === undefined) {
      return <td className="py-2 px-4 text-right text-slate-300">{val.toLocaleString('id-ID')}</td>;
    }

    const diff = val - compVal;
    let Icon = Minus;
    let color = 'text-slate-500';
    
    if (diff > 0) {
      Icon = TrendingUp;
      color = 'text-emerald-400';
    } else if (diff < 0) {
      Icon = TrendingDown;
      color = 'text-rose-400';
    }

    return (
      <>
        <td className="py-2 px-4 text-right text-slate-400">{compVal.toLocaleString('id-ID')}</td>
        <td className="py-2 px-4 text-right text-slate-200 font-medium">{val.toLocaleString('id-ID')}</td>
        <td className={`py-2 px-4 text-right flex justify-end items-center gap-1 ${color}`}>
          <Icon className="w-3 h-3" />
          {Math.abs(diff).toLocaleString('id-ID')}
        </td>
      </>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h3 className="font-bold text-xl text-white">Laba Rugi (Income Statement)</h3>
        <p className="text-sm text-slate-400 mt-1">Laporan kinerja pendapatan dan beban</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <th className="p-4 font-semibold">Akun</th>
              {!hasComparison ? (
                <th className="p-4 font-semibold text-right">Periode Terpilih</th>
              ) : (
                <>
                  <th className="p-4 font-semibold text-right">Periode Lalu</th>
                  <th className="p-4 font-semibold text-right">Periode Terpilih</th>
                  <th className="p-4 font-semibold text-right">Selisih</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {/* PENDAPATAN */}
            <tr>
              <td colSpan={hasComparison ? 4 : 2} className="py-3 px-4 font-bold text-emerald-400 bg-emerald-950/10">PENDAPATAN</td>
            </tr>
            {main.pendapatan.map(item => {
              const compItem = comparison?.pendapatan.find(c => c.coa.id === item.coa.id);
              return (
                <tr key={item.coa.id} className="hover:bg-slate-800/30">
                  <td className="py-2 px-4 pl-8 text-slate-300">{item.coa.kode_akun} - {item.coa.nama_akun}</td>
                  {renderValue(item.saldo, compItem?.saldo)}
                </tr>
              );
            })}
            <tr className="bg-slate-950/30">
              <td className="py-3 px-4 font-bold text-slate-200 pl-8">TOTAL PENDAPATAN</td>
              {renderValue(main.totalPendapatan, comparison?.totalPendapatan)}
            </tr>

            {/* BEBAN */}
            <tr>
              <td colSpan={hasComparison ? 4 : 2} className="py-3 px-4 font-bold text-rose-400 bg-rose-950/10 mt-4">BEBAN</td>
            </tr>
            {main.beban.map(item => {
              const compItem = comparison?.beban.find(c => c.coa.id === item.coa.id);
              return (
                <tr key={item.coa.id} className="hover:bg-slate-800/30">
                  <td className="py-2 px-4 pl-8 text-slate-300">{item.coa.kode_akun} - {item.coa.nama_akun}</td>
                  {renderValue(item.saldo, compItem?.saldo)}
                </tr>
              );
            })}
            <tr className="bg-slate-950/30">
              <td className="py-3 px-4 font-bold text-slate-200 pl-8">TOTAL BEBAN</td>
              {renderValue(main.totalBeban, comparison?.totalBeban)}
            </tr>

            {/* LABA BERSIH */}
            <tr className="bg-indigo-950/20 border-t-2 border-indigo-500/50">
              <td className="py-4 px-4 font-bold text-indigo-400 text-lg">LABA (RUGI) BERSIH</td>
              {hasComparison ? (
                <>
                  <td className="py-4 px-4 text-right font-bold text-slate-400 text-lg">
                    {comparison!.labaBersih.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-indigo-300 text-lg">
                    {main.labaBersih.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {/* Render diff manual for Laba Bersih to ensure styling */}
                    {(() => {
                      const diff = main.labaBersih - comparison!.labaBersih;
                      const isUp = diff > 0;
                      return (
                        <div className={`flex justify-end items-center gap-1 font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {Math.abs(diff).toLocaleString('id-ID')}
                        </div>
                      );
                    })()}
                  </td>
                </>
              ) : (
                <td className="py-4 px-4 text-right font-bold text-indigo-300 text-lg">
                  {main.labaBersih.toLocaleString('id-ID')}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
