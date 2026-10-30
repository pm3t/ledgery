import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Upload,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Filter,
  RefreshCw,
  Building2,
  CreditCard,
  Calendar,
  X,
  Phone,
  MapPin,
  FileText,
} from 'lucide-react';
import { api, BusinessPartner, Tenant } from '../services/api';

interface BusinessPartnersPageProps {
  currentTenant: Tenant | null;
}

export const BusinessPartnersPage: React.FC<BusinessPartnersPageProps> = ({ currentTenant }) => {
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CUSTOMER' | 'VENDOR' | 'BOTH'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<BusinessPartner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    kode: '',
    nama: '',
    npwp: '',
    alamat: '',
    kontak: '',
    termPembayaranHari: 30,
    creditLimit: '',
    mata_uang: currentTenant?.mata_uang || 'IDR',
    isCustomer: true,
    isVendor: false,
    groupCode: '',
    externalRef: '',
    isActive: true,
  });

  // Modal Import CSV
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: any[] } | null>(null);

  const fetchPartners = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getBusinessPartners(currentTenant.id);
      setPartners(data);
    } catch (err: any) {
      console.error('Gagal mengambil data mitra bisnis:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [currentTenant]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingPartner(null);
    setFormData({
      kode: '',
      nama: '',
      npwp: '',
      alamat: '',
      kontak: '',
      termPembayaranHari: 30,
      creditLimit: '',
      mata_uang: currentTenant?.mata_uang || 'IDR',
      isCustomer: true,
      isVendor: false,
      groupCode: '',
      externalRef: '',
      isActive: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (p: BusinessPartner) => {
    setEditingPartner(p);
    setFormData({
      kode: p.kode,
      nama: p.nama,
      npwp: p.npwp || '',
      alamat: p.alamat || '',
      kontak: p.kontak || '',
      termPembayaranHari: p.termPembayaranHari || 30,
      creditLimit: p.creditLimit !== null && p.creditLimit !== undefined ? String(p.creditLimit) : '',
      mata_uang: p.mata_uang || currentTenant?.mata_uang || 'IDR',
      isCustomer: p.isCustomer,
      isVendor: p.isVendor,
      groupCode: p.groupCode || '',
      externalRef: p.externalRef || '',
      isActive: p.isActive,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Submit Partner Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!formData.kode.trim()) {
      setFormError('Kode mitra bisnis tidak boleh kosong');
      return;
    }
    if (!formData.nama.trim()) {
      setFormError('Nama mitra bisnis tidak boleh kosong');
      return;
    }
    if (!formData.isCustomer && !formData.isVendor) {
      setFormError('Pilih minimal satu peran: Pelanggan (Customer) atau Pemasok (Vendor)');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      kode: formData.kode.trim().toUpperCase(),
      nama: formData.nama.trim(),
      npwp: formData.npwp.trim() || null,
      alamat: formData.alamat.trim() || null,
      kontak: formData.kontak.trim() || null,
      termPembayaranHari: Number(formData.termPembayaranHari) || 0,
      creditLimit: formData.creditLimit ? parseFloat(formData.creditLimit) : null,
      mata_uang: formData.mata_uang || currentTenant.mata_uang,
      isCustomer: formData.isCustomer,
      isVendor: formData.isVendor,
      groupCode: formData.groupCode.trim() || null,
      externalRef: formData.externalRef.trim() || null,
      isActive: formData.isActive,
    };

    try {
      if (editingPartner) {
        await api.updateBusinessPartner(currentTenant.id, editingPartner.id, payload);
      } else {
        await api.createBusinessPartner(currentTenant.id, payload);
      }
      setIsModalOpen(false);
      fetchPartners();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data mitra bisnis');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete / Soft-deactivate Partner
  const handleDeletePartner = async (p: BusinessPartner) => {
    if (!currentTenant) return;
    const confirmText = p.isActive
      ? `Nonaktifkan / hapus mitra bisnis "${p.nama}" (${p.kode})?`
      : `Hapus permanen mitra bisnis "${p.nama}" (${p.kode})?`;

    if (!confirm(confirmText)) return;

    try {
      const res = await api.deleteBusinessPartner(currentTenant.id, p.id);
      alert(res.message);
      fetchPartners();
    } catch (err: any) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  // Handle CSV file selection and client-side parse
  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        alert('File CSV minimal harus berisi baris header dan 1 baris data.');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const parsedRows: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols.length === headers.length) {
          const rowObj: any = {};
          headers.forEach((h, idx) => {
            rowObj[h] = cols[idx];
          });
          parsedRows.push(rowObj);
        }
      }
      setCsvPreview(parsedRows);
    };
    reader.readAsText(file);
  };

  // Submit CSV Import
  const handleExecuteImport = async () => {
    if (!currentTenant || csvPreview.length === 0) return;
    setImporting(true);
    setImportResult(null);

    try {
      const formatted = csvPreview.map((row) => ({
        kode: row.kode || row.Kode || '',
        nama: row.nama || row.Nama || '',
        isCustomer: row.isCustomer === 'true' || row.isCustomer === '1' || row.isCustomer === 'TRUE',
        isVendor: row.isVendor === 'true' || row.isVendor === '1' || row.isVendor === 'TRUE',
        npwp: row.npwp || row.NPWP || null,
        alamat: row.alamat || row.Alamat || null,
        kontak: row.kontak || row.Kontak || null,
        termPembayaranHari: row.termPembayaranHari ? parseInt(row.termPembayaranHari, 10) : 30,
        creditLimit: row.creditLimit ? parseFloat(row.creditLimit) : null,
        groupCode: row.groupCode || row.Grup || null,
        externalRef: row.externalRef || row.ExternalRef || null,
        isActive: row.isActive === undefined || row.isActive === 'true' || row.isActive === '1',
      }));

      const res = await api.importBusinessPartners(currentTenant.id, formatted);
      setImportResult(res);
      fetchPartners();
    } catch (err: any) {
      alert(`Gagal mengimpor CSV: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Template CSV Download helper
  const handleDownloadTemplate = () => {
    const csvContent =
      'kode,nama,isCustomer,isVendor,npwp,alamat,kontak,termPembayaranHari,creditLimit,groupCode,externalRef\n' +
      'CUST-001,PT Pelanggan Maju,true,false,01.234.567.8-901.000,Jl. Sudirman No 10 Jakarta,08123456789,30,50000000,RETAIL,REF-001\n' +
      'VEND-001,CV Supplier Utama,false,true,02.345.678.9-012.000,Kawasan Industri Cikarang,08219876543,14,0,RAW_MATERIAL,REF-002\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_mitra_bisnis.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered partners list
  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      // Type filter
      if (typeFilter === 'CUSTOMER' && !p.isCustomer) return false;
      if (typeFilter === 'VENDOR' && !p.isVendor) return false;
      if (typeFilter === 'BOTH' && (!p.isCustomer || !p.isVendor)) return false;

      // Status filter
      if (statusFilter === 'ACTIVE' && !p.isActive) return false;
      if (statusFilter === 'INACTIVE' && p.isActive) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKode = p.kode.toLowerCase().includes(q);
        const matchNama = p.nama.toLowerCase().includes(q);
        const matchGroup = p.groupCode ? p.groupCode.toLowerCase().includes(q) : false;
        const matchNpwp = p.npwp ? p.npwp.toLowerCase().includes(q) : false;
        return matchKode || matchNama || matchGroup || matchNpwp;
      }

      return true;
    });
  }, [partners, typeFilter, statusFilter, searchQuery]);

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-400" />
            Mitra Bisnis (Pelanggan & Pemasok)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Daftar master mitra dagang untuk modul AR (Piutang) dan AP (Hutang) di{' '}
            <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-medium text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Upload className="w-4 h-4 text-slate-400" />
            Impor CSV
          </button>
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Tambah Mitra Bisnis
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Type Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 w-full md:w-auto">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              typeFilter === 'ALL' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Semua ({partners.length})
          </button>
          <button
            onClick={() => setTypeFilter('CUSTOMER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              typeFilter === 'CUSTOMER' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pelanggan ({partners.filter((p) => p.isCustomer).length})
          </button>
          <button
            onClick={() => setTypeFilter('VENDOR')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              typeFilter === 'VENDOR' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pemasok ({partners.filter((p) => p.isVendor).length})
          </button>
          <button
            onClick={() => setTypeFilter('BOTH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              typeFilter === 'BOTH' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Keduanya
          </button>
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Aktif Saja</option>
            <option value="INACTIVE">Nonaktif Saja</option>
          </select>

          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode, nama, grup..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <button
            onClick={fetchPartners}
            title="Refresh Data"
            className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-4 font-semibold">Kode</th>
              <th className="py-3.5 px-4 font-semibold">Nama Mitra Bisnis</th>
              <th className="py-3.5 px-4 font-semibold">Peran</th>
              <th className="py-3.5 px-4 font-semibold">Kelompok (Grup)</th>
              <th className="py-3.5 px-4 font-semibold">Term Bayar</th>
              <th className="py-3.5 px-4 font-semibold text-right">Limit Kredit</th>
              <th className="py-3.5 px-4 font-semibold">Status</th>
              <th className="py-3.5 px-4 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                  Memuat data mitra bisnis...
                </td>
              </tr>
            ) : filteredPartners.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                  Tidak ada mitra bisnis yang sesuai dengan kriteria pencarian.
                </td>
              </tr>
            ) : (
              filteredPartners.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-white">{p.kode}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{p.nama}</div>
                    {p.npwp && <div className="text-[11px] text-slate-400 font-mono">NPWP: {p.npwp}</div>}
                    {p.kontak && <div className="text-[11px] text-slate-500">{p.kontak}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.isCustomer && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          Pelanggan
                        </span>
                      )}
                      {p.isVendor && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Pemasok
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    {p.groupCode ? (
                      <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                        {p.groupCode}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-300">
                    {p.termPembayaranHari} Hari
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs">
                    {p.creditLimit !== null && p.creditLimit !== undefined ? (
                      <span className="text-indigo-300 font-semibold">
                        {new Intl.NumberFormat('id-ID', {
                          style: 'currency',
                          currency: p.mata_uang || currentTenant.mata_uang || 'IDR',
                          maximumFractionDigits: 0,
                        }).format(p.creditLimit)}
                      </span>
                    ) : (
                      <span className="text-slate-600">Tanpa Limit</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        p.isActive
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {p.isActive ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Aktif
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" /> Nonaktif
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenEditModal(p)}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit Mitra Bisnis"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletePartner(p)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Hapus / Nonaktifkan Mitra Bisnis"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Tambah / Edit Mitra Bisnis */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                {editingPartner ? 'Edit Mitra Bisnis' : 'Tambah Mitra Bisnis Baru'}
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

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Kode */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Kode Mitra Bisnis *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingPartner}
                    value={formData.kode}
                    onChange={(e) => setFormData({ ...formData, kode: e.target.value })}
                    placeholder="Contoh: CUST-001, VEND-001"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono uppercase focus:border-indigo-500 outline-none disabled:opacity-50"
                  />
                </div>

                {/* Nama */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Mitra Bisnis *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nama}
                    onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                    placeholder="Nama Perusahaan / Pelanggan"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Peran Mitra Bisnis */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs font-semibold text-slate-300">Peran Mitra Bisnis *</div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isCustomer}
                      onChange={(e) => setFormData({ ...formData, isCustomer: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-xs font-medium text-slate-200">Pelanggan (Customer / AR)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isVendor}
                      onChange={(e) => setFormData({ ...formData, isVendor: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 w-4 h-4"
                    />
                    <span className="text-xs font-medium text-slate-200">Pemasok (Vendor / AP)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* NPWP */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    NPWP (Nomor Pokok Wajib Pajak)
                  </label>
                  <input
                    type="text"
                    value={formData.npwp}
                    onChange={(e) => setFormData({ ...formData, npwp: e.target.value })}
                    placeholder="00.000.000.0-000.000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 outline-none"
                  />
                </div>

                {/* Kelompok / Grup */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Kode Kelompok (Group Code)
                  </label>
                  <input
                    type="text"
                    value={formData.groupCode}
                    onChange={(e) => setFormData({ ...formData, groupCode: e.target.value })}
                    placeholder="Contoh: RETAIL, CORPORATE, AFILIASI"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white uppercase focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Term Pembayaran */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Term Bayar (Hari)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.termPembayaranHari}
                    onChange={(e) => setFormData({ ...formData, termPembayaranHari: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 outline-none"
                  />
                </div>

                {/* Limit Kredit */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Limit Kredit
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                    placeholder="Kosongkan jika tanpa limit"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 outline-none"
                  />
                </div>

                {/* Mata Uang */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mata Uang Default
                  </label>
                  <input
                    type="text"
                    value={formData.mata_uang}
                    onChange={(e) => setFormData({ ...formData, mata_uang: e.target.value.toUpperCase() })}
                    placeholder={currentTenant.mata_uang}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono uppercase focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Kontak & External Ref */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Kontak / Telepon / PIC
                  </label>
                  <input
                    type="text"
                    value={formData.kontak}
                    onChange={(e) => setFormData({ ...formData, kontak: e.target.value })}
                    placeholder="Nama PIC, nomor telepon, email"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    External Reference (ERP / CRM Ref)
                  </label>
                  <input
                    type="text"
                    value={formData.externalRef}
                    onChange={(e) => setFormData({ ...formData, externalRef: e.target.value })}
                    placeholder="ID di sistem eksternal jika ada"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Alamat */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Alamat Lengkap
                </label>
                <textarea
                  rows={2}
                  value={formData.alamat}
                  onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                  placeholder="Alamat kantor / gudang pengiriman..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                />
              </div>

              {/* Status Aktif */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="partnerActiveToggle"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <label htmlFor="partnerActiveToggle" className="text-xs font-medium text-slate-300 cursor-pointer">
                  Mitra Bisnis Aktif (Dapat digunakan dalam faktur & pesanan)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
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
                  {submitting ? 'Menyimpan...' : 'Simpan Mitra Bisnis'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impor CSV */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-400" />
                Impor Mitra Bisnis dari File CSV
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template Download Prompt */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-white">Unduh Format Template CSV</div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Gunakan format kolom standar agar seluruh data partner dapat diimpor tanpa kendala.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition-colors border border-indigo-500/30 flex-shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download Template
              </button>
            </div>

            {/* File Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Pilih File CSV (.csv)
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvSelect}
                className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer bg-slate-950 border border-slate-800 rounded-xl p-2"
              />
            </div>

            {/* Preview */}
            {csvPreview.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Pratinjau Data ({csvPreview.length} baris terdeteksi):</span>
                  <span className="text-[11px] text-emerald-400">Siap diimpor</span>
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Kode</th>
                        <th className="py-2 px-3">Nama</th>
                        <th className="py-2 px-3">Peran</th>
                        <th className="py-2 px-3">NPWP</th>
                        <th className="py-2 px-3">Term</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {csvPreview.slice(0, 10).map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-3 font-bold text-white">{row.kode || row.Kode}</td>
                          <td className="py-1.5 px-3 font-sans">{row.nama || row.Nama}</td>
                          <td className="py-1.5 px-3 font-sans text-[10px]">
                            {row.isCustomer === 'true' || row.isCustomer === '1' ? 'Pelanggan ' : ''}
                            {row.isVendor === 'true' || row.isVendor === '1' ? 'Pemasok' : ''}
                          </td>
                          <td className="py-1.5 px-3">{row.npwp || row.NPWP || '-'}</td>
                          <td className="py-1.5 px-3">{row.termPembayaranHari || 30} Hari</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvPreview.length > 10 && (
                  <div className="text-[10px] text-slate-500 italic text-center">
                    Menampilkan 10 baris pertama dari total {csvPreview.length} baris.
                  </div>
                )}
              </div>
            )}

            {/* Result Feedback */}
            {importResult && (
              <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-xl space-y-1 text-xs">
                <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Impor Berhasil Selesai!
                </div>
                <div className="text-emerald-200">
                  Ditambahkan: <strong>{importResult.created}</strong> mitra baru | Diperbarui:{' '}
                  <strong>{importResult.updated}</strong> mitra yang sudah ada
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-amber-300 pt-2 border-t border-emerald-800/40 mt-2">
                    Peringatan/Gagal: {importResult.errors.length} baris memiliki kesalahan data.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={importing || csvPreview.length === 0}
                onClick={handleExecuteImport}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-50"
              >
                {importing ? 'Mengimpor Data...' : `Mulai Impor (${csvPreview.length} Baris)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

