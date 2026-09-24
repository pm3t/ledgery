import React, { useState, useEffect } from 'react';
import { api, Tenant, Journal } from '../services/api';
import { BookOpen, Search, Filter, Loader2 } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
}

export const JournalListPage: React.FC<Props> = ({ currentTenant }) => {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [status, setStatus] = useState<string>('');
  const [sumber, setSumber] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const fetchJournals = async () => {
    if (!currentTenant) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.getJournalsByTenant(currentTenant.id, {
        status,
        sumber,
        startDate,
        endDate,
      });
      setJournals(res);
    } catch (err: any) {
      setError(err.message || 'Gagal mengambil data jurnal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJournals();
  }, [currentTenant, status, sumber, startDate, endDate]);

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'POSTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">POSTED</span>;
      case 'PENDING':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">PENDING</span>;
      case 'APPROVED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">APPROVED</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">REJECTED</span>;
      default:
        return <span>{s}</span>;
    }
  };

  if (!currentTenant) return <div>Pilih tenant terlebih dahulu</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-indigo-400" /> Daftar Jurnal
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Histori seluruh jurnal akuntansi untuk <strong>{currentTenant.nama_perusahaan}</strong>
        </p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex gap-4 flex-wrap items-end">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2"
          >
            <option value="">Semua Status</option>
            <option value="POSTED">POSTED</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Sumber Aplikasi</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari sumber..."
              value={sumber}
              onChange={(e) => setSumber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl pl-9 px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Tanggal Mulai</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Tanggal Akhir</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 flex justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-400">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Tanggal</th>
                  <th className="p-4 font-semibold">No Voucher</th>
                  <th className="p-4 font-semibold">Deskripsi</th>
                  <th className="p-4 font-semibold">Sumber</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Mata Uang</th>
                  <th className="p-4 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {journals.map((j) => {
                  const total = j.entries
                    .filter((e) => e.tipe === 'DEBIT')
                    .reduce((sum, e) => sum + Number(e.jumlah), 0);

                  return (
                    <tr key={j.id} className="hover:bg-slate-800/20 transition-colors group">
                      <td className="p-4 text-sm text-slate-300">
                        {new Date(j.tanggal).toLocaleDateString('id-ID')}
                      </td>
                      <td className="p-4 text-sm font-medium text-indigo-300">
                        {j.no_voucher}
                      </td>
                      <td className="p-4 text-sm text-slate-300">
                        {j.deskripsi}
                      </td>
                      <td className="p-4 text-sm text-slate-400">
                        {j.sumber_aplikasi}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(j.status)}
                      </td>
                      <td className="p-4 text-sm font-semibold text-slate-300">
                        {j.mata_uang || currentTenant.mata_uang}
                      </td>
                      <td className="p-4 text-sm text-slate-300 text-right font-medium">
                        {total.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  );
                })}
                {journals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      Tidak ada data jurnal ditemukan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
