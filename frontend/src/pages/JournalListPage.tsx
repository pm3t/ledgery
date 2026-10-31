import React, { useState, useEffect } from 'react';
import { api, Tenant, Journal } from '../services/api';
import { AccountantDashboardSummaryWidget } from '../components/dashboard/AccountantDashboardSummaryWidget';
import {
  BookOpen,
  Search,
  Filter,
  Loader2,
  RotateCcw,
  AlertCircle,
  X,
  CheckCircle2,
  Eye,
  Copy,
  Check,
  Calendar,
  Layers,
  Tag,
  Building,
} from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
  onNavigate?: (tab: string) => void;
}

export const JournalListPage: React.FC<Props> = ({ currentTenant, onNavigate }) => {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [status, setStatus] = useState<string>('');
  const [sumber, setSumber] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Reversal Modal
  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [reversalDate, setReversalDate] = useState<string>('');
  const [reversalReason, setReversalReason] = useState<string>('');
  const [reversalLoading, setReversalLoading] = useState(false);

  // Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailJournal, setDetailJournal] = useState<Journal | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

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

  const openReversalModal = (journal: Journal) => {
    setSelectedJournal(journal);
    setReversalDate(new Date().toISOString().slice(0, 10));
    setReversalReason('');
    setReversalModalOpen(true);
  };

  const openDetailModal = async (journal: Journal) => {
    setDetailJournal(journal);
    setDetailModalOpen(true);
    setCopiedKey(false);
    if (currentTenant) {
      try {
        setDetailLoading(true);
        const detailed = await api.getJournalDetail(currentTenant.id, journal.id);
        setDetailJournal(detailed);
      } catch (err) {
        console.error('Failed to fetch full journal details', err);
      } finally {
        setDetailLoading(false);
      }
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !selectedJournal) return;

    try {
      setReversalLoading(true);
      setError(null);
      const res = await api.reverseJournal(selectedJournal.id, {
        tenantId: currentTenant.id,
        tanggal: reversalDate,
        alasan: reversalReason,
      });

      setSuccessMessage(`Jurnal pembalik ${res.no_voucher} berhasil dibuat dengan status PENDING!`);
      setReversalModalOpen(false);
      setSelectedJournal(null);
      fetchJournals();
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Gagal membuat jurnal reversal');
    } finally {
      setReversalLoading(false);
    }
  };

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

      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between text-emerald-400 text-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400/70 hover:text-emerald-300 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Accountant Dashboard Summary Widget */}
      <AccountantDashboardSummaryWidget currentTenant={currentTenant} onNavigate={onNavigate} />

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
                  <th className="p-4 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {journals.map((j) => {
                  const total = j.entries
                    .filter((e) => e.tipe === 'DEBIT')
                    .reduce((sum, e) => sum + Number(e.jumlah), 0);

                  const canReverse = j.status === 'POSTED' || j.status === 'APPROVED';

                  return (
                    <tr key={j.id} className="hover:bg-slate-800/20 transition-colors group">
                      <td className="p-4 text-sm text-slate-300">
                        {new Date(j.tanggal).toLocaleDateString('id-ID')}
                      </td>
                      <td className="p-4 text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => openDetailModal(j)}
                          className="text-indigo-400 hover:text-indigo-300 font-mono hover:underline flex items-center gap-1.5 transition-colors"
                          title="Klik untuk melihat detail jurnal dan dimensinya"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-indigo-400/70" />
                          {j.no_voucher}
                        </button>
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
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openDetailModal(j)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                            title="Lihat Detail Jurnal & Dimensi"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
                            Detail
                          </button>
                          {canReverse && (
                            <button
                              type="button"
                              onClick={() => openReversalModal(j)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40 transition-colors"
                              title="Buat Jurnal Pembalik"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                              Reverse
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {journals.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      Tidak ada data jurnal ditemukan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detail Jurnal & Dimensi */}
      {detailModalOpen && detailJournal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-lg font-bold text-white">Detail Jurnal</h3>
                    <span className="font-mono text-sm px-2.5 py-0.5 rounded-lg bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 font-semibold flex items-center gap-1.5">
                      {detailJournal.no_voucher}
                      <button
                        type="button"
                        onClick={() => handleCopy(detailJournal.no_voucher)}
                        className="text-indigo-400 hover:text-white transition-colors ml-0.5"
                        title="Salin No Voucher"
                      >
                        {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </span>
                    {getStatusBadge(detailJournal.status)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Rincian entri debit, kredit, dan pemetaan multi-dimensi per baris
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-indigo-400" /> Tanggal Transaksi
                  </span>
                  <div className="text-sm font-semibold text-slate-200 mt-1">
                    {new Date(detailJournal.tanggal).toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Building className="w-3 h-3 text-indigo-400" /> Sumber Aplikasi
                  </span>
                  <div className="text-sm font-semibold text-slate-200 mt-1 truncate" title={detailJournal.sumber_aplikasi}>
                    {detailJournal.sumber_aplikasi}
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-indigo-400" /> Mata Uang
                  </span>
                  <div className="text-sm font-semibold text-indigo-300 mt-1">
                    {detailJournal.mata_uang || currentTenant.mata_uang}
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-indigo-400" /> Waktu Dibuat
                  </span>
                  <div className="text-xs font-semibold text-slate-300 mt-1">
                    {detailJournal.createdAt
                      ? new Date(detailJournal.createdAt).toLocaleString('id-ID')
                      : '-'}
                  </div>
                </div>
              </div>

              {/* Idempotency Key (jika ada) */}
              {detailJournal.idempotency_key && (
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-400 overflow-hidden">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold shrink-0">
                      IDEMPOTENCY KEY
                    </span>
                    <span className="font-mono text-slate-300 truncate">{detailJournal.idempotency_key}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(detailJournal.idempotency_key!)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0 ml-2"
                  >
                    <Copy className="w-3.5 h-3.5" /> Salin
                  </button>
                </div>
              )}

              {/* Deskripsi */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Deskripsi / Keterangan
                </span>
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {detailJournal.deskripsi || '-'}
                </p>
              </div>

              {/* Tabel Entri & Dimensi */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Rincian Baris Entri &amp; Dimensi ({detailJournal.entries.length} Baris)
                  </h4>
                  {detailLoading && (
                    <span className="text-xs text-indigo-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Memperbarui rincian...
                    </span>
                  )}
                </div>

                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 shadow-inner">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3 min-w-[190px]">Akun (COA)</th>
                        <th className="py-2.5 px-3 min-w-[240px]">Alokasi Dimensi</th>
                        <th className="py-2.5 px-4 text-right min-w-[120px]">Debit</th>
                        <th className="py-2.5 px-4 text-right min-w-[120px]">Kredit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {detailJournal.entries.map((entry, idx) => {
                        const isDebit = entry.tipe === 'DEBIT';
                        const amount = Number(entry.jumlah);
                        const dimensions = entry.dimensions || [];

                        return (
                          <tr key={entry.id || idx} className="hover:bg-slate-900/50 transition-colors">
                            <td className="py-3 px-3 text-center text-slate-500 font-mono">
                              {idx + 1}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-mono text-slate-200 font-semibold flex items-center gap-1.5">
                                {entry.chartOfAccount?.kode_akun || '-'}
                                {entry.chartOfAccount?.kategori && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-normal bg-slate-800 text-slate-400">
                                    {entry.chartOfAccount.kategori}
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-400 text-xs mt-0.5">
                                {entry.chartOfAccount?.nama_akun || '-'}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              {dimensions.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {dimensions.map((d, dIdx) => {
                                    const dimName = d.dimensionValue?.dimension?.nama_dimension || 'Dimensi';
                                    const valName = d.dimensionValue?.nama || d.dimensionValueId;
                                    const valCode = d.dimensionValue?.kode;

                                    return (
                                      <span
                                        key={d.id || dIdx}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 shadow-sm"
                                      >
                                        <span className="text-slate-400 font-normal">{dimName}:</span>
                                        <span className="font-semibold text-slate-100">
                                          {valName}
                                          {valCode && <span className="text-indigo-400 font-mono ml-1 font-normal">({valCode})</span>}
                                        </span>
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px] italic">
                                  - Tanpa Dimensi -
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-medium">
                              {isDebit ? (
                                <span className="text-emerald-400 font-semibold">
                                  {amount.toLocaleString('id-ID')}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-medium">
                              {!isDebit ? (
                                <span className="text-slate-200 font-semibold">
                                  {amount.toLocaleString('id-ID')}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-900/90 border-t-2 border-slate-700 font-semibold">
                      {(() => {
                        const totalDebit = detailJournal.entries
                          .filter((e) => e.tipe === 'DEBIT')
                          .reduce((sum, e) => sum + Number(e.jumlah), 0);
                        const totalKredit = detailJournal.entries
                          .filter((e) => e.tipe === 'KREDIT')
                          .reduce((sum, e) => sum + Number(e.jumlah), 0);
                        const isBalanced = Math.abs(totalDebit - totalKredit) < 0.001;

                        return (
                          <tr>
                            <td colSpan={3} className="py-3 px-4">
                              <div className="flex items-center justify-between">
                                <span className="text-xs uppercase tracking-wider text-slate-300 font-bold">
                                  TOTAL VOUCHER
                                </span>
                                {isBalanced ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                                    <CheckCircle2 className="w-4 h-4" /> Seimbang (Balanced)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-rose-400 font-semibold">
                                    <AlertCircle className="w-4 h-4" /> Tidak Seimbang (Selisih: {Math.abs(totalDebit - totalKredit).toLocaleString('id-ID')})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-400 font-bold text-sm">
                              {totalDebit.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-200 font-bold text-sm">
                              {totalKredit.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-between items-center shrink-0">
              <div>
                {(detailJournal.status === 'POSTED' || detailJournal.status === 'APPROVED') && (
                  <button
                    type="button"
                    onClick={() => {
                      const journalToReverse = detailJournal;
                      setDetailModalOpen(false);
                      openReversalModal(journalToReverse);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-amber-500/20 text-amber-400 border border-slate-700 hover:border-amber-500/40 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reverse Jurnal Ini..
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="px-5 py-2 text-sm font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {reversalModalOpen && selectedJournal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                Reverse Jurnal (Pembalik)
              </h3>
              <button
                onClick={() => setReversalModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReverseSubmit} className="p-6 space-y-4">
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Voucher Asli:</span>
                  <span className="font-semibold text-indigo-300">{selectedJournal.no_voucher}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tanggal Asli:</span>
                  <span className="text-slate-200">{new Date(selectedJournal.tanggal).toLocaleDateString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Deskripsi Asli:</span>
                  <span className="text-slate-200 text-right truncate max-w-[260px]">{selectedJournal.deskripsi}</span>
                </div>
                <div className="flex justify-between text-slate-400 border-t border-slate-800/60 pt-2 font-medium">
                  <span>Total Transaksi:</span>
                  <span className="text-white">
                    {selectedJournal.mata_uang || currentTenant.mata_uang}{' '}
                    {selectedJournal.entries
                      .filter((e) => e.tipe === 'DEBIT')
                      .reduce((sum, e) => sum + Number(e.jumlah), 0)
                      .toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-xs text-amber-300/90 leading-relaxed">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  Sistem akan membuat voucher baru dengan membalik posisi <strong>DEBIT &harr; KREDIT</strong>. Jurnal baru akan berstatus <strong>PENDING</strong>, dan posting ke Buku Besar dilakukan secara manual setelahnya melalui menu Persetujuan Jurnal.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Tanggal Jurnal Reversal <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={reversalDate}
                  onChange={(e) => setReversalDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Alasan Reversal (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Koreksi salah catat akun atau nilai transaksi..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReversalModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={reversalLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl shadow-lg shadow-amber-600/20 transition-all"
                >
                  {reversalLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Buat Jurnal Pembalik
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
