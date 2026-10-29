import React, { useState, useEffect } from 'react';
import { api, Tenant, Journal } from '../services/api';
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
}

export const JournalApprovalPage: React.FC<Props> = ({ currentTenant }) => {
  const [pendingJournals, setPendingJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPendingJournals = async () => {
    if (!currentTenant) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPendingJournals(currentTenant.id);
      setPendingJournals(data);
      window.dispatchEvent(new Event('journal-approval-updated'));
    } catch (err: any) {
      setError(err.message || 'Gagal memuat jurnal PENDING');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingJournals();
  }, [currentTenant]);

  const handleApprove = async (journal: Journal) => {
    if (!currentTenant) return;
    const confirm = window.confirm(`Apakah Anda yakin ingin MENYETUJUI jurnal ${journal.no_voucher}? Jurnal akan langsung diposting ke Buku Besar.`);
    if (!confirm) return;

    try {
      setActionLoading(true);
      await api.approveJournal(journal.id, currentTenant.id);
      await fetchPendingJournals();
      window.dispatchEvent(new Event('journal-approval-updated'));
    } catch (err: any) {
      alert(err.message || 'Gagal menyetujui jurnal');
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = (journal: Journal) => {
    setSelectedJournal(journal);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !selectedJournal) return;
    if (!rejectReason.trim()) {
      alert('Alasan wajib diisi!');
      return;
    }

    try {
      setActionLoading(true);
      await api.rejectJournal(selectedJournal.id, currentTenant.id, rejectReason);
      setRejectModalOpen(false);
      await fetchPendingJournals();
      window.dispatchEvent(new Event('journal-approval-updated'));
    } catch (err: any) {
      alert(err.message || 'Gagal menolak jurnal');
    } finally {
      setActionLoading(false);
    }
  };

  if (!currentTenant) return <div>Pilih tenant terlebih dahulu</div>;

  return (
    <div className="space-y-6 relative">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-amber-400" /> Persetujuan Jurnal
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Tinjau dan setujui jurnal berstatus PENDING sebelum masuk ke pembukuan
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 flex justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : pendingJournals.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
          <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Bagus! Tidak ada jurnal yang menunggu persetujuan.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingJournals.map(journal => {
            const total = journal.entries
              .filter(e => e.tipe === 'DEBIT')
              .reduce((sum, e) => sum + Number(e.jumlah), 0);

            return (
              <div key={journal.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 flex justify-between items-start bg-slate-950/50">
                  <div>
                    <h3 className="font-bold text-lg text-indigo-300">{journal.no_voucher}</h3>
                    <p className="text-sm text-slate-300 mt-1">{journal.deskripsi}</p>
                    <div className="flex gap-4 mt-2 text-xs text-slate-500">
                      <span>Tanggal: {new Date(journal.tanggal).toLocaleDateString('id-ID')}</span>
                      <span>Sumber: {journal.sumber_aplikasi}</span>
                      <span>Mata Uang: {journal.mata_uang || currentTenant.mata_uang}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openRejectModal(journal)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl font-semibold text-sm transition-colors flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4" /> Tolak
                    </button>
                    <button
                      onClick={() => handleApprove(journal)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-sm transition-colors flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Setujui
                    </button>
                  </div>
                </div>
                
                <div className="p-4 bg-slate-900">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800">
                        <th className="pb-2 font-medium">Kode Akun</th>
                        <th className="pb-2 font-medium">Nama Akun</th>
                        <th className="pb-2 font-medium text-right text-emerald-400/80">Debit</th>
                        <th className="pb-2 font-medium text-right text-rose-400/80">Kredit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {journal.entries.map(e => (
                        <tr key={e.id}>
                          <td className="py-2 text-slate-300">{e.chartOfAccount?.kode_akun}</td>
                          <td className="py-2 text-slate-300">{e.chartOfAccount?.nama_akun}</td>
                          <td className="py-2 text-emerald-400 text-right">{e.tipe === 'DEBIT' ? Number(e.jumlah).toLocaleString('id-ID') : '-'}</td>
                          <td className="py-2 text-rose-400 text-right">{e.tipe === 'KREDIT' ? Number(e.jumlah).toLocaleString('id-ID') : '-'}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-950/30">
                        <td colSpan={2} className="py-3 font-bold text-right text-slate-400">Total</td>
                        <td className="py-3 font-bold text-emerald-400 text-right border-t border-slate-700">{total.toLocaleString('id-ID')}</td>
                        <td className="py-3 font-bold text-rose-400 text-right border-t border-slate-700">{total.toLocaleString('id-ID')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && selectedJournal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 bg-rose-500/10">
              <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2">
                <XCircle className="w-5 h-5" /> Tolak Jurnal {selectedJournal.no_voucher}
              </h3>
            </div>
            <form onSubmit={handleRejectSubmit} className="p-4">
              <p className="text-sm text-slate-300 mb-4">
                Jurnal yang ditolak tidak akan diposting ke Buku Besar. Silakan berikan alasan penolakan.
              </p>
              <textarea
                required
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Misal: Salah pilih kode akun beban..."
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl p-3 text-sm h-24 mb-4 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              ></textarea>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !rejectReason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Konfirmasi Tolak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
