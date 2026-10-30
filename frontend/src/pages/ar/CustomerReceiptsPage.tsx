import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  Trash2,
  X,
  Send,
  Ban,
  DollarSign,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
} from 'lucide-react';
import {
  api,
  Tenant,
  CustomerReceipt,
  SalesInvoice,
  BusinessPartner,
  ChartOfAccount,
} from '../../services/api';

interface CustomerReceiptsPageProps {
  currentTenant: Tenant | null;
}

export const CustomerReceiptsPage: React.FC<CustomerReceiptsPageProps> = ({ currentTenant }) => {
  const [receipts, setReceipts] = useState<CustomerReceipt[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [cashAccounts, setCashAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [partnerFilter, setPartnerFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Create
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    partnerId: '',
    akunKasBankId: '',
    tanggal: new Date().toISOString().slice(0, 10),
    jumlah: 0,
    mata_uang: currentTenant?.mata_uang || 'IDR',
    kurs: 1,
    catatan: '',
    externalRef: '',
  });

  // Outstanding invoices for selected partner in modal
  const [outstandingInvoices, setOutstandingInvoices] = useState<SalesInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [allocationsMap, setAllocationsMap] = useState<Record<string, number>>({});

  // Void Prompt
  const [voidReceiptId, setVoidReceiptId] = useState<string | null>(null);
  const [voidAlasan, setVoidAlasan] = useState('');

  // Detail Modal
  const [selectedReceipt, setSelectedReceipt] = useState<CustomerReceipt | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [rctData, partnerData, coaData] = await Promise.all([
        api.getCustomerReceipts(currentTenant.id),
        api.getBusinessPartners(currentTenant.id, { type: 'customer', isActive: true }),
        api.getCoaByTenant(currentTenant.id, 'ASET'),
      ]);
      setReceipts(rctData);
      setPartners(partnerData);
      setCashAccounts(coaData);
    } catch (err) {
      console.error('Gagal mengambil data penerimaan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant]);

  // Load outstanding invoices when partner changes in form
  const handlePartnerChange = async (partnerId: string) => {
    setFormData((prev) => ({ ...prev, partnerId }));
    setAllocationsMap({});
    if (!currentTenant || !partnerId) {
      setOutstandingInvoices([]);
      return;
    }

    setLoadingInvoices(true);
    try {
      const invs = await api.getOutstandingInvoices(currentTenant.id, partnerId);
      setOutstandingInvoices(invs);
    } catch (err) {
      console.error('Gagal mengambil faktur outstanding:', err);
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Auto Allocate FIFO (Terlama dulu)
  const handleAutoAllocate = () => {
    let remainingToAllocate = Number(formData.jumlah || 0);
    const newMap: Record<string, number> = {};

    for (const inv of outstandingInvoices) {
      if (remainingToAllocate <= 0) break;
      const invSaldo = Number(inv.saldo);
      const alloc = Math.min(invSaldo, remainingToAllocate);
      newMap[inv.id] = alloc;
      remainingToAllocate -= alloc;
    }
    setAllocationsMap(newMap);
  };

  // Kalkulasi total alokasi dan selisih kurs
  const allocationSummary = useMemo(() => {
    let totalAllocated = 0;
    let estimatedFx = 0;

    Object.entries(allocationsMap).forEach(([invId, amount]) => {
      const alloc = Number(amount || 0);
      if (alloc > 0) {
        totalAllocated += alloc;
        const inv = outstandingInvoices.find((i) => i.id === invId);
        if (inv) {
          const invKurs = Number(inv.kurs) || 1;
          const rctKurs = Number(formData.kurs) || 1;
          estimatedFx += alloc * (rctKurs - invKurs);
        }
      }
    });

    const unallocated = Math.max(0, Number(formData.jumlah || 0) - totalAllocated);
    return { totalAllocated, unallocated, estimatedFx };
  }, [allocationsMap, formData.jumlah, formData.kurs, outstandingInvoices]);

  const handleOpenAddModal = () => {
    const firstPartnerId = partners[0]?.id || '';
    setFormData({
      partnerId: firstPartnerId,
      akunKasBankId: cashAccounts[0]?.id || '',
      tanggal: new Date().toISOString().slice(0, 10),
      jumlah: 0,
      mata_uang: currentTenant?.mata_uang || 'IDR',
      kurs: 1,
      catatan: '',
      externalRef: '',
    });
    setAllocationsMap({});
    setFormError(null);
    setIsModalOpen(true);
    if (firstPartnerId) {
      handlePartnerChange(firstPartnerId);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;
    if (!formData.partnerId) {
      setFormError('Pilih pelanggan terlebih dahulu');
      return;
    }
    if (!formData.akunKasBankId) {
      setFormError('Pilih akun kas / bank penerima');
      return;
    }
    if (formData.jumlah <= 0) {
      setFormError('Jumlah penerimaan harus lebih besar dari 0');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const allocList = Object.entries(allocationsMap)
        .filter(([_, amt]) => Number(amt) > 0)
        .map(([invId, amt]) => ({
          invoiceId: invId,
          jumlahAlokasi: Number(amt),
          kursAlokasi: Number(formData.kurs) || 1,
        }));

      await api.createCustomerReceipt(currentTenant.id, {
        partnerId: formData.partnerId,
        akunKasBankId: formData.akunKasBankId,
        tanggal: formData.tanggal,
        jumlah: Number(formData.jumlah),
        mata_uang: formData.mata_uang,
        kurs: Number(formData.kurs) || 1,
        catatan: formData.catatan,
        externalRef: formData.externalRef || null,
        allocations: allocList,
      });

      alert('Penerimaan pembayaran berhasil disimpan dan dialokasikan!');
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan penerimaan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteVoid = async () => {
    if (!currentTenant || !voidReceiptId) return;
    try {
      await api.voidCustomerReceipt(currentTenant.id, voidReceiptId, voidAlasan);
      alert('Penerimaan pembayaran berhasil dibatalkan (VOID) dan saldo faktur telah dipulihkan.');
      setVoidReceiptId(null);
      setVoidAlasan('');
      fetchData();
    } catch (err: any) {
      alert(`Gagal membatalkan penerimaan: ${err.message}`);
    }
  };

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (partnerFilter !== 'ALL' && r.partnerId !== partnerFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mDoc = r.noDokumen.toLowerCase().includes(q);
        const mPartner = r.partner?.nama.toLowerCase().includes(q) || false;
        return mDoc || mPartner;
      }
      return true;
    });
  }, [receipts, partnerFilter, searchQuery]);

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-indigo-400" />
            Penerimaan Pembayaran (Customer Receipts)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Pencatatan pelunasan piutang, alokasi faktur penjualan, dan pencatatan laba/rugi selisih kurs realisasi untuk{' '}
            <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Catat Penerimaan Kas
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <select
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500 w-full md:w-64"
        >
          <option value="ALL">Semua Pelanggan</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </select>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari no penerimaan, pelanggan..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-4 font-semibold">No Dokumen</th>
              <th className="py-3.5 px-4 font-semibold">Tanggal</th>
              <th className="py-3.5 px-4 font-semibold">Pelanggan</th>
              <th className="py-3.5 px-4 font-semibold">Rekening Kas/Bank</th>
              <th className="py-3.5 px-4 font-semibold text-right">Jumlah Penerimaan</th>
              <th className="py-3.5 px-4 font-semibold text-right">Dialokasikan</th>
              <th className="py-3.5 px-4 font-semibold">Status</th>
              <th className="py-3.5 px-4 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                  Memuat data penerimaan...
                </td>
              </tr>
            ) : filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                  Belum ada transaksi penerimaan pembayaran.
                </td>
              </tr>
            ) : (
              filteredReceipts.map((rct) => (
                <tr key={rct.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-white">
                    <button
                      onClick={() => {
                        setSelectedReceipt(rct);
                        setIsDetailOpen(true);
                      }}
                      className="hover:underline hover:text-indigo-400"
                    >
                      {rct.noDokumen}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono">
                    {new Date(rct.tanggal).toLocaleDateString('id-ID')}
                  </td>
                  <td className="py-3 px-4 font-semibold text-white">{rct.partner?.nama}</td>
                  <td className="py-3 px-4 text-xs">
                    <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {rct.akunKasBank?.kode_akun} - {rct.akunKasBank?.nama_akun}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                    {new Intl.NumberFormat('id-ID', {
                      style: 'currency',
                      currency: rct.mata_uang || 'IDR',
                      maximumFractionDigits: 0,
                    }).format(rct.jumlah)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-slate-300">
                    {new Intl.NumberFormat('id-ID').format(rct.totalDialokasikan)}
                    {rct.belumDialokasikan > 0 && (
                      <span className="block text-[10px] text-amber-400">
                        Sisa: {new Intl.NumberFormat('id-ID').format(rct.belumDialokasikan)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        rct.status === 'POSTED'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {rct.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedReceipt(rct);
                          setIsDetailOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Lihat Detail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {rct.status === 'POSTED' && (
                        <button
                          onClick={() => setVoidReceiptId(rct.id)}
                          className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
                          title="Batalkan Penerimaan (VOID)"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Catat Penerimaan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-400" />
                Catat Penerimaan Pembayaran Kas / Bank
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3.5 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Pelanggan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Pelanggan (Customer) *
                  </label>
                  <select
                    required
                    value={formData.partnerId}
                    onChange={(e) => handlePartnerChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  >
                    <option value="">-- Pilih Pelanggan --</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.kode} - {p.nama}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Akun Kas / Bank */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Setor ke Rekening Kas / Bank *
                  </label>
                  <select
                    required
                    value={formData.akunKasBankId}
                    onChange={(e) => setFormData({ ...formData, akunKasBankId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  >
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.kode_akun} - {a.nama_akun}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Tanggal */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tanggal Penerimaan *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  />
                </div>

                {/* Jumlah Penerimaan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Jumlah Penerimaan ({formData.mata_uang}) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={formData.jumlah || ''}
                    onChange={(e) => setFormData({ ...formData, jumlah: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:border-indigo-500 outline-none text-right"
                  />
                </div>

                {/* Kurs */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Kurs</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.kurs}
                    onChange={(e) => setFormData({ ...formData, kurs: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Seksi Alokasi ke Faktur Outstanding */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Alokasi ke Faktur Penjualan Outstanding
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Pilih faktur yang akan dilunasi atau klik tombol alokasi otomatis.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={outstandingInvoices.length === 0 || formData.jumlah <= 0}
                    onClick={handleAutoAllocate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-300 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-lg border border-indigo-500/30 disabled:opacity-40 transition-colors"
                  >
                    Alokasi Otomatis (FIFO)
                  </button>
                </div>

                {loadingInvoices ? (
                  <div className="p-6 text-center text-xs text-slate-400">Memuat faktur outstanding...</div>
                ) : outstandingInvoices.length === 0 ? (
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                    Tidak ada faktur outstanding untuk pelanggan ini. Penerimaan akan disimpan sebagai kelebihan bayar (deposit).
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">No Faktur</th>
                          <th className="py-2.5 px-3">Jatuh Tempo</th>
                          <th className="py-2.5 px-3 text-right">Sisa Saldo</th>
                          <th className="py-2.5 px-3 text-right">Jumlah Alokasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {outstandingInvoices.map((inv) => {
                          const currentAlloc = allocationsMap[inv.id] || 0;
                          return (
                            <tr key={inv.id} className="hover:bg-slate-900/50">
                              <td className="py-2 px-3 font-bold text-white">{inv.noDokumen}</td>
                              <td className="py-2 px-3 text-slate-400">
                                {new Date(inv.jatuhTempo).toLocaleDateString('id-ID')}
                              </td>
                              <td className="py-2 px-3 text-right text-amber-300 font-semibold">
                                {new Intl.NumberFormat('id-ID').format(inv.saldo)}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max={inv.saldo}
                                  step="any"
                                  value={currentAlloc || ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setAllocationsMap({ ...allocationsMap, [inv.id]: val });
                                  }}
                                  placeholder="0"
                                  className="w-28 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white text-right outline-none focus:border-indigo-500 font-bold"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Status Alokasi & Ringkasan */}
              <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Total Penerimaan:</span>
                  <span className="font-bold text-white">
                    {new Intl.NumberFormat('id-ID').format(formData.jumlah)}
                  </span>
                </div>
                <div className="flex justify-between text-indigo-300">
                  <span>Total Dialokasikan ke Faktur:</span>
                  <span className="font-bold">
                    {new Intl.NumberFormat('id-ID').format(allocationSummary.totalAllocated)}
                  </span>
                </div>
                {allocationSummary.unallocated > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Sisa Belum Dialokasikan (Kelebihan Bayar):</span>
                    <span className="font-bold">
                      {new Intl.NumberFormat('id-ID').format(allocationSummary.unallocated)}
                    </span>
                  </div>
                )}
                {allocationSummary.estimatedFx !== 0 && (
                  <div className="flex justify-between pt-1 border-t border-slate-800">
                    <span>Estimasi Selisih Kurs Realisasi:</span>
                    <span
                      className={`font-bold flex items-center gap-1 ${
                        allocationSummary.estimatedFx > 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {allocationSummary.estimatedFx > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {allocationSummary.estimatedFx > 0 ? 'Laba: +' : 'Rugi: '}
                      {new Intl.NumberFormat('id-ID').format(Math.abs(allocationSummary.estimatedFx))}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Posting Penerimaan Kas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {isDetailOpen && selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-400" />
                Detail Penerimaan: {selectedReceipt.noDokumen}
              </h3>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400">Pelanggan:</span>
                <p className="font-semibold text-white mt-0.5">{selectedReceipt.partner?.nama}</p>
              </div>
              <div>
                <span className="text-slate-400">Rekening Kas/Bank:</span>
                <p className="font-semibold text-white mt-0.5">{selectedReceipt.akunKasBank?.nama_akun}</p>
              </div>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <div className="px-3 py-2 bg-slate-900 text-xs font-semibold text-slate-300 border-b border-slate-800">
                Alokasi ke Faktur:
              </div>
              {selectedReceipt.allocations.length === 0 ? (
                <div className="p-3 text-xs text-slate-500 text-center">Belum dialokasikan ke faktur.</div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {selectedReceipt.allocations.map((a, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3">{a.invoice?.noDokumen || 'Faktur'}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-300">
                          {new Intl.NumberFormat('id-ID').format(a.jumlahAlokasi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Void Receipt */}
      {voidReceiptId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-rose-400" />
              Konfirmasi Void Penerimaan Pembayaran
            </h3>
            <p className="text-xs text-slate-400">
              Membatalkan penerimaan pembayaran akan memulihkan saldo faktur yang sudah dialokasikan dan membuat jurnal pembalik di GL.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Alasan Pembatalan</label>
              <textarea
                rows={2}
                value={voidAlasan}
                onChange={(e) => setVoidAlasan(e.target.value)}
                placeholder="Misal: Cek ditolak, salah rekening..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setVoidReceiptId(null)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleExecuteVoid}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/30"
              >
                Ya, Batalkan Penerimaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

