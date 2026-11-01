import React, { useState, useEffect } from 'react';
import {
  History,
  Landmark,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Eye,
  RotateCcw,
  FileDown,
  Printer,
  Calendar,
  X,
  FileText,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  api,
  CashBankAccount,
  BankReconciliation,
} from '../../services/api';

interface Props {
  onNavigateToNewRecon?: () => void;
}

export const BankReconciliationHistoryPage: React.FC<Props> = ({ onNavigateToNewRecon }) => {
  const [historyList, setHistoryList] = useState<BankReconciliation[]>([]);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SELESAI' | 'DIBUKA_KEMBALI'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedRecon, setSelectedRecon] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reopen Modal State
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<BankReconciliation | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      const res = await api.getCashAccounts();
      const list = Array.isArray(res) ? res : [];
      setAccounts(list.filter((a) => a.jenis === 'BANK'));
    } catch (err: any) {
      console.error('Gagal memuat akun bank:', err);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const accId = selectedAccountId === 'ALL' ? undefined : selectedAccountId;
      const res = await api.getBankReconciliationHistory(accId);
      setHistoryList(Array.isArray(res) ? res : []);
    } catch (err: any) {
      console.error('Gagal memuat riwayat rekonsiliasi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [selectedAccountId]);

  const handleOpenDetail = async (recon: BankReconciliation) => {
    setDetailLoading(true);
    setDetailModalOpen(true);
    try {
      const data = await api.getBankReconciliationDetail(recon.id);
      setSelectedRecon(data);
    } catch (err: any) {
      console.error('Gagal mengambil rincian rekonsiliasi:', err);
      alert('Gagal mengambil rincian rekonsiliasi: ' + (err.message || 'Error'));
      setDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenReopenModal = (recon: BankReconciliation) => {
    setReopenTarget(recon);
    setReopenReason('');
    setReopenError(null);
    setReopenModalOpen(true);
  };

  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTarget) return;
    if (!reopenReason.trim() || reopenReason.trim().length < 5) {
      setReopenError('Alasan pembukaan kembali wajib diisi minimal 5 karakter.');
      return;
    }

    setReopenSubmitting(true);
    setReopenError(null);
    try {
      await api.reopenBankReconciliation(reopenTarget.id, reopenReason.trim());
      setReopenModalOpen(false);
      setReopenTarget(null);
      await fetchHistory();
      alert('Rekonsiliasi bank berhasil dibuka kembali. Seluruh penanda cleared telah dicabut.');
    } catch (err: any) {
      setReopenError(err.message || 'Gagal membuka kembali rekonsiliasi.');
    } finally {
      setReopenSubmitting(false);
    }
  };

  const formatCurrency = (val: number | undefined | null) => {
    if (val === undefined || val === null) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Filter list
  const filteredHistory = historyList.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const accountMatch =
        item.cashBankAccount?.nama.toLowerCase().includes(q) ||
        item.cashBankAccount?.kode.toLowerCase().includes(q) ||
        (item.cashBankAccount?.namaBank && item.cashBankAccount.namaBank.toLowerCase().includes(q)) ||
        (item.cashBankAccount?.noRekening && item.cashBankAccount.noRekening.toLowerCase().includes(q));
      const reasonMatch = item.reopenReason?.toLowerCase().includes(q);
      if (!accountMatch && !reasonMatch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <History className="w-7 h-7 text-emerald-700" />
            Riwayat Rekonsiliasi Bank
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Arsip lengkap laporan rekonsiliasi bank yang telah diselesaikan atau dibuka kembali beserta catatan audit.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchHistory}
            disabled={loading}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition-colors shadow-sm"
            title="Muat Ulang"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          {onNavigateToNewRecon && (
            <button
              type="button"
              onClick={onNavigateToNewRecon}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              <Landmark className="w-4 h-4" />
              Rekonsiliasi Baru
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Pilih Rekening */}
          <div className="w-full md:w-64">
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Rekening Bank
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="ALL">Semua Rekening Bank</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.kode} - {acc.nama} ({acc.namaBank || 'Bank'})
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Tabs */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Status</label>
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('SELESAI')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'SELESAI'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Selesai
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('DIBUKA_KEMBALI')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'DIBUKA_KEMBALI'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dibuka Kembali
              </button>
            </div>
          </div>
        </div>

        {/* Search Box */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari rekening / catatan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* Tabel Riwayat */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
              <tr>
                <th className="py-3 px-4 font-bold">Tanggal Cut-Off</th>
                <th className="py-3 px-4 font-bold">Rekening Bank</th>
                <th className="py-3 px-4 text-right font-bold">Saldo Rekening Koran</th>
                <th className="py-3 px-4 text-right font-bold">Saldo Buku</th>
                <th className="py-3 px-4 text-center font-bold">Status</th>
                <th className="py-3 px-4 font-bold">Penyelesaian / Petugas</th>
                <th className="py-3 px-4 text-right font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Memuat data riwayat rekonsiliasi...
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Belum ada riwayat rekonsiliasi yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => {
                  const isCompleted = item.status === 'SELESAI';
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                          {new Date(item.tanggalAkhir).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.cashBankAccount?.nama}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {item.cashBankAccount?.namaBank} • {item.cashBankAccount?.noRekening || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(item.saldoRekeningKoran)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(item.saldoBuku)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            Selesai
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <RotateCcw className="w-3 h-3 text-amber-700" />
                            Dibuka Kembali
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isCompleted ? (
                          <div>
                            <div className="font-medium text-slate-800">
                              {item.completedBy ? `Petugas ID: ${item.completedBy}` : 'Selesai'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {item.completedAt
                                ? new Date(item.completedAt).toLocaleString('id-ID')
                                : '-'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium text-amber-800">
                              Dibuka: {item.reopenedBy ? item.reopenedBy : '-'}
                            </div>
                            <div className="text-[10px] text-amber-700 max-w-xs truncate" title={item.reopenReason || ''}>
                              Alasan: {item.reopenReason || '-'}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                            title="Lihat Rincian Rekonsiliasi"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Rincian
                          </button>

                          {isCompleted && (
                            <button
                              type="button"
                              onClick={() => handleOpenReopenModal(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition-colors"
                              title="Buka Kembali Rekonsiliasi Ini"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Buka Kembali
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: RINCIAN REKONSILIASI
          ========================================================================= */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Rincian Rekonsiliasi Bank
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedRecon?.cashBankAccount?.nama} • Cut-off:{' '}
                    {selectedRecon?.tanggalAkhir
                      ? new Date(selectedRecon.tanggalAkhir).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : '-'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-16 text-center text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-2" />
                Memuat rincian rekonsiliasi...
              </div>
            ) : selectedRecon ? (
              <div className="space-y-6">
                {/* Status Box */}
                {selectedRecon.status === 'DIBUKA_KEMBALI' && (
                  <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs">
                    <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-sm">Rekonsiliasi Ini Telah Dibuka Kembali</div>
                      <p className="mt-1">
                        Dibuka oleh: <strong>{selectedRecon.reopenedBy || 'Petugas'}</strong> pada{' '}
                        {selectedRecon.reopenedAt
                          ? new Date(selectedRecon.reopenedAt).toLocaleString('id-ID')
                          : '-'}
                        .
                      </p>
                      <p className="mt-1 italic font-medium">Alasan: "{selectedRecon.reopenReason}"</p>
                    </div>
                  </div>
                )}

                {/* Ringkasan Angka */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Saldo Rekening Koran</div>
                    <div className="font-mono font-bold text-slate-900 text-base mt-0.5">
                      {formatCurrency(selectedRecon.saldoRekeningKoran)}
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Saldo Buku Kas/Bank</div>
                    <div className="font-mono font-bold text-slate-900 text-base mt-0.5">
                      {formatCurrency(selectedRecon.saldoBuku)}
                    </div>
                  </div>
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="text-[10px] text-emerald-800 uppercase font-bold">Selisih Final</div>
                    <div className="font-mono font-bold text-emerald-950 text-base mt-0.5">
                      {formatCurrency(selectedRecon.selisih)} (SEIMBANG)
                    </div>
                  </div>
                </div>

                {/* Daftar Pasangan Match */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Transaksi Yang Dicocokkan ({selectedRecon.matches?.length || 0} Pasangan)
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-800">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase font-bold text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Baris Rekening Koran</th>
                          <th className="py-2.5 px-3">Entri Buku Kas</th>
                          <th className="py-2.5 px-3 text-right">Alokasi Match</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(!selectedRecon.matches || selectedRecon.matches.length === 0) ? (
                          <tr>
                            <td colSpan={3} className="py-6 text-center text-slate-400">
                              Tidak ada data pasangan yang tercatat.
                            </td>
                          </tr>
                        ) : (
                          selectedRecon.matches.map((m: any) => (
                            <tr key={m.id} className="hover:bg-slate-50/70">
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-900">
                                  {m.statementLine ? new Date(m.statementLine.tanggal).toLocaleDateString('id-ID') : '-'}
                                </div>
                                <div className="text-[11px] text-slate-600 truncate max-w-xs">
                                  {m.statementLine?.keterangan || '-'}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-900">
                                  {m.cashBankEntry ? new Date(m.cashBankEntry.tanggal).toLocaleDateString('id-ID') : '-'}
                                </div>
                                <div className="text-[11px] text-slate-600 truncate max-w-xs">
                                  {m.cashBankEntry?.keterangan || m.cashBankEntry?.sourceType || '-'}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                                {formatCurrency(m.jumlahAlokasi)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer Modal */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <div className="text-xs text-slate-500">
                    Diselesaikan oleh: <strong>{selectedRecon.completedBy || 'Petugas'}</strong> pada{' '}
                    {selectedRecon.completedAt
                      ? new Date(selectedRecon.completedAt).toLocaleString('id-ID')
                      : '-'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Cetak Laporan
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailModalOpen(false)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: BUKA KEMBALI REKONSILIASI (REOPEN)
          ========================================================================= */}
      {reopenModalOpen && reopenTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl flex-shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Buka Kembali Rekonsiliasi Bank?
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Rekening: <strong>{reopenTarget.cashBankAccount?.nama}</strong> (Cut-off:{' '}
                  {new Date(reopenTarget.tanggalAkhir).toLocaleDateString('id-ID')})
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                Konsekuensi Tindakan:
              </div>
              <p>
                1. Seluruh entri kas/bank yang telah dicocokkan pada rekonsiliasi ini akan <strong>dicabut status Cleared-nya</strong>.
              </p>
              <p>
                2. Status rekonsiliasi akan berubah menjadi <strong>DIBUKA KEMBALI</strong> dan tercatat pada audit trail.
              </p>
              <p>
                3. Hanya rekonsiliasi paling akhir (terbaru) per rekening yang diizinkan untuk dibuka kembali.
              </p>
            </div>

            {reopenError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{reopenError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmReopen} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Alasan Pembukaan Kembali <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Contoh: Terdapat baris mutasi setoran giro yang salah dipasangkan, perlu dikoreksi..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReopenModalOpen(false)}
                  disabled={reopenSubmitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={reopenSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                >
                  {reopenSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      Konfirmasi Buka Kembali
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankReconciliationHistoryPage;

