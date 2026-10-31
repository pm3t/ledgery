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
  DebitNote,
  BusinessPartner,
  DebitNoteStatus,
} from '../../services/api';

interface DebitNotesPageProps {
  currentTenant: Tenant | null;
}

export const DebitNotesPage: React.FC<DebitNotesPageProps> = ({ currentTenant }) => {
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>([]);
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
    billId: '',
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

  // Detail Modal
  const [selectedNote, setSelectedNote] = useState<DebitNote | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [dnData, partnerData] = await Promise.all([
        api.getDebitNotes(currentTenant.id),
        api.getBusinessPartners(currentTenant.id, { type: 'vendor', isActive: true }),
      ]);
      setDebitNotes(dnData);
      setPartners(partnerData);
    } catch (err) {
      console.error('Gagal mengambil data nota debit:', err);
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

  const handleAddLine = () => {
    setFormData((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          itemType: 'SERVICE',
          deskripsi: '',
          qty: 1,
          hargaSatuan: 0,
          diskon: 0,
          ppnRate: 11,
        },
      ],
    }));
  };

  const handleRemoveLine = (idx: number) => {
    if (formData.lines.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== idx),
    }));
  };

  const handleLineChange = (idx: number, field: string, val: any) => {
    setFormData((prev) => {
      const newLines = [...prev.lines];
      newLines[idx] = { ...newLines[idx], [field]: val };
      return { ...prev, lines: newLines };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!formData.partnerId) {
      setFormError('Pilih vendor terlebih dahulu');
      return;
    }
    if (formData.lines.length === 0) {
      setFormError('Minimal ada 1 baris nota debit');
      return;
    }
    for (const l of formData.lines) {
      if (!l.deskripsi.trim()) {
        setFormError('Deskripsi setiap baris harus diisi');
        return;
      }
      if (Number(l.qty) <= 0 || Number(l.hargaSatuan) <= 0) {
        setFormError('Qty dan harga satuan harus lebih dari 0');
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await api.createDebitNote(currentTenant.id, {
        partnerId: formData.partnerId,
        billId: formData.billId || undefined,
        tanggal: formData.tanggal,
        mata_uang: formData.mata_uang,
        kurs: Number(formData.kurs),
        returnStock: formData.returnStock,
        catatan: formData.catatan || undefined,
        externalRef: formData.externalRef || undefined,
        lines: formData.lines.map((l) => ({
          itemType: l.itemType,
          deskripsi: l.deskripsi,
          qty: Number(l.qty),
          hargaSatuan: Number(l.hargaSatuan),
          diskon: Number(l.diskon || 0),
          ppnRate: Number(l.ppnRate || 0),
        })),
      });

      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal membuat nota debit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async () => {
    if (!currentTenant || !voidNoteId) return;
    try {
      await api.voidDebitNote(currentTenant.id, voidNoteId, voidAlasan);
      setVoidNoteId(null);
      setVoidAlasan('');
      fetchData();
    } catch (err: any) {
      alert(`Gagal membatalkan nota debit: ${err.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      partnerId: '',
      billId: '',
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
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const filteredNotes = useMemo(() => {
    return debitNotes.filter((n) => {
      const matchPartner = partnerFilter === 'ALL' || n.partnerId === partnerFilter;
      const matchSearch =
        n.noDokumen.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.partner?.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.catatan && n.catatan.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchPartner && matchSearch;
    });
  }, [debitNotes, partnerFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-indigo-600" />
            Nota Debit (Debit Note)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pencatatan retur pembelian atau koreksi pengurangan hutang kepada vendor dan penyesuaian persediaan.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Buat Nota Debit
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
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="w-full sm:w-64">
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
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

      {/* Table Daftar Nota Debit */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">No. Dokumen</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Vendor</th>
                <th className="py-3 px-4 text-center">Retur Stok</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">PPN</th>
                <th className="py-3 px-4 text-right">Total Nota Debit</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    Memuat data nota debit...
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    Belum ada data nota debit.
                  </td>
                </tr>
              ) : (
                filteredNotes.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {n.noDokumen}
                      {n.externalRef && (
                        <div className="text-xs text-slate-400 font-normal">Ref: {n.externalRef}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(n.tanggal).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {n.partner?.nama || '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {n.returnStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Package className="w-3 h-3" /> Ya
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Tidak</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">
                      {n.mata_uang} {formatNumber(Number(n.subtotal))}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">
                      {n.mata_uang} {formatNumber(Number(n.totalPpn))}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-800">
                      {n.mata_uang} {formatNumber(Number(n.total))}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {n.status === 'POSTED' ? (
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
                            setSelectedNote(n);
                            setIsDetailOpen(true);
                          }}
                          title="Lihat Rincian"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {n.status === 'POSTED' && (
                          <button
                            onClick={() => {
                              setVoidNoteId(n.id);
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

      {/* Modal Buat Nota Debit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-indigo-600" />
                  Buat Nota Debit (Retur Pembelian)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Nota Debit langsung diposting ke GL (Dr Hutang AP_CONTROL / Cr Biaya atau Persediaan + Cr PPN Masukan).
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1">
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
                    onChange={(e) => setFormData({ ...formData, partnerId: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
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
                    Tanggal Nota Debit <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Mata Uang & Kurs
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.mata_uang}
                      onChange={(e) => setFormData({ ...formData, mata_uang: e.target.value.toUpperCase() })}
                      className="w-24 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="number"
                      step="any"
                      min="0.000001"
                      value={formData.kurs}
                      onChange={(e) => setFormData({ ...formData, kurs: Number(e.target.value) })}
                      disabled={formData.mata_uang === (currentTenant?.mata_uang || 'IDR')}
                      placeholder="Kurs"
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Opsi Retur Stok & Catatan */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="returnStock"
                    checked={formData.returnStock}
                    onChange={(e) => setFormData({ ...formData, returnStock: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <label htmlFor="returnStock" className="text-xs font-medium text-slate-700 cursor-pointer">
                    <span className="font-semibold text-slate-900">Kembalikan Stok Fisik (Return Stock):</span> Kurangi persediaan gudang sesuai harga pokok asli melalui modul persediaan.
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      No. Referensi Eksternal
                    </label>
                    <input
                      type="text"
                      value={formData.externalRef}
                      onChange={(e) => setFormData({ ...formData, externalRef: e.target.value })}
                      placeholder="Contoh: DN-VND-001"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Catatan / Alasan Retur
                    </label>
                    <input
                      type="text"
                      value={formData.catatan}
                      onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                      placeholder="Alasan penerbitan nota debit..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Baris Rincian */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Rincian Barang / Jasa
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Baris
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 w-28">Tipe</th>
                        <th className="py-2.5 px-3">Deskripsi Barang / Jasa</th>
                        <th className="py-2.5 px-3 w-20 text-right">Qty</th>
                        <th className="py-2.5 px-3 w-32 text-right">Harga Satuan</th>
                        <th className="py-2.5 px-3 w-24 text-right">Diskon</th>
                        <th className="py-2.5 px-3 w-20 text-right">PPN %</th>
                        <th className="py-2.5 px-3 w-32 text-right">Total</th>
                        <th className="py-2.5 px-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formData.lines.map((line, idx) => {
                        const lineSub = Number(line.qty || 0) * Number(line.hargaSatuan || 0);
                        const dpp = Math.max(0, lineSub - Number(line.diskon || 0));
                        const lineTotal = dpp + (dpp * Number(line.ppnRate || 0)) / 100;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3">
                              <select
                                value={line.itemType}
                                onChange={(e) =>
                                  handleLineChange(idx, 'itemType', e.target.value as 'STOCK' | 'SERVICE')
                                }
                                className="w-full p-1.5 text-xs border border-slate-200 rounded bg-white"
                              >
                                <option value="SERVICE">Jasa/Biaya</option>
                                <option value="STOCK">Barang Stok</option>
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={line.deskripsi}
                                onChange={(e) => handleLineChange(idx, 'deskripsi', e.target.value)}
                                placeholder="Nama atau deskripsi barang/retur..."
                                className="w-full p-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                min="0.0001"
                                step="any"
                                value={line.qty || ''}
                                onChange={(e) => handleLineChange(idx, 'qty', Number(e.target.value))}
                                className="w-full p-1.5 text-xs text-right border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.hargaSatuan || ''}
                                onChange={(e) =>
                                  handleLineChange(idx, 'hargaSatuan', Number(e.target.value))
                                }
                                className="w-full p-1.5 text-xs text-right border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.diskon || ''}
                                onChange={(e) => handleLineChange(idx, 'diskon', Number(e.target.value))}
                                className="w-full p-1.5 text-xs text-right border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={line.ppnRate || ''}
                                onChange={(e) => handleLineChange(idx, 'ppnRate', Number(e.target.value))}
                                className="w-full p-1.5 text-xs text-right border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-slate-700">
                              {formatNumber(lineTotal)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              {formData.lines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Ringkasan Subtotal / Total */}
                <div className="flex justify-end pt-2">
                  <div className="w-64 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal:</span>
                      <span>
                        {formData.mata_uang} {formatNumber(totals.subtotal)}
                      </span>
                    </div>
                    {totals.totalDiskon > 0 && (
                      <div className="flex justify-between text-rose-500">
                        <span>Total Diskon:</span>
                        <span>
                          -{formData.mata_uang} {formatNumber(totals.totalDiskon)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500">
                      <span>Total PPN:</span>
                      <span>
                        {formData.mata_uang} {formatNumber(totals.totalPpn)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 text-sm pt-1 border-t border-slate-200">
                      <span>Total Nota Debit:</span>
                      <span className="text-indigo-600">
                        {formData.mata_uang} {formatNumber(totals.total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
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
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 rounded-lg shadow-sm transition-all"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Memproses...' : 'Posting Nota Debit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail Nota Debit */}
      {isDetailOpen && selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-indigo-600" />
                  Rincian Nota Debit {selectedNote.noDokumen}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                    selectedNote.status === 'POSTED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {selectedNote.status}
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
                    {selectedNote.partner?.kode} - {selectedNote.partner?.nama}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Tanggal</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(selectedNote.tanggal).toLocaleDateString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Retur Fisik Stok</span>
                  <span className="font-semibold text-slate-800">
                    {selectedNote.returnStock ? 'Ya (Kurangi Persediaan Gudang)' : 'Tidak (Koreksi Finansial Saja)'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Total Nilai</span>
                  <span className="font-bold text-indigo-600">
                    {selectedNote.mata_uang} {formatNumber(Number(selectedNote.total))}
                  </span>
                </div>
              </div>

              {/* Tabel Baris */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Daftar Barang / Jasa Diretur
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Deskripsi</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedNote.lines?.map((line) => (
                        <tr key={line.id}>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {line.deskripsi}
                            <span className="text-[10px] text-slate-400 block">
                              Tipe: {line.itemType === 'STOCK' ? 'Stok Gudang' : 'Biaya/Jasa'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">{line.qty}</td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            {formatNumber(Number(line.hargaSatuan))}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                            {formatNumber(Number(line.jumlah))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Jurnal Link */}
              {selectedNote.journal && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-600">Nomor Voucher Jurnal Umum:</span>
                  <span className="font-mono font-semibold text-indigo-700">
                    {selectedNote.journal.no_voucher}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Void */}
      {voidNoteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Batalkan Nota Debit (Void)</h3>
            </div>
            <p className="text-sm text-slate-600">
              Membatalkan nota debit akan mengembalikan saldo hutang dan membuat jurnal pembalik secara otomatis.
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
                onClick={() => setVoidNoteId(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Kembali
              </button>
              <button
                onClick={handleVoid}
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

