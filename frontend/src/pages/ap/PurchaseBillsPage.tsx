import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Edit2,
  ExternalLink,
  Ban,
  ArrowRight,
  Layers,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Building2,
  Calendar,
  Receipt,
  Eye,
} from 'lucide-react';
import {
  api,
  Tenant,
  PurchaseBill,
  PurchaseBillLine,
  PurchaseBillStatus,
  BusinessPartner,
  ChartOfAccount,
  Dimension,
} from '../../services/api';

interface PurchaseBillsPageProps {
  currentTenant: Tenant | null;
  onNavigateToPayments?: (billId?: string) => void;
}

interface BillLineFormItem {
  id?: string;
  itemId?: string;
  itemType: 'STOCK' | 'SERVICE';
  deskripsi: string;
  qty: number;
  hargaSatuan: number;
  diskon: number;
  ppnRate: number;
  akunBiayaId?: string;
  dimensions?: { nama_dimension: string; kode_value: string }[];
}

export const PurchaseBillsPage: React.FC<PurchaseBillsPageProps> = ({
  currentTenant,
  onNavigateToPayments,
}) => {
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [vendors, setVendors] = useState<BusinessPartner[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);

  // Filter States
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedVendor, setSelectedVendor] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modal States
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Field States
  const [formVendorId, setFormVendorId] = useState<string>('');
  const [formNoFakturVendor, setFormNoFakturVendor] = useState<string>('');
  const [formNomorFakturPajakMasukan, setFormNomorFakturPajakMasukan] = useState<string>('');
  const [formTanggal, setFormTanggal] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [formJatuhTempo, setFormJatuhTempo] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [formMataUang, setFormMataUang] = useState<string>('IDR');
  const [formKurs, setFormKurs] = useState<number>(1.0);
  const [formCatatan, setFormCatatan] = useState<string>('');
  const [formLines, setFormLines] = useState<BillLineFormItem[]>([
    {
      itemType: 'SERVICE',
      deskripsi: '',
      qty: 1,
      hargaSatuan: 0,
      diskon: 0,
      ppnRate: 11,
    },
  ]);

  // Load Data Master & Faktur
  const loadData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [billsData, partnersData, coaData, dimData] = await Promise.all([
        api.getPurchaseBills(currentTenant.id),
        api.getBusinessPartners(currentTenant.id, { type: 'vendor', isActive: true }),
        api.getCoaByTenant(currentTenant.id),
        api.getDimensions ? api.getDimensions() : Promise.resolve([]),
      ]);

      setBills(billsData || []);
      // Filter mitra bisnis yang merupakan Vendor
      setVendors((partnersData || []).filter((p: BusinessPartner) => p.isVendor));
      setAccounts(coaData || []);
      setDimensions(dimData || []);
    } catch (err: any) {
      console.error('Gagal memuat data faktur pembelian:', err);
      setErrorMessage(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentTenant]);

  // Format Angka & Mata Uang
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Kalkulasi Realtime Nilai Form
  const formCalculations = useMemo(() => {
    let subtotal = 0;
    let totalDiskon = 0;
    let totalPpn = 0;

    formLines.forEach((l) => {
      const lineGross = Number(l.qty || 0) * Number(l.hargaSatuan || 0);
      const lineDiskon = Number(l.diskon || 0);
      const dpp = Math.max(0, lineGross - lineDiskon);
      const linePpn = (dpp * Number(l.ppnRate || 0)) / 100;

      subtotal += lineGross;
      totalDiskon += lineDiskon;
      totalPpn += linePpn;
    });

    const total = subtotal - totalDiskon + totalPpn;
    return {
      subtotal,
      totalDiskon,
      totalPpn,
      total,
      totalFungsional: total * (formKurs || 1),
    };
  }, [formLines, formKurs]);

  // Tambah / Hapus Baris Form
  const handleAddLine = () => {
    setFormLines([
      ...formLines,
      {
        itemType: 'SERVICE',
        deskripsi: '',
        qty: 1,
        hargaSatuan: 0,
        diskon: 0,
        ppnRate: 11,
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (formLines.length === 1) return;
    setFormLines(formLines.filter((_, i) => i !== index));
  };

  const handleUpdateLine = (index: number, field: keyof BillLineFormItem, value: any) => {
    const updated = [...formLines];
    updated[index] = { ...updated[index], [field]: value };
    setFormLines(updated);
  };

  // Buka Modal Tambah
  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormVendorId(vendors.length > 0 ? vendors[0].id : '');
    setFormNoFakturVendor('');
    setFormNomorFakturPajakMasukan('');
    setFormTanggal(new Date().toISOString().slice(0, 10));
    setFormJatuhTempo(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setFormMataUang(currentTenant?.mata_uang || 'IDR');
    setFormKurs(1.0);
    setFormCatatan('');
    setFormLines([
      {
        itemType: 'SERVICE',
        deskripsi: '',
        qty: 1,
        hargaSatuan: 0,
        diskon: 0,
        ppnRate: 11,
      },
    ]);
    setShowFormModal(true);
  };

  // Simpan Draft
  const handleSaveDraft = async () => {
    if (!currentTenant) return;
    if (!formVendorId) {
      alert('Pilih vendor terlebih dahulu');
      return;
    }
    if (formLines.some((l) => !l.deskripsi.trim() || l.qty <= 0)) {
      alert('Semua baris harus memiliki deskripsi dan kuantitas lebih dari 0');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        partnerId: formVendorId,
        noFakturVendor: formNoFakturVendor || undefined,
        nomorFakturPajakMasukan: formNomorFakturPajakMasukan || undefined,
        tanggal: formTanggal,
        jatuhTempo: formJatuhTempo,
        mata_uang: formMataUang,
        kurs: Number(formKurs) || 1,
        catatan: formCatatan,
        lines: formLines.map((l) => ({
          itemId: l.itemId || undefined,
          itemType: l.itemType,
          deskripsi: l.deskripsi,
          qty: Number(l.qty),
          hargaSatuan: Number(l.hargaSatuan),
          diskon: Number(l.diskon || 0),
          ppnRate: Number(l.ppnRate || 0),
          akunBiayaId: l.akunBiayaId || undefined,
          dimensions: l.dimensions || undefined,
        })),
      };

      if (isEditing && editingId) {
        await api.updateDraftPurchaseBill(currentTenant.id, editingId, payload);
      } else {
        await api.createDraftPurchaseBill(currentTenant.id, payload);
      }

      setShowFormModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan draft faktur pembelian');
    } finally {
      setActionLoading(false);
    }
  };

  // Post Faktur ke GL
  const handlePostBill = async (id: string) => {
    if (!currentTenant) return;
    if (!confirm('Posting faktur pembelian ini ke Buku Besar (GL)? Aksi ini akan mencatat jurnal hutang dan tidak dapat diedit kembali.')) return;

    setActionLoading(true);
    try {
      await api.postPurchaseBill(currentTenant.id, id);
      await loadData();
      if (selectedBill && selectedBill.id === id) {
        const updated = await api.getPurchaseBill(currentTenant.id, id);
        setSelectedBill(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal memposting faktur pembelian');
    } finally {
      setActionLoading(false);
    }
  };

  // Void Faktur
  const handleVoidBill = async (id: string) => {
    if (!currentTenant) return;
    const alasan = prompt('Masukkan alasan pembatalan (Void) faktur pembelian ini:');
    if (alasan === null) return;
    if (!alasan.trim()) {
      alert('Alasan pembatalan wajib diisi');
      return;
    }

    setActionLoading(true);
    try {
      await api.voidPurchaseBill(currentTenant.id, id, alasan);
      await loadData();
      if (selectedBill && selectedBill.id === id) {
        setShowDetailModal(false);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal membatalkan faktur pembelian');
    } finally {
      setActionLoading(false);
    }
  };

  // Hapus Draft
  const handleDeleteDraft = async (id: string) => {
    if (!currentTenant) return;
    if (!confirm('Hapus draft faktur pembelian ini?')) return;
    try {
      await api.deleteDraftPurchaseBill(currentTenant.id, id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus draft');
    }
  };

  // Filter Data di Tabel
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      if (selectedStatus !== 'ALL' && b.status !== selectedStatus) return false;
      if (selectedVendor !== 'ALL' && b.partnerId !== selectedVendor) return false;
      if (startDate && b.tanggal.slice(0, 10) < startDate) return false;
      if (endDate && b.tanggal.slice(0, 10) > endDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const noDok = b.noDokumen.toLowerCase();
        const vendor = (b.partner?.nama || '').toLowerCase();
        const noVend = (b.noFakturVendor || '').toLowerCase();
        const ext = (b.externalRef || '').toLowerCase();
        return noDok.includes(q) || vendor.includes(q) || noVend.includes(q) || ext.includes(q);
      }
      return true;
    });
  }, [bills, selectedStatus, selectedVendor, startDate, endDate, searchQuery]);

  // Status Badge Component
  const renderStatusBadge = (status: PurchaseBillStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" /> Draft
          </span>
        );
      case 'POSTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <CheckCircle2 className="w-3 h-3 text-blue-400" /> Posted (Outstanding)
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-400" /> Dibayar Sebagian
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Lunas
          </span>
        );
      case 'VOID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <Ban className="w-3 h-3 text-rose-400" /> Void
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Receipt className="w-7 h-7 text-indigo-400" />
            Faktur Pembelian (Purchase Bills)
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Kelola tagihan pembelian vendor dan pencatatan hutang usaha untuk{' '}
            <span className="text-indigo-300 font-semibold">{currentTenant?.nama_perusahaan}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition-colors"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            Buat Faktur Pembelian
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1">
            {['ALL', 'DRAFT', 'POSTED', 'PARTIAL', 'PAID', 'VOID'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedStatus === st
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {st === 'ALL'
                  ? 'Semua Status'
                  : st === 'POSTED'
                  ? 'Outstanding'
                  : st === 'PARTIAL'
                  ? 'Sebagian'
                  : st === 'PAID'
                  ? 'Lunas'
                  : st}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari no. faktur / vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-1.5 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Baris Filter Vendor & Tanggal */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800/70 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Vendor:</span>
            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">Semua Vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.kode} - {v.nama}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>Periode:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            />
            <span>s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {(startDate || endDate || selectedVendor !== 'ALL' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSelectedVendor('ALL');
                setSearchQuery('');
              }}
              className="text-indigo-400 hover:text-indigo-300 underline text-xs ml-auto"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Tabel Data Faktur Pembelian */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Memuat data faktur pembelian...</span>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <Receipt className="w-8 h-8 text-slate-600 mx-auto" />
            <p>Tidak ada faktur pembelian yang sesuai dengan kriteria filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 uppercase tracking-wider border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-3 px-4">No Dokumen</th>
                  <th className="py-3 px-4">No Faktur Vendor</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Jatuh Tempo</th>
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4 text-right">Total Tagihan</th>
                  <th className="py-3 px-4 text-right">Sisa Saldo</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-white">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBill(bill);
                          setShowDetailModal(true);
                        }}
                        className="hover:underline text-indigo-400 hover:text-indigo-300 text-left font-mono"
                      >
                        {bill.noDokumen}
                      </button>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {bill.noFakturVendor || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {bill.tanggal.slice(0, 10)}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span
                        className={
                          bill.status !== 'PAID' &&
                          bill.status !== 'VOID' &&
                          new Date(bill.jatuhTempo) < new Date()
                            ? 'text-rose-400 font-bold'
                            : 'text-slate-400'
                        }
                      >
                        {bill.jatuhTempo.slice(0, 10)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">
                        {bill.partner?.nama || '-'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {bill.partner?.kode}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-white">
                      <span className="text-[10px] text-slate-500 mr-1">{bill.mata_uang}</span>
                      {formatNumber(Number(bill.total))}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      <span className="text-[10px] text-slate-500 mr-1">{bill.mata_uang}</span>
                      <span
                        className={
                          Number(bill.saldo) > 0 ? 'text-amber-300' : 'text-slate-400'
                        }
                      >
                        {formatNumber(Number(bill.saldo))}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {renderStatusBadge(bill.status)}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {/* Tombol Detail */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBill(bill);
                          setShowDetailModal(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Lihat Rincian Faktur"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Tombol Post (Hanya DRAFT) */}
                      {bill.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => handlePostBill(bill.id)}
                          className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition-colors"
                          title="Posting ke Buku Besar"
                        >
                          Post GL
                        </button>
                      )}

                      {/* Tombol Bayar (Jika POSTED / PARTIAL) */}
                      {(bill.status === 'POSTED' || bill.status === 'PARTIAL') &&
                        onNavigateToPayments && (
                          <button
                            type="button"
                            onClick={() => onNavigateToPayments(bill.id)}
                            className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors"
                            title="Bayar Tagihan Ini"
                          >
                            Bayar
                          </button>
                        )}

                      {/* Tombol Void (Hanya POSTED dan belum dialokasikan) */}
                      {bill.status === 'POSTED' && Number(bill.totalDialokasikan) === 0 && (
                        <button
                          type="button"
                          onClick={() => handleVoidBill(bill.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                          title="Batalkan Faktur (Void)"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}

                      {/* Tombol Hapus (Hanya DRAFT) */}
                      {bill.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDraft(bill.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                          title="Hapus Draft"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL FORM BUAT / EDIT FAKTUR PEMBELIAN */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-400" />
                  {isEditing ? 'Edit Faktur Pembelian' : 'Buat Faktur Pembelian Baru'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Isi data faktur dari vendor beserta rincian barang/jasa yang dibeli.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                &times;
              </button>
            </div>

            {/* Body Form Modal */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
              {/* Baris 1: Vendor & Nomor Faktur Vendor */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Vendor / Supplier *
                  </label>
                  <select
                    value={formVendorId}
                    onChange={(e) => setFormVendorId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Pilih Vendor --</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.kode} - {v.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    No. Faktur dari Vendor
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: INV-VEND-2026-001"
                    value={formNoFakturVendor}
                    onChange={(e) => setFormNoFakturVendor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    No. Faktur Pajak Masukan
                  </label>
                  <input
                    type="text"
                    placeholder="010.000-26.00000001"
                    value={formNomorFakturPajakMasukan}
                    onChange={(e) => setFormNomorFakturPajakMasukan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Baris 2: Tanggal, Jatuh Tempo, Mata Uang, Kurs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tanggal Faktur *</label>
                  <input
                    type="date"
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Jatuh Tempo *</label>
                  <input
                    type="date"
                    value={formJatuhTempo}
                    onChange={(e) => setFormJatuhTempo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mata Uang</label>
                  <input
                    type="text"
                    value={formMataUang}
                    onChange={(e) => setFormMataUang(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Kurs (Ekuivalen)</label>
                  <input
                    type="number"
                    step="any"
                    value={formKurs}
                    onChange={(e) => setFormKurs(parseFloat(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Baris Rincian Item Barang / Jasa */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Baris Rincian Pembelian
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="border border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 min-w-[120px]">Tipe Item</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Deskripsi</th>
                        <th className="py-2.5 px-3 w-20 text-right">Qty</th>
                        <th className="py-2.5 px-3 w-32 text-right">Harga Satuan</th>
                        <th className="py-2.5 px-3 w-24 text-right">Diskon</th>
                        <th className="py-2.5 px-3 w-20 text-right">PPN %</th>
                        <th className="py-2.5 px-3 w-32 text-right">Subtotal</th>
                        <th className="py-2.5 px-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {formLines.map((line, idx) => {
                        const lineGross = Number(line.qty || 0) * Number(line.hargaSatuan || 0);
                        const dpp = Math.max(0, lineGross - Number(line.diskon || 0));
                        const lineTotal = dpp + (dpp * Number(line.ppnRate || 0)) / 100;

                        return (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-2 px-3">
                              <select
                                value={line.itemType}
                                onChange={(e) =>
                                  handleUpdateLine(idx, 'itemType', e.target.value as any)
                                }
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200"
                              >
                                <option value="SERVICE">Jasa / Biaya</option>
                                <option value="STOCK">Barang STOK</option>
                              </select>
                            </td>

                            <td className="py-2 px-3">
                              <input
                                type="text"
                                placeholder="Nama barang / deskripsi pembelian..."
                                value={line.deskripsi}
                                onChange={(e) => handleUpdateLine(idx, 'deskripsi', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                            </td>

                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={line.qty}
                                onChange={(e) =>
                                  handleUpdateLine(idx, 'qty', parseFloat(e.target.value) || 0)
                                }
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-right text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                            </td>

                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.hargaSatuan}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    idx,
                                    'hargaSatuan',
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-right text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                            </td>

                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.diskon}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    idx,
                                    'diskon',
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-right text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                            </td>

                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={line.ppnRate}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    idx,
                                    'ppnRate',
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-right text-slate-200 focus:outline-none focus:border-indigo-500"
                              />
                            </td>

                            <td className="py-2 px-3 text-right font-mono font-medium text-white">
                              {formatNumber(lineTotal)}
                            </td>

                            <td className="py-2 px-2 text-center">
                              {formLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="text-slate-500 hover:text-rose-400 p-1 rounded"
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
              </div>

              {/* Catatan & Ringkasan Total */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Catatan Faktur / Memo
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Keterangan tambahan untuk faktur ini..."
                    value={formCatatan}
                    onChange={(e) => setFormCatatan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal Kotor:</span>
                    <span className="font-mono text-white font-medium">
                      {formMataUang} {formatNumber(formCalculations.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total Diskon Pembelian:</span>
                    <span className="font-mono text-rose-300 font-medium">
                      - {formMataUang} {formatNumber(formCalculations.totalDiskon)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total PPN Masukan:</span>
                    <span className="font-mono text-indigo-300 font-medium">
                      + {formMataUang} {formatNumber(formCalculations.totalPpn)}
                    </span>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
                    <span className="text-white">Total Tagihan:</span>
                    <span className="font-mono text-indigo-400">
                      {formMataUang} {formatNumber(formCalculations.total)}
                    </span>
                  </div>
                  {formMataUang !== 'IDR' && (
                    <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
                      <span>Ekuivalen Fungsional (Kurs {formKurs}):</span>
                      <span className="font-mono">
                        IDR {formatNumber(formCalculations.totalFungsional)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Batal
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Simpan Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETAIL FAKTUR PEMBELIAN */}
      {showDetailModal && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            {/* Header Detail */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white font-mono">
                    {selectedBill.noDokumen}
                  </h3>
                  {renderStatusBadge(selectedBill.status)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Faktur Pembelian &bull; Vendor: {selectedBill.partner?.nama}
                  {selectedBill.noFakturVendor ? ` &bull; No. Faktur Vendor: ${selectedBill.noFakturVendor}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                &times;
              </button>
            </div>

            {/* Content Detail */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
              {/* Ringkasan Nilai Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <div className="text-slate-500">Tanggal Faktur:</div>
                  <div className="text-white font-mono font-semibold mt-0.5">
                    {selectedBill.tanggal.slice(0, 10)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Jatuh Tempo:</div>
                  <div className="text-white font-mono font-semibold mt-0.5">
                    {selectedBill.jatuhTempo.slice(0, 10)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Total Tagihan:</div>
                  <div className="text-indigo-400 font-mono font-bold text-sm mt-0.5">
                    {selectedBill.mata_uang} {formatNumber(Number(selectedBill.total))}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Sisa Saldo:</div>
                  <div className="text-amber-400 font-mono font-bold text-sm mt-0.5">
                    {selectedBill.mata_uang} {formatNumber(Number(selectedBill.saldo))}
                  </div>
                </div>
              </div>

              {/* Rincian Baris Barang/Jasa */}
              <div>
                <h4 className="font-bold text-white text-xs mb-2">Rincian Baris Pembelian:</h4>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Deskripsi</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Harga Satuan</th>
                        <th className="py-2 px-3 text-right">Diskon</th>
                        <th className="py-2 px-3 text-right">PPN</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedBill.lines?.map((line: PurchaseBillLine, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/20">
                          <td className="py-2 px-3 font-medium text-white">
                            <div>{line.deskripsi}</div>
                            {line.sourceLineType === 'GR_LINE' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-950/80 text-indigo-400 border border-indigo-800 mt-0.5">
                                GR Line (Kliring GR/IR & PPV)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{line.qty}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {formatNumber(Number(line.hargaSatuan))}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {formatNumber(Number(line.diskon || 0))}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">{line.ppnRate}%</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-white">
                            {formatNumber(Number(line.jumlah))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tautan Jurnal GL */}
              {selectedBill.journal && (
                <div className="p-3 bg-indigo-950/20 border border-indigo-800/40 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <div>
                      <div className="text-white font-semibold">
                        Jurnal GL Tertaut: {selectedBill.journal.no_voucher}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Status Jurnal: {selectedBill.journal.status}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Detail Modal */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                {selectedBill.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={() => handlePostBill(selectedBill.id)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-lg shadow-indigo-600/30"
                  >
                    Posting GL Sekarang
                  </button>
                )}
                {(selectedBill.status === 'POSTED' || selectedBill.status === 'PARTIAL') &&
                  onNavigateToPayments && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowDetailModal(false);
                        onNavigateToPayments(selectedBill.id);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-colors"
                    >
                      Bayar Tagihan Ini
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
