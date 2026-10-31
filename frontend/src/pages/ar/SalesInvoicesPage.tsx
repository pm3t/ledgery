import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  Trash2,
  Edit2,
  X,
  Send,
  Ban,
  RotateCcw,
  DollarSign,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  api,
  Tenant,
  SalesInvoice,
  BusinessPartner,
  ChartOfAccount,
  SalesInvoiceStatus,
} from '../../services/api';

interface SalesInvoicesPageProps {
  currentTenant: Tenant | null;
}

export const SalesInvoicesPage: React.FC<SalesInvoicesPageProps> = ({ currentTenant }) => {
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [revenueAccounts, setRevenueAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [partnerFilter, setPartnerFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Void Prompt
  const [voidInvoiceId, setVoidInvoiceId] = useState<string | null>(null);
  const [voidAlasan, setVoidAlasan] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    partnerId: '',
    tanggal: new Date().toISOString().slice(0, 10),
    jatuhTempo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    mata_uang: currentTenant?.mata_uang || 'IDR',
    kurs: 1,
    catatan: '',
    externalRef: '',
    lines: [
      {
        itemType: 'SERVICE' as 'STOCK' | 'SERVICE',
        deskripsi: '',
        qty: 1,
        hargaSatuan: 0,
        diskon: 0,
        ppnRate: 11,
        akunPendapatanId: '',
      },
    ],
  });

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [invData, partnerData, coaData] = await Promise.all([
        api.getArInvoices(currentTenant.id),
        api.getBusinessPartners(currentTenant.id, { type: 'customer', isActive: true }),
        api.getCoaByTenant(currentTenant.id, 'PENDAPATAN'),
      ]);
      setInvoices(invData);
      setPartners(partnerData);
      setRevenueAccounts(coaData);
    } catch (err) {
      console.error('Gagal mengambil data faktur penjualan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant]);

  // Kalkulasi realtime subtotal form
  const totals = useMemo(() => {
    let subtotal = 0;
    let totalDiskon = 0;
    let totalPpn = 0;

    formData.lines.forEach((l) => {
      const lineSubtotal = Number(l.qty || 0) * Number(l.hargaSatuan || 0);
      const dpp = Math.max(0, lineSubtotal - Number(l.diskon || 0));
      const linePpn = (dpp * Number(l.ppnRate || 0)) / 100;

      subtotal += lineSubtotal;
      totalDiskon += Number(l.diskon || 0);
      totalPpn += linePpn;
    });

    const total = subtotal - totalDiskon + totalPpn;
    return { subtotal, totalDiskon, totalPpn, total };
  }, [formData.lines]);

  const handleOpenAddModal = () => {
    setEditingInvoice(null);
    setFormData({
      partnerId: partners[0]?.id || '',
      tanggal: new Date().toISOString().slice(0, 10),
      jatuhTempo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      mata_uang: currentTenant?.mata_uang || 'IDR',
      kurs: 1,
      catatan: '',
      externalRef: '',
      lines: [
        {
          itemType: 'SERVICE',
          deskripsi: '',
          qty: 1,
          hargaSatuan: 0,
          diskon: 0,
          ppnRate: 11,
          akunPendapatanId: revenueAccounts[0]?.id || '',
        },
      ],
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (inv: SalesInvoice) => {
    setEditingInvoice(inv);
    setFormData({
      partnerId: inv.partnerId,
      tanggal: inv.tanggal.slice(0, 10),
      jatuhTempo: inv.jatuhTempo.slice(0, 10),
      mata_uang: inv.mata_uang,
      kurs: Number(inv.kurs) || 1,
      catatan: inv.catatan || '',
      externalRef: inv.externalRef || '',
      lines: inv.lines.map((l) => ({
        itemType: (l.itemType || 'SERVICE') as any,
        deskripsi: l.deskripsi,
        qty: Number(l.qty),
        hargaSatuan: Number(l.hargaSatuan),
        diskon: Number(l.diskon || 0),
        ppnRate: Number(l.ppnRate || 0),
        akunPendapatanId: l.akunPendapatanId || '',
      })),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleAddLine = () => {
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        {
          itemType: 'SERVICE',
          deskripsi: '',
          qty: 1,
          hargaSatuan: 0,
          diskon: 0,
          ppnRate: 11,
          akunPendapatanId: revenueAccounts[0]?.id || '',
        },
      ],
    });
  };

  const handleRemoveLine = (idx: number) => {
    if (formData.lines.length === 1) return;
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

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;
    if (!formData.partnerId) {
      setFormError('Pilih pelanggan terlebih dahulu');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        partnerId: formData.partnerId,
        tanggal: formData.tanggal,
        jatuhTempo: formData.jatuhTempo,
        mata_uang: formData.mata_uang,
        kurs: Number(formData.kurs) || 1,
        catatan: formData.catatan,
        externalRef: formData.externalRef || null,
        lines: formData.lines.map((l) => ({
          itemType: l.itemType,
          deskripsi: l.deskripsi || 'Item Penjualan',
          qty: Number(l.qty),
          hargaSatuan: Number(l.hargaSatuan),
          diskon: Number(l.diskon || 0),
          ppnRate: Number(l.ppnRate || 0),
          akunPendapatanId: l.akunPendapatanId || null,
        })),
      };

      if (editingInvoice) {
        await api.updateDraftInvoice(currentTenant.id, editingInvoice.id, payload);
      } else {
        await api.createDraftInvoice(currentTenant.id, payload);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan faktur');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostInvoice = async (inv: SalesInvoice) => {
    if (!currentTenant) return;
    if (!confirm(`Posting Faktur "${inv.noDokumen}" ke Buku Besar (GL)? Status akan menjadi POSTED.`)) return;

    try {
      await api.postArInvoice(currentTenant.id, inv.id);
      alert(`Faktur ${inv.noDokumen} berhasil diposting ke GL!`);
      fetchData();
    } catch (err: any) {
      alert(`Gagal memposting: ${err.message}`);
    }
  };

  const handleExecuteVoid = async () => {
    if (!currentTenant || !voidInvoiceId) return;
    try {
      await api.voidArInvoice(currentTenant.id, voidInvoiceId, voidAlasan);
      alert('Faktur berhasil dibatalkan (VOID) dan jurnal pembalik telah dibuat.');
      setVoidInvoiceId(null);
      setVoidAlasan('');
      fetchData();
    } catch (err: any) {
      alert(`Gagal membatalkan faktur: ${err.message}`);
    }
  };

  const handleDeleteDraft = async (id: string, no: string) => {
    if (!currentTenant) return;
    if (!confirm(`Hapus draft faktur "${no}"?`)) return;
    try {
      await api.deleteDraftInvoice(currentTenant.id, id);
      fetchData();
    } catch (err: any) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
      if (partnerFilter !== 'ALL' && inv.partnerId !== partnerFilter) return false;
      if (startDate && new Date(inv.tanggal) < new Date(startDate)) return false;
      if (endDate && new Date(inv.tanggal) > new Date(endDate)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mDoc = inv.noDokumen.toLowerCase().includes(q);
        const mCust = inv.partner?.nama.toLowerCase().includes(q) || false;
        const mRef = inv.externalRef ? inv.externalRef.toLowerCase().includes(q) : false;
        return mDoc || mCust || mRef;
      }
      return true;
    });
  }, [invoices, statusFilter, partnerFilter, startDate, endDate, searchQuery]);

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  const getStatusBadge = (status: SalesInvoiceStatus) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
      case 'POSTED':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'PARTIAL':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'PAID':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'VOID':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="w-7 h-7 text-indigo-400" />
            Faktur Penjualan (Sales Invoices)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Penerbitan faktur tagihan pelanggan, perhitungan diskon & PPN, serta posting otomatis ke Akun Kontrol AR untuk{' '}
            <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Buat Faktur Baru
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          {/* Status Buttons */}
          {(['ALL', 'DRAFT', 'POSTED', 'PARTIAL', 'PAID', 'VOID'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === st ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white bg-slate-950/60'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Partner Selector */}
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
          >
            <option value="ALL">Semua Pelanggan</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari no faktur, pelanggan..."
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none w-48 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-4 font-semibold">No Dokumen</th>
              <th className="py-3.5 px-4 font-semibold">Tanggal & Jatuh Tempo</th>
              <th className="py-3.5 px-4 font-semibold">Pelanggan</th>
              <th className="py-3.5 px-4 font-semibold text-right">Total Tagihan</th>
              <th className="py-3.5 px-4 font-semibold text-right">Sisa Saldo</th>
              <th className="py-3.5 px-4 font-semibold">Status</th>
              <th className="py-3.5 px-4 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                  Memuat daftar faktur...
                </td>
              </tr>
            ) : filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                  Belum ada faktur yang sesuai dengan filter.
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-white">
                    <button
                      onClick={() => {
                        setSelectedInvoice(inv);
                        setIsDetailOpen(true);
                      }}
                      className="hover:underline hover:text-indigo-400 text-left"
                    >
                      {inv.noDokumen}
                    </button>
                    {inv.externalRef && (
                      <div className="text-[10px] text-slate-500 font-normal">Ref: {inv.externalRef}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono">
                    <div className="text-slate-200">{new Date(inv.tanggal).toLocaleDateString('id-ID')}</div>
                    <div className="text-slate-500 text-[11px]">
                      JT: {new Date(inv.jatuhTempo).toLocaleDateString('id-ID')}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{inv.partner?.nama}</div>
                    <div className="text-[11px] text-slate-500">{inv.partner?.kode}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                    {new Intl.NumberFormat('id-ID', {
                      style: 'currency',
                      currency: inv.mata_uang || 'IDR',
                      maximumFractionDigits: 0,
                    }).format(inv.total)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs">
                    <span
                      className={`font-bold ${
                        inv.saldo > 0 ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: inv.mata_uang || 'IDR',
                        maximumFractionDigits: 0,
                      }).format(inv.saldo)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(
                        inv.status,
                      )}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setIsDetailOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Lihat Detail Faktur"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Post button for DRAFT */}
                      {inv.status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => handleOpenEditModal(inv)}
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit Draft"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePostInvoice(inv)}
                            className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors"
                            title="Posting ke GL"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDraft(inv.id, inv.noDokumen)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Hapus Draft"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {/* Void button for POSTED/PARTIAL */}
                      {(inv.status === 'POSTED' || inv.status === 'PARTIAL') && (
                        <button
                          onClick={() => setVoidInvoiceId(inv.id)}
                          className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
                          title="Batalkan Faktur (VOID)"
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

      {/* Modal Buat / Edit Faktur Penjualan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                {editingInvoice ? 'Edit Draft Faktur Penjualan' : 'Buat Faktur Penjualan Baru'}
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
              {/* Header Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Pelanggan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Pelanggan (Customer) *
                  </label>
                  <select
                    required
                    value={formData.partnerId}
                    onChange={(e) => setFormData({ ...formData, partnerId: e.target.value })}
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

                {/* Tanggal */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tanggal Faktur *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  />
                </div>

                {/* Jatuh Tempo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tanggal Jatuh Tempo *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.jatuhTempo}
                    onChange={(e) => setFormData({ ...formData, jatuhTempo: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Mata Uang */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Mata Uang</label>
                  <input
                    type="text"
                    value={formData.mata_uang}
                    onChange={(e) => setFormData({ ...formData, mata_uang: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:border-indigo-500 outline-none"
                  />
                </div>

                {/* Kurs */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Kurs ke Base Currency</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.000001"
                    value={formData.kurs}
                    onChange={(e) => setFormData({ ...formData, kurs: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 outline-none"
                  />
                </div>

                {/* External Ref */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Referensi Eksternal</label>
                  <input
                    type="text"
                    value={formData.externalRef}
                    onChange={(e) => setFormData({ ...formData, externalRef: e.target.value })}
                    placeholder="No PO / SO Pelanggan"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Baris Dinamis Item Faktur */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Rincian Barang & Jasa ({formData.lines.length} Baris)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg border border-indigo-500/30 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-2.5">
                  {formData.lines.map((line, idx) => {
                    const lineSub = line.qty * line.hargaSatuan;
                    const dpp = Math.max(0, lineSub - line.diskon);
                    const ppn = (dpp * line.ppnRate) / 100;
                    const totalLine = dpp + ppn;

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
                      >
                        {/* Deskripsi */}
                        <div className="md:col-span-4">
                          <label className="block text-[11px] text-slate-400 mb-1">Deskripsi Item *</label>
                          <input
                            type="text"
                            required
                            value={line.deskripsi}
                            onChange={(e) => handleLineChange(idx, 'deskripsi', e.target.value)}
                            placeholder="Nama produk / layanan"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                          />
                        </div>

                        {/* Qty */}
                        <div className="md:col-span-1">
                          <label className="block text-[11px] text-slate-400 mb-1">Qty</label>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={line.qty}
                            onChange={(e) => handleLineChange(idx, 'qty', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:border-indigo-500 outline-none"
                          />
                        </div>

                        {/* Harga Satuan */}
                        <div className="md:col-span-2">
                          <label className="block text-[11px] text-slate-400 mb-1">Harga Satuan</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.hargaSatuan}
                            onChange={(e) => handleLineChange(idx, 'hargaSatuan', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:border-indigo-500 outline-none"
                          />
                        </div>

                        {/* Diskon */}
                        <div className="md:col-span-1">
                          <label className="block text-[11px] text-slate-400 mb-1">Diskon</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.diskon}
                            onChange={(e) => handleLineChange(idx, 'diskon', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:border-indigo-500 outline-none"
                          />
                        </div>

                        {/* PPN % */}
                        <div className="md:col-span-1">
                          <label className="block text-[11px] text-slate-400 mb-1">PPN (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={line.ppnRate}
                            onChange={(e) => handleLineChange(idx, 'ppnRate', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right focus:border-indigo-500 outline-none"
                          />
                        </div>

                        {/* Total Baris */}
                        <div className="md:col-span-2">
                          <label className="block text-[11px] text-slate-400 mb-1 text-right">Total Net</label>
                          <div className="text-right font-mono font-semibold text-xs text-indigo-300 py-1.5">
                            {new Intl.NumberFormat('id-ID').format(totalLine)}
                          </div>
                        </div>

                        {/* Hapus Baris */}
                        <div className="md:col-span-1 text-right">
                          <button
                            type="button"
                            disabled={formData.lines.length === 1}
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-30 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary Totals */}
              <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl flex flex-col sm:flex-row justify-between items-end gap-4">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Catatan Faktur</label>
                  <textarea
                    rows={2}
                    value={formData.catatan}
                    onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                    placeholder="Instruksi pembayaran, rekening transfer, keterangan..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="w-full sm:w-64 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span>{new Intl.NumberFormat('id-ID').format(totals.subtotal)}</span>
                  </div>
                  {totals.totalDiskon > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Total Diskon:</span>
                      <span>- {new Intl.NumberFormat('id-ID').format(totals.totalDiskon)}</span>
                    </div>
                  )}
                  {totals.totalPpn > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>PPN (Pajak):</span>
                      <span>+ {new Intl.NumberFormat('id-ID').format(totals.totalPpn)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white font-bold pt-2 border-t border-slate-800 text-sm">
                    <span>Grand Total:</span>
                    <span className="text-indigo-300">
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: formData.mata_uang || 'IDR',
                        maximumFractionDigits: 0,
                      }).format(totals.total)}
                    </span>
                  </div>
                </div>
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
                  {submitting ? 'Menyimpan...' : 'Simpan Draft Faktur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail Faktur */}
      {isDetailOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  Detail Faktur: {selectedInvoice.noDokumen}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold border ${getStatusBadge(
                    selectedInvoice.status,
                  )}`}
                >
                  Status: {selectedInvoice.status}
                </span>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400">Pelanggan:</span>
                <p className="font-semibold text-white mt-0.5">{selectedInvoice.partner?.nama}</p>
                <p className="text-[11px] text-slate-500">{selectedInvoice.partner?.kode}</p>
              </div>
              <div>
                <span className="text-slate-400">Tanggal & Jatuh Tempo:</span>
                <p className="font-semibold text-white mt-0.5">
                  {new Date(selectedInvoice.tanggal).toLocaleDateString('id-ID')} (JT:{' '}
                  {new Date(selectedInvoice.jatuhTempo).toLocaleDateString('id-ID')})
                </p>
              </div>
            </div>

            {/* Lines List */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Item / Deskripsi</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Harga</th>
                    <th className="py-2 px-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {selectedInvoice.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 font-sans">
                        <div>{l.deskripsi}</div>
                        {l.sourceLineType === 'DO_LINE' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800 mt-0.5">
                            DO Line (Tanpa Duplikasi HPP)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">{l.qty}</td>
                      <td className="py-2 px-3 text-right">{new Intl.NumberFormat('id-ID').format(l.hargaSatuan)}</td>
                      <td className="py-2 px-3 text-right font-bold text-indigo-300">
                        {new Intl.NumberFormat('id-ID').format(l.jumlah)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ringkasan Moneter */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1 text-xs font-mono text-right">
              <div>Total Tagihan: {new Intl.NumberFormat('id-ID').format(selectedInvoice.total)}</div>
              <div>Sudah Dibayar: {new Intl.NumberFormat('id-ID').format(selectedInvoice.totalDialokasikan)}</div>
              <div className="font-bold text-amber-400 pt-1 border-t border-slate-800">
                Sisa Saldo Piutang: {new Intl.NumberFormat('id-ID').format(selectedInvoice.saldo)}
              </div>
            </div>

            {/* Jurnal Info */}
            {selectedInvoice.journal && (
              <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl text-xs flex items-center justify-between">
                <div>
                  <span className="text-slate-400">Jurnal GL Terkait:</span>
                  <p className="font-mono font-bold text-white">{selectedInvoice.journal.no_voucher}</p>
                </div>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  {selectedInvoice.journal.status}
                </span>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Void Invoice */}
      {voidInvoiceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-rose-400" />
              Konfirmasi Void Faktur Penjualan
            </h3>
            <p className="text-xs text-slate-400">
              Membatalkan faktur akan membuat jurnal pembalik otomatis di GL dan mengubah status faktur menjadi VOID.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Alasan Pembatalan</label>
              <textarea
                rows={2}
                value={voidAlasan}
                onChange={(e) => setVoidAlasan(e.target.value)}
                placeholder="Misal: Salah input kuantitas, pesanan dibatalkan..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setVoidInvoiceId(null)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleExecuteVoid}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/30"
              >
                Ya, Batalkan Faktur (VOID)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

