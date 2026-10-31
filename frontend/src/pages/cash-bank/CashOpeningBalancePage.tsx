import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Landmark,
  Save,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  api,
  CashBankAccount,
} from '../../services/api';

/**
 * Halaman Impor & Pengaturan Saldo Awal Kas & Bank (Cut-Off Migration)
 * Membentuk entri awal bertipe OPENING pada subledger buku kas tanpa menduplikasi jurnal GL.
 * Memvalidasi kesesuaian antara saldo awal subledger dengan saldo akun kontrol GL saat cut-off.
 */
export const CashOpeningBalancePage: React.FC = () => {
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [cutoffDate, setCutoffDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [balances, setBalances] = useState<Record<string, { saldo: number; kurs: number }>>({});

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [accRes, statusRes] = await Promise.all([
        api.getCashAccounts(),
        api.getCashOpeningBalanceStatus(),
      ]);
      const accList = Array.isArray(accRes) ? accRes : [];
      setAccounts(accList);
      setStatusInfo(statusRes);

      // Inisialisasi input form
      const initial: Record<string, { saldo: number; kurs: number }> = {};
      for (const a of accList) {
        initial[a.id] = { saldo: 0, kurs: 1 };
      }
      setBalances(initial);
    } catch (err: any) {
      console.error('Gagal memuat status saldo awal:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleBalanceChange = (accountId: string, field: 'saldo' | 'kurs', val: number) => {
    setBalances((prev) => ({
      ...prev,
      [accountId]: {
        ...prev[accountId],
        [field]: val,
      },
    }));
  };

  const calculateTotalFungsional = () => {
    let total = 0;
    for (const acc of accounts) {
      const b = balances[acc.id];
      if (b) {
        total += (b.saldo || 0) * (b.kurs || 1);
      }
    }
    return total;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('Apakah Anda yakin ingin menetapkan saldo awal buku kas & bank ini?')) return;

    setSubmitting(true);
    setFeedback(null);

    const items = accounts.map((acc) => {
      const b = balances[acc.id] || { saldo: 0, kurs: 1 };
      return {
        cashBankAccountId: acc.id,
        saldo: Number(b.saldo),
        kurs: Number(b.kurs) || 1,
      };
    });

    try {
      const res = await api.importCashOpeningBalance({
        cutoffDate,
        items,
      });
      setFeedback({
        type: 'success',
        message: `Saldo awal kas & bank berhasil disimpan (${res.importedCount} rekening diperbarui).`,
      });
      loadData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Gagal menyimpan saldo awal kas & bank',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (val: number | undefined | null) => {
    if (val === undefined || val === null) return '0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
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
            <UploadCloud className="w-7 h-7 text-emerald-700" />
            Saldo Awal Kas & Bank (Cut-Off)
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Penetapan saldo awal buku rekening kas dan bank saat migrasi ke subledger tanpa menduplikasi jurnal buku besar.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition-colors shadow-sm self-start md:self-auto"
          title="Muat Ulang"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Status Rekonsiliasi Saldo Awal */}
      {statusInfo && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Total Saldo GL Akun Kontrol</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {formatCurrency(statusInfo.totalGL || 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Saldo saat ini pada akun buku besar bertipe CASH_BANK</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Total Saldo Buku Kas (Subledger)</div>
            <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">
              {formatCurrency(statusInfo.totalSubledger || 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Akumulasi saldo berjalan dari mutasi buku kas</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Status Kecocokan / Selisih</div>
            <div
              className={`text-2xl font-bold font-mono mt-1 ${
                Math.abs(statusInfo.selisih || 0) < 0.01 ? 'text-emerald-700' : 'text-amber-600'
              }`}
            >
              {Math.abs(statusInfo.selisih || 0) < 0.01 ? 'Cocok (Reconciled)' : formatCurrency(statusInfo.selisih)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {Math.abs(statusInfo.selisih || 0) < 0.01
                ? 'Saldo awal subledger cocok dengan buku besar'
                : 'Perlu penyesuaian saldo awal agar rekonsiliasi pas'}
            </div>
          </div>
        </div>
      )}

      {/* Info Petunjuk */}
      <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-3">
        <HelpCircle className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-bold">Mekanisme Cut-Off Tanpa Jurnal Ganda</div>
          <p className="text-[11px] text-emerald-800 mt-0.5">
            Saat pertama kali mengaktifkan subledger kas & bank, saldo awal dimasukkan sebagai baris entri cut-off
            bertipe <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono">OPENING</code>. Entri ini HANYA
            mencatat saldo awal di buku pembantu kas/bank dan TIDAK membentuk jurnal buku besar (karena saldo GL sudah
            tercatat di neraca saldo awal).
          </p>
        </div>
      </div>

      {/* Form Input Saldo Awal per Rekening */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Rincian Saldo Awal per Rekening Kas & Bank</h3>
            <p className="text-slate-500 text-xs">Masukkan saldo per tanggal cut-off migrasi sistem</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-700">Tanggal Cut-Off:</label>
            <input
              type="date"
              required
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
              <tr>
                <th className="py-3 px-4 font-bold">Kode</th>
                <th className="py-3 px-4 font-bold">Nama Rekening</th>
                <th className="py-3 px-4 font-bold">Jenis</th>
                <th className="py-3 px-4 font-bold">Mata Uang</th>
                <th className="py-3 px-4 text-right font-bold w-48">Saldo Awal</th>
                <th className="py-3 px-4 text-right font-bold w-36">Kurs Valas</th>
                <th className="py-3 px-4 text-right font-bold">Ekuivalen (IDR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Memuat rekening...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Belum ada rekening kas atau bank terdaftar.
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => {
                  const b = balances[acc.id] || { saldo: 0, kurs: 1 };
                  const eq = (b.saldo || 0) * (b.kurs || 1);
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{acc.kode}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{acc.nama}</td>
                      <td className="py-3 px-4 text-slate-600">{acc.jenis}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{acc.mata_uang}</td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          step={1}
                          value={b.saldo}
                          onChange={(e) => handleBalanceChange(acc.id, 'saldo', Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg px-2.5 py-1.5 text-right font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          step={0.01}
                          disabled={acc.mata_uang === 'IDR'}
                          value={acc.mata_uang === 'IDR' ? 1 : b.kurs}
                          onChange={(e) => handleBalanceChange(acc.id, 'kurs', Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg px-2.5 py-1.5 text-right font-mono disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">
                        {formatCurrency(eq)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
              <tr>
                <td colSpan={6} className="py-3 px-4 text-right text-slate-700">
                  Total Saldo Awal (IDR):
                </td>
                <td className="py-3 px-4 text-right font-mono text-emerald-950 text-sm">
                  {formatCurrency(calculateTotalFungsional())}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex justify-end pt-3">
          <button
            type="submit"
            disabled={submitting || accounts.length === 0}
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {submitting ? 'Menyimpan Saldo Awal...' : 'Tetapkan Saldo Awal Kas & Bank'}
          </button>
        </div>
      </form>
    </div>
  );
};
export default CashOpeningBalancePage;

