import React, { useState, useEffect } from 'react';
import {
  ArrowUpRight,
  Wallet,
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
  Receipt,
  Tag,
} from 'lucide-react';
import {
  api,
  CashDisbursement,
  CashBankAccount,
  ChartOfAccount,
  CashDocStatus,
} from '../../services/api';

/**
 * Halaman Pengeluaran Kas & Bank (Cash Disbursement) dan Voucher Kas Kecil
 * Mendukung varian STANDAR (rekening bank / kas) dan PETTY_VOUCHER (kas kecil).
 */
export const CashDisbursementsPage: React.FC = () => {
  const [disbursements, setDisbursements] = useState<CashDisbursement[]>([]);
  const [accounts, setAccounts] = useState<CashBankAccount[]>([]);
  const [coaList, setCoaList] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'STANDARD' | 'PETTY_VOUCHER'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingDisbursement, setViewingDisbursement] = useState<CashDisbursement | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    cashBankAccountId: '',
    tanggal: new Date().toISOString().slice(0, 10),
    mata_uang: 'IDR',
    kurs: 1,
    catatan: '',
    docVariant: 'STANDARD' as 'STANDARD' | 'PETTY_VOUCHER',
    lines: [
      {
        akunLawanId: '',
        deskripsi: '',
        jumlah: 0,
      },
    ],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [disbRes, accRes, coaRes] = await Promise.all([
        api.getCashDisbursements(),
        api.getCashAccounts(),
        api.getCoa(),
      ]);
      setDisbursements(Array.isArray(disbRes) ? disbRes : []);
      setAccounts(Array.isArray(accRes) ? accRes : []);
      setCoaList(Array.isArray(coaRes) ? coaRes : []);
    } catch (err: any) {
      console.error('Gagal memuat data pengeluaran kas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = (variant: 'STANDARD' | 'PETTY_VOUCHER' = 'STANDARD') => {
    setViewingDisbursement(null);
    const targetAccounts = variant === 'PETTY_VOUCHER'
      ? accounts.filter((a) => a.jenis === 'KAS_KECIL')
      : accounts.filter((a) => a.jenis !== 'KAS_KECIL');

    const defaultAcc = targetAccounts[0] || accounts[0];

    setFormData({
      cashBankAccountId: defaultAcc?.id || '',
      tanggal: new Date().toISOString().slice(0, 10),
      mata_uang: defaultAcc?.mata_uang || 'IDR',
      kurs: 1,
      catatan: '',
      docVariant: variant,
      lines: [{ akunLawanId: '', deskripsi: '', jumlah: 0 }],
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleAddLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { akunLawanId: '', deskripsi: '', jumlah: 0 }],
    });
  };

  const handleRemoveLine = (idx: number) => {
    if (formData.lines.length <= 1) return;
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== idx),
    });
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...formData.lines];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, lines: updated });
  };

  const calculateTotal = () => {
    return formData.lines.reduce((sum, l) => sum + (Number(l.jumlah) || 0), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.cashBankAccountId) {
      setFormError('Pilih rekening sumber pengeluaran');
      return;
    }

    const invalidLine = formData.lines.find((l) => !l.akunLawanId || l.jumlah <= 0);
    if (invalidLine) {
      setFormError('Semua baris rincian harus memiliki akun lawan dan nominal lebih dari 0');
      return;
    }

    setSubmitting(true);
    try {
      await api.createCashDisbursement({
        cashBankAccountId: formData.cashBankAccountId,
        tanggal: formData.tanggal,
        mata_uang: formData.mata_uang,
        kurs: Number(formData.kurs),
        catatan: formData.catatan,
        docVariant: formData.docVariant,
        lines: formData.lines.map((l) => ({
          akunLawanId: l.akunLawanId,
          deskripsi: l.deskripsi || formData.catatan || 'Pengeluaran Kas/Bank',
          jumlah: Number(l.jumlah),
        })),
      });
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan pengeluaran kas');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin memposting transaksi pengeluaran ini ke buku besar?')) return;
    try {
      await api.postCashDisbursement(id);
      loadData();
    } catch (err: any) {
      alert(`Gagal memposting pengeluaran: ${err.message}`);
    }
  };

  const handleVoid = async (id: string) => {
    const reason = prompt('Masukkan alasan pembatalan (void) pengeluaran ini:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Alasan pembatalan wajib diisi');
      return;
    }

    try {
      await api.voidCashDisbursement(id, reason);
      loadData();
    } catch (err: any) {
      alert(`Gagal membatalkan pengeluaran: ${err.message}`);
    }
  };

  const filteredDisbursements = disbursements.filter((d) => {
    const matchSearch =
      d.noDokumen.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.catatan && d.catatan.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.cashBankAccount && d.cashBankAccount.nama.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchTab = activeTab === 'ALL' || d.docVariant === activeTab;
    const matchStatus = selectedStatus === 'ALL' || d.status === selectedStatus;
    return matchSearch && matchTab && matchStatus;
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
            <ArrowUpRight className="w-7 h-7 text-rose-700" />
            Pengeluaran Kas / Bank & Voucher Kas Kecil
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Pencatatan beban operasional, biaya tunai, pembayaran non-faktur, dan voucher pengeluaran kas kecil (petty cash).
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
            onClick={() => handleOpenAdd('PETTY_VOUCHER')}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Wallet className="w-4 h-4" />
            + Voucher Kas Kecil
          </button>

          <button
            type="button"
            onClick={() => handleOpenAdd('STANDARD')}
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Buat Pengeluaran Kas
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3">
          {/* Tabs Filter Varian */}
          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            {[
              { id: 'ALL', label: 'Semua Dokumen' },
              { id: 'STANDARD', label: 'Pengeluaran Bank / Kas Standar' },
              { id: 'PETTY_VOUCHER', label: 'Voucher Kas Kecil' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Status Tabs */}
            <div className="flex gap-1">
              {['ALL', 'DRAFT', 'POSTED', 'VOID'].map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    selectedStatus === st
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari no bukti atau catatan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table Daftar Pengeluaran */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0]">
              <tr>
                <th className="py-3 px-4 font-bold">No. Dokumen</th>
                <th className="py-3 px-4 font-bold">Tanggal</th>
                <th className="py-3 px-4 font-bold">Jenis / Tipe</th>
                <th className="py-3 px-4 font-bold">Rekening Asal</th>
                <th className="py-3 px-4 font-bold">Keterangan / Keperluan</th>
                <th className="py-3 px-4 text-right font-bold">Total Dikeluarkan</th>
                <th className="py-3 px-4 text-center font-bold">Status</th>
                <th className="py-3 px-4 text-center font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Memuat daftar pengeluaran kas...
                  </td>
                </tr>
              ) : filteredDisbursements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Belum ada dokumen pengeluaran kas yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredDisbursements.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{d.noDokumen}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(d.tanggal).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      {d.docVariant === 'PETTY_VOUCHER' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Tag className="w-3 h-3" /> Kas Kecil
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          Standar
                        </span>
                      )}
                      {d.docVariant === 'PETTY_VOUCHER' && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {d.replenishmentId ? '✓ Sudah diganti' : '• Belum diganti'}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{d.cashBankAccount?.nama || '-'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {d.cashBankAccount?.kode} • {d.cashBankAccount?.jenis}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{d.catatan || '-'}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                      {formatCurrency(Number(d.total), d.mata_uang)}
                    </td>
                    <td className="py-3 px-4 text-center">{renderStatusBadge(d.status)}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {d.status === 'DRAFT' && (
                          <button
                            onClick={() => handlePost(d.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[11px] shadow-sm transition-colors"
                          >
                            Posting
                          </button>
                        )}
                        {d.status === 'POSTED' && (
                          <button
                            onClick={() => handleVoid(d.id)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-lg text-[11px] transition-colors"
                          >
                            Void
                          </button>
                        )}
                        <button
                          onClick={() => setViewingDisbursement(d)}
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

      {/* Modal Form Buat Pengeluaran */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-rose-700" />
                {formData.docVariant === 'PETTY_VOUCHER'
                  ? 'Buat Voucher Pengeluaran Kas Kecil'
                  : 'Buat Dokumen Pengeluaran Kas / Bank'}
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
                    Rekening Kas / Bank Sumber <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.cashBankAccountId}
                    onChange={(e) => {
                      const acc = accounts.find((a) => a.id === e.target.value);
                      setFormData({
                        ...formData,
                        cashBankAccountId: e.target.value,
                        mata_uang: acc?.mata_uang || 'IDR',
                        docVariant: acc?.jenis === 'KAS_KECIL' ? 'PETTY_VOUCHER' : 'STANDARD',
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-semibold"
                  >
                    <option value="">-- Pilih Rekening Sumber --</option>
                    {accounts.filter((a) => a.isActive).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.kode} - {acc.nama} ({acc.jenis})
                      </option>
                    ))}
                  </select>
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
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan / Keterangan Keperluan</label>
                <input
                  type="text"
                  placeholder="Contoh: Pembelian ATK kantor, bensin, konsumsi rapat, dll."
                  value={formData.catatan}
                  onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {/* Multi-line Rincian Akun Lawan (Debit Beban) */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800">Rincian Pengeluaran (Akun Beban / Debit)</span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold text-[11px]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl items-center">
                      <div className="col-span-5">
                        <select
                          required
                          value={line.akunLawanId}
                          onChange={(e) => handleLineChange(idx, 'akunLawanId', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 text-[11px]"
                        >
                          <option value="">-- Pilih Akun Beban --</option>
                          {coaList.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.kode_akun} - {c.nama_akun} ({c.kategori})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="Deskripsi baris..."
                          value={line.deskripsi}
                          onChange={(e) => handleLineChange(idx, 'deskripsi', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 text-[11px]"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          required
                          min={1}
                          placeholder="Nominal"
                          value={line.jumlah || ''}
                          onChange={(e) => handleLineChange(idx, 'jumlah', Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono text-right focus:outline-none focus:ring-2 focus:ring-emerald-600 text-[11px]"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          disabled={formData.lines.length <= 1}
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-30 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center p-3 bg-rose-50/70 border border-rose-200 rounded-xl mt-3">
                  <span className="font-bold text-rose-900">Total Pengeluaran:</span>
                  <span className="font-mono font-bold text-sm text-rose-950">
                    {formatCurrency(calculateTotal(), formData.mata_uang)}
                  </span>
                </div>
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
                  {submitting ? 'Menyimpan...' : 'Simpan Draft Pengeluaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail Rincian Pengeluaran */}
      {viewingDisbursement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-rose-700" />
                Rincian Bukti Pengeluaran: {viewingDisbursement.noDokumen}
              </h3>
              <button
                onClick={() => setViewingDisbursement(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-500">Tanggal:</span>
                  <div className="font-semibold text-slate-900">
                    {new Date(viewingDisbursement.tanggal).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Rekening Sumber:</span>
                  <div className="font-semibold text-slate-900">
                    {viewingDisbursement.cashBankAccount?.nama}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>
                  <div className="mt-0.5">{renderStatusBadge(viewingDisbursement.status)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Total:</span>
                  <div className="font-mono font-bold text-rose-700 text-sm">
                    {formatCurrency(Number(viewingDisbursement.total), viewingDisbursement.mata_uang)}
                  </div>
                </div>
              </div>

              {viewingDisbursement.catatan && (
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-500">Catatan:</span>
                  <p className="text-slate-800 font-medium mt-0.5">{viewingDisbursement.catatan}</p>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-800 block mb-2">Rincian Beban:</span>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {viewingDisbursement.lines?.map((l, i) => (
                    <div key={i} className="p-2.5 flex justify-between items-center bg-white text-xs">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {l.akunLawan?.kode_akun} - {l.akunLawan?.nama_akun}
                        </div>
                        <div className="text-slate-500 text-[11px]">{l.deskripsi}</div>
                      </div>
                      <div className="font-mono font-bold text-rose-700">
                        {formatCurrency(Number(l.jumlah), viewingDisbursement.mata_uang)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewingDisbursement(null)}
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
export default CashDisbursementsPage;

