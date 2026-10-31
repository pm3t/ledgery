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
  Receipt,
} from 'lucide-react';
import {
  api,
  Tenant,
  VendorPayment,
  PurchaseBill,
  BusinessPartner,
  ChartOfAccount,
} from '../../services/api';

interface VendorPaymentsPageProps {
  currentTenant: Tenant | null;
}

export const VendorPaymentsPage: React.FC<VendorPaymentsPageProps> = ({ currentTenant }) => {
  const [payments, setPayments] = useState<VendorPayment[]>([]);
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

  // Outstanding bills for selected vendor in modal
  const [outstandingBills, setOutstandingBills] = useState<PurchaseBill[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [allocationsMap, setAllocationsMap] = useState<Record<string, number>>({});

  // Void Prompt
  const [voidPaymentId, setVoidPaymentId] = useState<string | null>(null);
  const [voidAlasan, setVoidAlasan] = useState('');

  // Detail Modal
  const [selectedPayment, setSelectedPayment] = useState<VendorPayment | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [pmtData, partnerData, coaData] = await Promise.all([
        api.getVendorPayments(currentTenant.id),
        api.getBusinessPartners(currentTenant.id, { type: 'vendor', isActive: true }),
        api.getCoaByTenant(currentTenant.id, 'ASET'),
      ]);
      setPayments(pmtData);
      setPartners(partnerData);
      setCashAccounts(coaData);
    } catch (err) {
      console.error('Gagal mengambil data pembayaran vendor:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant]);

  // Load outstanding bills when partner changes in form
  const handlePartnerChange = async (partnerId: string) => {
    setFormData((prev) => ({ ...prev, partnerId }));
    setAllocationsMap({});
    if (!currentTenant || !partnerId) {
      setOutstandingBills([]);
      return;
    }

    setLoadingBills(true);
    try {
      const bills = await api.getOutstandingPurchaseBills(currentTenant.id, partnerId);
      setOutstandingBills(bills);
    } catch (err) {
      console.error('Gagal mengambil tagihan outstanding:', err);
    } finally {
      setLoadingBills(false);
    }
  };

  // Auto Allocate FIFO (Tagihan terlama terlebih dahulu)
  const handleAutoAllocate = () => {
    let remainingToAllocate = Number(formData.jumlah || 0);
    const newMap: Record<string, number> = {};

    for (const bill of outstandingBills) {
      if (remainingToAllocate <= 0) break;
      const billSaldo = Number(bill.saldo);
      const alloc = Math.min(billSaldo, remainingToAllocate);
      newMap[bill.id] = alloc;
      remainingToAllocate -= alloc;
    }
    setAllocationsMap(newMap);
  };

  // Kalkulasi total alokasi dan estimasi selisih kurs pada hutang (AP)
  // Untuk hutang (liabilitas):
  // Jika kurs pembayaran > kurs tagihan -> Bayar lebih mahal -> RUGI KURS (FX Loss)
  // Jika kurs pembayaran < kurs tagihan -> Bayar lebih murah -> UNTUNG KURS (FX Gain)
  const allocationSummary = useMemo(() => {
    let totalAllocated = 0;
    let estimatedFx = 0;

    Object.entries(allocationsMap).forEach(([billId, amount]) => {
      const alloc = Number(amount || 0);
      if (alloc > 0) {
        totalAllocated += alloc;
        const bill = outstandingBills.find((b) => b.id === billId);
        if (bill) {
          const billKurs = Number(bill.kurs) || 1;
          const pmtKurs = Number(formData.kurs) || 1;
          // Rugi jika pmtKurs > billKurs, untung jika billKurs > pmtKurs
          estimatedFx += alloc * (pmtKurs - billKurs);
        }
      }
    });

    const unallocated = Math.max(0, Number(formData.jumlah || 0) - totalAllocated);

    return {
      totalAllocated,
      unallocated,
      estimatedFx, // Positif = Rugi Kurs, Negatif = Untung Kurs
    };
  }, [allocationsMap, outstandingBills, formData.jumlah, formData.kurs]);

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!formData.partnerId) {
      setFormError('Pilih vendor terlebih dahulu');
      return;
    }
    if (!formData.akunKasBankId) {
      setFormError('Pilih akun kas / bank');
      return;
    }
    if (Number(formData.jumlah) <= 0) {
      setFormError('Jumlah pembayaran harus lebih besar dari 0');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      // Susun alokasi
      const allocations = Object.entries(allocationsMap)
        .filter(([_, amt]) => Number(amt) > 0)
        .map(([billId, amt]) => ({
          billId,
          jumlahAlokasi: Number(amt),
          kursAlokasi: Number(formData.kurs),
        }));

      await api.createVendorPayment(currentTenant.id, {
        partnerId: formData.partnerId,
        akunKasBankId: formData.akunKasBankId,
        tanggal: formData.tanggal,
        jumlah: Number(formData.jumlah),
        mata_uang: formData.mata_uang,
        kurs: Number(formData.kurs),
        catatan: formData.catatan || undefined,
        externalRef: formData.externalRef || undefined,
        allocations: allocations.length > 0 ? allocations : undefined,
      });

      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal mencatat pembayaran vendor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidPayment = async () => {
    if (!currentTenant || !voidPaymentId) return;
    try {
      await api.voidVendorPayment(currentTenant.id, voidPaymentId, voidAlasan);
      setVoidPaymentId(null);
      setVoidAlasan('');
      fetchData();
    } catch (err: any) {
      alert(`Gagal membatalkan pembayaran: ${err.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      partnerId: '',
      akunKasBankId: '',
      tanggal: new Date().toISOString().slice(0, 10),
      jumlah: 0,
      mata_uang: currentTenant?.mata_uang || 'IDR',
      kurs: 1,
      catatan: '',
      externalRef: '',
    });
    setAllocationsMap({});
    setOutstandingBills([]);
    setFormError(null);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchPartner = partnerFilter === 'ALL' || p.partnerId === partnerFilter;
      const matchSearch =
        p.noDokumen.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.partner?.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.catatan && p.catatan.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchPartner && matchSearch;
    });
  }, [payments, partnerFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-600" />
            Pembayaran Vendor
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pencatatan pengeluaran kas/bank untuk pelunasan hutang vendor, alokasi faktur pembelian, dan selisih kurs realisasi.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Catat Pembayaran
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nomor dokumen, vendor, atau catatan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="w-full sm:w-64">
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="ALL">Semua Vendor</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.kode} - {p.nama}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Daftar Pembayaran */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">No. Dokumen</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Vendor</th>
                <th className="py-3 px-4">Akun Kas / Bank</th>
                <th className="py-3 px-4 text-right">Jumlah Bayar</th>
                <th className="py-3 px-4 text-right">Dialokasikan</th>
                <th className="py-3 px-4 text-right">Uang Muka / Sisa</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    Memuat data pembayaran vendor...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    Belum ada data pembayaran vendor.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {p.noDokumen}
                      {p.externalRef && (
                        <div className="text-xs text-slate-400 font-normal">Ref: {p.externalRef}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(p.tanggal).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {p.partner?.nama || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 mr-1.5">
                        {p.akunKasBank?.kode_akun}
                      </span>
                      {p.akunKasBank?.nama_akun}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-800">
                      <div>
                        {p.mata_uang} {formatNumber(Number(p.jumlah))}
                      </div>
                      {p.mata_uang !== currentTenant?.mata_uang && (
                        <div className="text-xs text-slate-400">
                          {currentTenant?.mata_uang} {formatNumber(Number(p.jumlahFungsional))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-medium">
                      {p.mata_uang} {formatNumber(Number(p.totalDialokasikan))}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {Number(p.belumDialokasikan) > 0 ? (
                        <span className="text-amber-600">
                          {p.mata_uang} {formatNumber(Number(p.belumDialokasikan))}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {p.status === 'POSTED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          POSTED
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                          VOID
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedPayment(p);
                            setIsDetailOpen(true);
                          }}
                          title="Lihat Rincian"
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {p.status === 'POSTED' && (
                          <button
                            onClick={() => {
                              setVoidPaymentId(p.id);
                              setVoidAlasan('');
                            }}
                            title="Batalkan (Void)"
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
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
      </div>

      {/* Modal Buat Pembayaran */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  Pencatatan Pembayaran Hutang Vendor
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Pengeluaran kas/bank langsung diposting ke General Ledger dan mengupdate saldo tagihan vendor.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="p-6 space-y-6 flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Data Utama */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Vendor <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.partnerId}
                    onChange={(e) => handlePartnerChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">-- Pilih Vendor --</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.kode} - {p.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Akun Kas / Bank <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.akunKasBankId}
                    onChange={(e) => setFormData({ ...formData, akunKasBankId: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">-- Pilih Akun Kas / Bank --</option>
                    {cashAccounts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.kode_akun} - {c.nama_akun}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tanggal Bayar <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Moneter */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mata Uang</label>
                  <input
                    type="text"
                    value={formData.mata_uang}
                    onChange={(e) => setFormData({ ...formData, mata_uang: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Kurs Pembayaran</label>
                  <input
                    type="number"
                    step="any"
                    min="0.000001"
                    value={formData.kurs}
                    onChange={(e) => setFormData({ ...formData, kurs: Number(e.target.value) })}
                    disabled={formData.mata_uang === (currentTenant?.mata_uang || 'IDR')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:bg-slate-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Jumlah Bayar (Kas Keluar) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">
                      {formData.mata_uang}
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={formData.jumlah || ''}
                      onChange={(e) => setFormData({ ...formData, jumlah: Number(e.target.value) })}
                      required
                      placeholder="0"
                      className="w-full pl-14 pr-3 py-2 text-sm font-semibold text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Tagihan Terbuka & Alokasi */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-slate-500" />
                    <h4 className="text-sm font-bold text-slate-700">
                      Alokasi ke Faktur Pembelian (Bill)
                    </h4>
                    {outstandingBills.length > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                        {outstandingBills.length} Tagihan Terbuka
                      </span>
                    )}
                  </div>

                  {outstandingBills.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoAllocate}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Alokasi Otomatis (FIFO)
                    </button>
                  )}
                </div>

                {loadingBills ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    Memuat tagihan vendor...
                  </div>
                ) : !formData.partnerId ? (
                  <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    Pilih vendor untuk melihat tagihan yang belum lunas.
                  </div>
                ) : outstandingBills.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    Tidak ada tagihan yang belum lunas untuk vendor ini. Pembayaran akan dicatat sepenuhnya sebagai Uang Muka Vendor (Belum Dialokasikan).
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3">No. Faktur</th>
                          <th className="py-2.5 px-3">Jatuh Tempo</th>
                          <th className="py-2.5 px-3 text-right">Saldo Tagihan</th>
                          <th className="py-2.5 px-3 text-right w-44">Jumlah Alokasi</th>
                          <th className="py-2.5 px-3 text-right">Sisa Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {outstandingBills.map((bill) => {
                          const currentAlloc = allocationsMap[bill.id] || 0;
                          const billSaldo = Number(bill.saldo);
                          const remainingBillSaldo = Math.max(0, billSaldo - currentAlloc);
                          const isDifferentRate =
                            bill.mata_uang !== currentTenant?.mata_uang &&
                            Number(bill.kurs) !== Number(formData.kurs);

                          return (
                            <tr key={bill.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3">
                                <div className="font-medium text-slate-800">{bill.noDokumen}</div>
                                {bill.noFakturVendor && (
                                  <div className="text-[11px] text-slate-400">
                                    Vendor Ref: {bill.noFakturVendor}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {new Date(bill.jatuhTempo).toLocaleDateString('id-ID')}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                                {bill.mata_uang} {formatNumber(billSaldo)}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  max={billSaldo}
                                  value={currentAlloc || ''}
                                  onChange={(e) => {
                                    const val = Math.min(billSaldo, Math.max(0, Number(e.target.value)));
                                    setAllocationsMap((prev) => ({
                                      ...prev,
                                      [bill.id]: val,
                                    }));
                                  }}
                                  placeholder="0"
                                  className="w-full text-right px-2.5 py-1 text-xs font-semibold text-slate-800 border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                />
                                {isDifferentRate && currentAlloc > 0 && (
                                  <div className="text-[10px] text-indigo-600 mt-0.5">
                                    Kurs Tagihan: {formatNumber(Number(bill.kurs))}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-slate-500">
                                {bill.mata_uang} {formatNumber(remainingBillSaldo)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Ringkasan Alokasi & Estimasi Selisih Kurs */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-slate-500">Total Pembayaran:</span>
                      <div className="font-bold text-slate-800 text-sm">
                        {formData.mata_uang} {formatNumber(Number(formData.jumlah || 0))}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Total Dialokasikan:</span>
                      <div className="font-bold text-emerald-600 text-sm">
                        {formData.mata_uang} {formatNumber(allocationSummary.totalAllocated)}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Belum Dialokasikan (Uang Muka):</span>
                      <div className="font-bold text-amber-600 text-sm">
                        {formData.mata_uang} {formatNumber(allocationSummary.unallocated)}
                      </div>
                    </div>
                  </div>

                  {allocationSummary.estimatedFx !== 0 && (
                    <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                      {allocationSummary.estimatedFx > 0 ? (
                        <>
                          <TrendingDown className="w-4 h-4 text-rose-600" />
                          <div>
                            <span className="text-[10px] text-slate-500 block">
                              Estimasi Realisasi Rugi Kurs (Liabilitas Naik):
                            </span>
                            <span className="font-bold text-rose-600 text-xs">
                              {currentTenant?.mata_uang}{' '}
                              {formatNumber(Math.abs(allocationSummary.estimatedFx))}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <TrendingUp className="w-4 h-4 text-emerald-600" />
                          <div>
                            <span className="text-[10px] text-slate-500 block">
                              Estimasi Realisasi Untung Kurs (Liabilitas Turun):
                            </span>
                            <span className="font-bold text-emerald-600 text-xs">
                              {currentTenant?.mata_uang}{' '}
                              {formatNumber(Math.abs(allocationSummary.estimatedFx))}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Catatan & External Ref */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nomor Referensi External / Cek / Giro
                  </label>
                  <input
                    type="text"
                    value={formData.externalRef}
                    onChange={(e) => setFormData({ ...formData, externalRef: e.target.value })}
                    placeholder="Contoh: GIRO-77889 atau TRF-BCA-102"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Catatan / Keterangan</label>
                  <input
                    type="text"
                    value={formData.catatan}
                    onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                    placeholder="Keterangan pembayaran hutang vendor..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 rounded-lg shadow-sm transition-all"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Memposting...' : 'Posting Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail Pembayaran */}
      {isDetailOpen && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  Rincian Pembayaran {selectedPayment.noDokumen}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                    selectedPayment.status === 'POSTED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {selectedPayment.status}
                </span>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block">Vendor</span>
                  <span className="font-semibold text-slate-800">
                    {selectedPayment.partner?.kode} - {selectedPayment.partner?.nama}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Akun Kas / Bank</span>
                  <span className="font-semibold text-slate-800">
                    {selectedPayment.akunKasBank?.kode_akun} - {selectedPayment.akunKasBank?.nama_akun}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Tanggal Bayar</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(selectedPayment.tanggal).toLocaleDateString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Jumlah Bayar</span>
                  <span className="font-semibold text-slate-800">
                    {selectedPayment.mata_uang} {formatNumber(Number(selectedPayment.jumlah))}
                    {selectedPayment.mata_uang !== currentTenant?.mata_uang && (
                      <span className="text-xs text-slate-400 block">
                        Kurs: {formatNumber(Number(selectedPayment.kurs))} ({currentTenant?.mata_uang}{' '}
                        {formatNumber(Number(selectedPayment.jumlahFungsional))})
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Tabel Alokasi */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Alokasi Tagihan Pembelian
                </h4>
                {selectedPayment.allocations && selectedPayment.allocations.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">No. Tagihan</th>
                          <th className="py-2.5 px-3 text-right">Alokasi</th>
                          <th className="py-2.5 px-3 text-right">Kurs Alokasi</th>
                          <th className="py-2.5 px-3 text-right">Selisih Kurs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedPayment.allocations.map((alloc) => (
                          <tr key={alloc.id}>
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {alloc.bill?.noDokumen || alloc.billId}
                              {alloc.bill?.noFakturVendor && (
                                <div className="text-[10px] text-slate-400">
                                  Ref: {alloc.bill.noFakturVendor}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-700">
                              {selectedPayment.mata_uang} {formatNumber(Number(alloc.jumlahAlokasi))}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600">
                              {formatNumber(Number(alloc.kursAlokasi))}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium">
                              {Number(alloc.selisihKurs) > 0 ? (
                                <span className="text-rose-600">
                                  +{currentTenant?.mata_uang} {formatNumber(Number(alloc.selisihKurs))} (Rugi)
                                </span>
                              ) : Number(alloc.selisihKurs) < 0 ? (
                                <span className="text-emerald-600">
                                  -{currentTenant?.mata_uang} {formatNumber(Math.abs(Number(alloc.selisihKurs)))} (Untung)
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                    Tidak ada alokasi tagihan langsung (dicatat sebagai Uang Muka Vendor).
                  </div>
                )}
              </div>

              {/* Jurnal Link */}
              {selectedPayment.journal && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-600">Nomor Voucher Jurnal Umum:</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {selectedPayment.journal.no_voucher}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Prompt Void */}
      {voidPaymentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Batalkan Pembayaran (Void)</h3>
            </div>
            <p className="text-sm text-slate-600">
              Membatalkan pembayaran akan mengembalikan saldo tagihan terkait dan membuat jurnal pembalik secara otomatis di buku besar.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Alasan Pembatalan <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={voidAlasan}
                onChange={(e) => setVoidAlasan(e.target.value)}
                placeholder="Masukkan alasan pembatalan..."
                rows={3}
                className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setVoidPaymentId(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Kembali
              </button>
              <button
                onClick={handleVoidPayment}
                disabled={!voidAlasan.trim()}
                className="px-4 py-2 text-sm text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 rounded-lg font-medium"
              >
                Konfirmasi Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

