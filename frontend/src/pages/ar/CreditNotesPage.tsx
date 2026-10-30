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
  X,
  Send,
  Ban,
  RotateCcw,
  Package,
} from 'lucide-react';
import {
  api,
  Tenant,
  CreditNote,
  BusinessPartner,
  CreditNoteStatus,
} from '../../services/api';

interface CreditNotesPageProps {
  currentTenant: Tenant | null;
}

export const CreditNotesPage: React.FC<CreditNotesPageProps> = ({ currentTenant }) => {
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [partnerFilter, setPartnerFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    partnerId: '',
    tanggal: new Date().toISOString().slice(0, 10),
    mata_uang: currentTenant?.mata_uang || 'IDR',
    kurs: 1,
    returnStock: false,
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
      },
    ],
  });

  // Void Prompt
  const [voidNoteId, setVoidNoteId] = useState<string | null>(null);
  const [voidAlasan, setVoidAlasan] = useState('');

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [cnData, partnerData] = await Promise.all([
        api.getArCreditNotes(currentTenant.id),
        api.getBusinessPartners(currentTenant.id, { type: 'customer', isActive: true }),
      ]);
      setCreditNotes(cnData);
      setPartners(partnerData);
    } catch (err) {
      console.error('Gagal mengambil data nota kredit:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant]);

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
    setFormData({
      partnerId: partners[0]?.id || '',
      tanggal: new Date().toISOString().slice(0, 10),
      mata_uang: currentTenant?.mata_uang || 'IDR',
      kurs: 1,
      returnStock: false,
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
        },
      ],
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
      await api.createArCreditNote(currentTenant.id, {
        partnerId: formData.partnerId,
        tanggal: formData.tanggal,
        mata_uang: formData.mata_uang,
        kurs: Number(formData.kurs) || 1,
        returnStock: formData.returnStock,
        catatan: formData.catatan,
        externalRef: formData.externalRef || null,
        lines: formData.lines.map((l) => ({
          itemType: l.itemType,
          deskripsi: l.deskripsi || 'Retur/Koreksi Penjualan',
          qty: Number(l.qty),
          hargaSatuan: Number(l.hargaSatuan),
          diskon: Number(l.diskon || 0),
          ppnRate: Number(l.ppnRate || 0),
        })),
      });

      alert('Nota kredit berhasil dibuat dan diposting ke GL!');
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan nota kredit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteVoid = async () => {
    if (!currentTenant || !voidNoteId) return;
    try {
      await api.voidArCreditNote(currentTenant.id, voidNoteId, voidAlasan);
      alert('Nota kredit berhasil dibatalkan (VOID) dan jurnal pembalik telah dibuat.');
      setVoidNoteId(null);
      setVoidAlasan('');
      fetchData();
    } catch (err: any) {
      alert(`Gagal membatalkan nota kredit: ${err.message}`);
    }
  };

  const filteredNotes = useMemo(() => {
    return creditNotes.filter((cn) => {
      if (partnerFilter !== 'ALL' && cn.partnerId !== partnerFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mDoc = cn.noDokumen.toLowerCase().includes(q);
        const mPartner = cn.partner?.nama.toLowerCase().includes(q) || false;
        return mDoc || mPartner;
      }
      return true;
    });
  }, [creditNotes, partnerFilter, searchQuery]);

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="w-7 h-7 text-indigo-400" />
            Nota Kredit Penjualan (Credit Notes)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Pengurangan piutang pelanggan untuk retur penjualan, koreksi harga, atau potongan khusus untuk{' '}
            <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Buat Nota Kredit
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
            placeholder="Cari no nota kredit, pelanggan..."
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
              <th className="py-3.5 px-4 font-semibold">Retur Fisik</th>
              <th className="py-3.5 px-4 font-semibold text-right">Total Nilai</th>
              <th className="py-3.5 px-4 font-semibold">Status</th>
              <th className="py-3.5 px-4 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                  Memuat data nota kredit...
                </td>
              </tr>
            ) : filteredNotes.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                  Belum ada transaksi nota kredit.
                </td>
              </tr>
            ) : (
              filteredNotes.map((cn) => (
                <tr key={cn.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-white">{cn.noDokumen}</td>
                  <td className="py-3 px-4 text-xs font-mono">
                    {new Date(cn.tanggal).toLocaleDateString('id-ID')}
                  </td>
                  <td className="py-3 px-4 font-semibold text-white">{cn.partner?.nama}</td>
                  <td className="py-3 px-4">
                    {cn.returnStock ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        <Package className="w-3 h-3" /> Balik Stok
                      </span>
                    ) : (
                      <span className="text-slate-500 text-xs">Penyesuaian Nilai</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-rose-300">
                    -{' '}
                    {new Intl.NumberFormat('id-ID', {
                      style: 'currency',
                      currency: cn.mata_uang || 'IDR',
                      maximumFractionDigits: 0,
                    }).format(cn.total)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        cn.status === 'POSTED'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {cn.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {cn.status === 'POSTED' && (
                      <button
                        onClick={() => setVoidNoteId(cn.id)}
                        className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
                        title="Batalkan Nota Kredit (VOID)"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Buat Nota Kredit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                Buat Nota Kredit Baru
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
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

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tanggal *</label>
                  <input
                    type="date"
                    required
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Checkbox Return Stock */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.returnStock}
                    onChange={(e) => setFormData({ ...formData, returnStock: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-indigo-400" />
                      Kembalikan Stok Fisik ke Gudang (Return Stock & Balik HPP)
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Centang jika terdapat barang fisik yang dikembalikan oleh pelanggan untuk otomatis menambah saldo stok persediaan.
                    </p>
                  </div>
                </label>
              </div>

              {/* Lines */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Rincian Retur / Koreksi
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-400 bg-indigo-500/10 rounded-lg border border-indigo-500/30"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                {formData.lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
                  >
                    <div className="md:col-span-5">
                      <label className="block text-[11px] text-slate-400 mb-1">Deskripsi *</label>
                      <input
                        type="text"
                        required
                        value={line.deskripsi}
                        onChange={(e) => handleLineChange(idx, 'deskripsi', e.target.value)}
                        placeholder="Alasan retur / potongan harga"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">Qty</label>
                      <input
                        type="number"
                        min="0.001"
                        value={line.qty}
                        onChange={(e) => handleLineChange(idx, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[11px] text-slate-400 mb-1">Harga Satuan</label>
                      <input
                        type="number"
                        min="0"
                        value={line.hargaSatuan}
                        onChange={(e) => handleLineChange(idx, 'hargaSatuan', parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-2 text-right">
                      <button
                        type="button"
                        disabled={formData.lines.length === 1}
                        onClick={() => handleRemoveLine(idx)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Display */}
              <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl flex justify-between items-center text-sm font-mono">
                <span className="text-slate-300 font-semibold">Total Pengurangan Piutang:</span>
                <span className="text-rose-400 font-bold text-base">
                  {new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: formData.mata_uang || 'IDR',
                    maximumFractionDigits: 0,
                  }).format(totals.total)}
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30"
                >
                  {submitting ? 'Memproses...' : 'Posting Nota Kredit ke GL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog Void */}
      {voidNoteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-rose-400" />
              Konfirmasi Void Nota Kredit
            </h3>
            <p className="text-xs text-slate-400">
              Membatalkan nota kredit akan membuat jurnal pembalik otomatis di GL.
            </p>
            <textarea
              rows={2}
              value={voidAlasan}
              onChange={(e) => setVoidAlasan(e.target.value)}
              placeholder="Alasan pembatalan..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-rose-500"
            />
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setVoidNoteId(null)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleExecuteVoid}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl"
              >
                Ya, Batalkan Nota Kredit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

