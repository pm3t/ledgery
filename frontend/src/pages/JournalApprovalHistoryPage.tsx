import React, { useState, useEffect } from 'react';
import { api, Tenant, ApprovalLog } from '../services/api';
import { BookOpen, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
}

export const JournalApprovalHistoryPage: React.FC<Props> = ({ currentTenant }) => {
  const [history, setHistory] = useState<ApprovalLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentTenant) {
      setLoading(true);
      setError(null);
      api.getApprovalHistory(currentTenant.id)
        .then(setHistory)
        .catch(err => setError(err.message || 'Gagal memuat riwayat approval'))
        .finally(() => setLoading(false));
    }
  }, [currentTenant]);

  if (!currentTenant) return <div>Pilih tenant terlebih dahulu</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-indigo-400" /> Riwayat Approval
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Catatan jejak audit (Audit Trail) persetujuan dan penolakan jurnal untuk tenant ini.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 flex justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <th className="p-4 font-semibold">Tanggal Aksi</th>
                  <th className="p-4 font-semibold">No Voucher</th>
                  <th className="p-4 font-semibold">Aksi</th>
                  <th className="p-4 font-semibold">Aktor / User</th>
                  <th className="p-4 font-semibold">Alasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {history.map(log => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-slate-300">
                      {new Date(log.createdAt).toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 font-medium text-indigo-300">
                      {log.journal.no_voucher}
                      <span className="block text-xs text-slate-500 font-normal mt-0.5 truncate max-w-[200px]">
                        {log.journal.deskripsi}
                      </span>
                    </td>
                    <td className="p-4">
                      {log.action === 'APPROVED' ? (
                        <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                          APPROVED
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 text-xs font-bold">
                          REJECTED
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-400">
                      {log.actorUserId}
                    </td>
                    <td className="p-4 text-slate-300 italic">
                      {log.alasan || '-'}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      Belum ada riwayat persetujuan.
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
