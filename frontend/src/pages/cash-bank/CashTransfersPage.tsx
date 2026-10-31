import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  Sparkles,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  Ban,
  Trash2,
  Eye,
  FileText,
  AlertCircle,
  Wallet,
  Landmark,
  ArrowRight,
} from 'lucide-react';
import {
  api,
  CashTransfer,
  CashBankAccount,
  CashTransferVariant,
  CashDocStatus,
} from '../../services/api';

/**
 * Halaman Transfer Kas / Bank & Pengisian Kas Kecil (Replenishment)
 * Mengakomodasi transfer dana antar rekening (multicurrency & biaya admin bank)
 * dan alur pengisian kas kecil berbasis sistem imprest (plafon - saldo berjalan).
 */
export const CashTransfersPage: React.FC = () => {
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingTransfer, setViewingTransfer] = useState<CashTransfer | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    variant: 'TRANSFER' as CashTransferVariant,
    dariAccountId: '',
    keAccountId: '',
    tanggal: new Date().toISOString().slice(0, 10),
    jumlahKeluar: 0,
    jumlahMasuk: 0,
    kurs: 1,
    biayaTransfer: 0,
    catatan: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Petty Cash Suggestion State
  const [suggestion, setSuggestion] = useState<any>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [transRes, accRes] = await Promise.all([
        api.getCashTransfers(),
        api.getCashAccounts(),
      ]);
      setTransfers(Array.isArray(transRes) ? transRes : []);
      setAccounts(Array.isArray(accRes) ? accRes : []);
    } catch (err: any) {
      console.error('Gagal memuat data transfer kas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = (variant: CashTransferVariant = 'TRANSFER') => {
    setViewingTransfer(null);
    setSuggestion(null);

    const bankAcc = accounts.find((a) => a.jenis === 'BANK');
    const pettyAcc = accounts.find((a) => a.jenis === 'KAS_KECIL');
    const defaultKe = variant === 'PENGISIAN_KAS_KECIL' ? pettyAcc?.id || '' : accounts[1]?.id || '';

    setFormData({
      variant,
      dariAccountId: bankAcc?.id || accounts[0]?.id || '',
      keAccountId: defaultKe,
      tanggal: new Date().toISOString().slice(0, 10),
      jumlahKeluar: 0,
      jumlahMasuk: 0,
      kurs: 1,
      biayaTransfer: 0,
      catatan: variant === 'PENGISIAN_KAS_KECIL' ? 'Pengisian Kas Kecil (Imprest)' : '',
    });
    setFormError(null);
    setIsModalOpen(true);

    if (variant === 'PENGISIAN_KAS_KECIL' && defaultKe) {
      fetchSuggestion(defaultKe);
    }
  };

  const fetchSuggestion = async (keAccountId: string) => {
    if (!keAccountId) return;
    setLoadingSuggestion(true);
    try {
      const res = await api.getPettyCashReplenishmentSuggestion(keAccountId);
      setSuggestion(res);
      if (res && res.suggestedNominal !== undefined) {
        setFormData((prev) => ({
          ...prev,
          jumlahKeluar: res.suggestedNominal,
          jumlahMasuk: res.suggestedNominal,
        }));
      }
    } catch (err: any) {
      console.warn('Gagal memuat saran pengisian kas kecil:', err.message);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.dariAccountId || !formData.keAccountId) {
      setFormError('Pilih rekening asal dan rekening tujuan transfer');
      return;
    }
    if (formData.dariAccountId === formData.keAccountId) {
      setFormError('Rekening asal dan tujuan tidak boleh sama');
      return;
    }
    if (formData.jumlahKeluar <= 0) {
      setFormError('Nominal transfer harus lebih besar dari 0');
      return;
    }

    setSubmitting(true);
    try {
      await api.createCashTransfer({
        variant: formData.variant,
        dariAccountId: formData.dariAccountId,
        keAccountId: formData.keAccountId,
        tanggal: formData.tanggal,
        jumlahKeluar: Number(formData.jumlahKeluar),
        jumlahMasuk: Number(formData.jumlahMasuk || formData.jumlahKeluar),
        kurs: Number(formData.kurs) || 1,
        biayaTransfer: Number(formData.biayaTransfer) || undefined,
        catatan: formData.catatan,
      });
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan transaksi transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin memposting transaksi transfer ini ke buku besar?')) return;
    try {
      await api.postCashTransfer(id);
      loadData();
    } catch (err: any) {
      alert(`Gagal memposting transfer: ${err.message}`);
    }
  };

  const handleVoid = async (id: string) => {
    const reason = prompt('Masukkan alasan pembatalan (void) transfer ini:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Alasan pembatalan wajib diisi');
      return;
    }

    try {
      await api.voidCashTransfer(id, reason);
      loadData();
    } catch (err: any) {
      alert(`Gagal membatalkan transfer: ${err.message}`);
    }
  };

  const filteredTransfers = transfers.filter((t) => {
    const matchSearch =
      t.noDokumen.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.catatan && t.catatan.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.dariAccount && t.dariAccount.nama.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.keAccount && t.keAccount.nama.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchVariant = selectedVariant === 'ALL' || t.variant === selectedVariant;
    return matchSearch && matchVariant;
  });

  const formatCurrency = (val: number, curr = 'IDR') => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const renderStatusBadge = (status: CashDocStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-500" /> Draft
          </span>
        );
      case 'POSTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Posted
          </span>
        );
      case 'VOID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <Ban className="w-3 h-3 text-rose-600" /> Batal (Void)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ArrowRightLeft className="w-7 h-7 text-indigo-700" />
            Transfer Kas / Bank & Pengisian Kas Kecil
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Pindah buku antar rekening bank, penarikan/setoran tunai, dan pengisian kembali kas kecil (imprest replenishment).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition-colors shadow-sm"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => handleOpenAdd('PENGISIAN_KAS_KECIL')}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Wallet className="w-4 h-4" />
            + Pengisian Kas Kecil
          </button>

          <button
            type="button"
            onClick={() => handleOpenAdd('TRANSFER')}
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Transfer Antar Rekening
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ALL', label: 'Semua Transfer' },
              { id: 'TRANSFER', label: 'Transfer Bank / Kas Biasa' },
              { id: 'PENGISIAN_KAS_KECIL', label: 'Pengisian Kas Kecil' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedVariant(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedVariant === tab.id
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari no bukti, rekening, atau catatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* Table Daftar Transfer */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
              <tr>
                <th className="py-3 px-4 font-bold">No. Dokumen</th>
                <th className="py-3 px-4 font-bold">Tanggal</th>
                <th className="py-3 px-4 font-bold">Varian</th>
                <th className="py-3 px-4 font-bold">Rekening Asal</th>
                <th className="py-3 px-4 font-bold">Rekening Tujuan</th>
                <th className="py-3 px-4 text-right font-bold">Jumlah Ditransfer</th>
                <th className="py-3 px-4 text-right font-bold">Biaya Bank</th>
                <th className="py-3 px-4 text-center font-bold">Status</th>
                <th className="py-3 px-4 text-center font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Memuat daftar transfer kas & bank...
                  </td>
                </tr>
              ) : filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Belum ada riwayat transaksi transfer yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{t.noDokumen}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(t.tanggal).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      {t.variant === 'PENGISIAN_KAS_KECIL' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Wallet className="w-3 h-3" /> Replenish
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          Transfer
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{t.dariAccount?.nama || '-'}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{t.keAccount?.nama || '-'}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(Number(t.jumlahKeluar), t.dariAccount?.mata_uang || 'IDR')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {t.biayaTransfer ? formatCurrency(Number(t.biayaTransfer)) : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">{renderStatusBadge(t.status)}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {t.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePost(t.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[11px] shadow-sm transition-colors"
                          >
                            Posting
                          </button>
                        )}
                        {t.status === 'POSTED' && (
                          <button
                            onClick={() => handleVoid(t.id)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-lg text-[11px] transition-colors"
                          >
                            Void
                          </button>
                        )}
                        <button
                          onClick={() => setViewingTransfer(t)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Lihat Rincian"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form Transfer / Pengisian Kas Kecil */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-700" />
                {formData.variant === 'PENGISIAN_KAS_KECIL'
                  ? 'Pengisian Kembali Kas Kecil (Replenishment)'
                  : 'Transfer Antar Rekening Kas / Bank'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Rekening Asal (Kredit) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.dariAccountId}
                    onChange={(e) => setFormData({ ...formData, dariAccountId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-semibold"
                  >
                    <option value="">-- Pilih Rekening Asal --</option>
                    {accounts.filter((a) => a.isActive).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.kode} - {acc.nama} ({acc.jenis})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Rekening Tujuan (Debit) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.keAccountId}
                    onChange={(e) => {
                      const newKe = e.target.value;
                      setFormData({ ...formData, keAccountId: newKe });
                      if (formData.variant === 'PENGISIAN_KAS_KECIL') {
                        fetchSuggestion(newKe);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-semibold"
                  >
                    <option value="">-- Pilih Rekening Tujuan --</option>
                    {accounts.filter((a) => a.isActive).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.kode} - {acc.nama} ({acc.jenis})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Banner Rekomendasi Imprest untuk Kas Kecil */}
              {formData.variant === 'PENGISIAN_KAS_KECIL' && suggestion && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      Analisa Plafon & Voucher Kas Kecil
                    </span>
                    <span className="text-[11px] font-semibold text-amber-800">
                      {suggestion.vouchers?.length || 0} Voucher Belum Diganti
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-amber-200/60">
                    <div className="bg-white/80 p-1.5 rounded-lg border border-amber-100">
                      <div className="text-[10px] text-slate-500">Plafon Imprest</div>
                      <div className="font-bold text-slate-900 font-mono text-[11px]">
                        {formatCurrency(suggestion.plafon)}
                      </div>
                    </div>
                    <div className="bg-white/80 p-1.5 rounded-lg border border-amber-100">
                      <div className="text-[10px] text-slate-500">Saldo Saat Ini</div>
                      <div className="font-bold text-slate-900 font-mono text-[11px]">
                        {formatCurrency(suggestion.saldoSaatIni)}
                      </div>
                    </div>
                    <div className="bg-amber-100/90 p-1.5 rounded-lg border border-amber-300">
                      <div className="text-[10px] text-amber-900 font-bold">Saran Pengisian</div>
                      <div className="font-bold text-emerald-800 font-mono text-[11px]">
                        {formatCurrency(suggestion.suggestedNominal)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nominal Transfer <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Nominal"
                    value={formData.jumlahKeluar || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        jumlahKeluar: Number(e.target.value),
                        jumlahMasuk: Number(e.target.value),
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Biaya Transfer Bank (Jika Ada)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Contoh: 6500"
                    value={formData.biayaTransfer || ''}
                    onChange={(e) => setFormData({ ...formData, biayaTransfer: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tanggal Transaksi</label>
                <input
                  type="date"
                  required
                  value={formData.tanggal}
                  onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan / Keterangan</label>
                <input
                  type="text"
                  placeholder="Contoh: Pengisian kas kecil mingguan atau transfer ke rekening giro"
                  value={formData.catatan}
                  onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Draft Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail Rincian Transfer */}
      {viewingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-700" />
                Bukti Transfer: {viewingTransfer.noDokumen}
              </h3>
              <button
                onClick={() => setViewingTransfer(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase">Rekening Asal</span>
                  <div className="font-bold text-slate-900">{viewingTransfer.dariAccount?.nama}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase">Rekening Tujuan</span>
                  <div className="font-bold text-slate-900">{viewingTransfer.keAccount?.nama}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-500">Tanggal:</span>
                  <div className="font-semibold text-slate-900">
                    {new Date(viewingTransfer.tanggal).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>
                  <div className="mt-0.5">{renderStatusBadge(viewingTransfer.status)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Nominal Transfer:</span>
                  <div className="font-mono font-bold text-slate-900 text-sm">
                    {formatCurrency(Number(viewingTransfer.jumlahKeluar))}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Biaya Transfer:</span>
                  <div className="font-mono font-semibold text-slate-700">
                    {viewingTransfer.biayaTransfer ? formatCurrency(Number(viewingTransfer.biayaTransfer)) : 'Rp 0'}
                  </div>
                </div>
              </div>

              {viewingTransfer.catatan && (
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-500">Catatan:</span>
                  <p className="text-slate-800 font-medium mt-0.5">{viewingTransfer.catatan}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewingTransfer(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default CashTransfersPage;

