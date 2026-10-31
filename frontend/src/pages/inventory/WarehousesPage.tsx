import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Download,
  Upload,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { api, Tenant, Warehouse } from '../../services/api';

interface WarehousesPageProps {
  currentTenant: Tenant | null;
}

export const WarehousesPage: React.FC<WarehousesPageProps> = ({ currentTenant }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    kode: '',
    nama: '',
    alamat: '',
    isActive: true,
  });

  // CSV Import State
  const [csvContent, setCsvContent] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const fetchData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getWarehouses(currentTenant.id);
      setWarehouses(data || []);
    } catch (err) {
      console.error('Gagal mengambil data gudang:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant]);

  const handleOpenCreateModal = () => {
    setEditingWh(null);
    setFormData({
      kode: '',
      nama: '',
      alamat: '',
      isActive: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (wh: Warehouse) => {
    setEditingWh(wh);
    setFormData({
      kode: wh.kode,
      nama: wh.nama,
      alamat: wh.alamat || '',
      isActive: wh.isActive,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!formData.kode.trim() || !formData.nama.trim()) {
      setFormError('Kode dan Nama Gudang wajib diisi.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (editingWh) {
        await api.updateWarehouse(currentTenant.id, editingWh.id, {
          nama: formData.nama,
          alamat: formData.alamat || undefined,
          isActive: formData.isActive,
        });
      } else {
        await api.createWarehouse(currentTenant.id, {
          kode: formData.kode,
          nama: formData.nama,
          alamat: formData.alamat || undefined,
          isActive: formData.isActive,
        });
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan gudang.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, nama: string) => {
    if (!currentTenant) return;
    if (confirm(`Yakin ingin menonaktifkan / menghapus gudang "${nama}"?`)) {
      try {
        await api.deleteWarehouse(currentTenant.id, id);
        fetchData();
      } catch (err: any) {
        alert(err.message || 'Gagal menghapus gudang');
      }
    }
  };

  const handleDownloadTemplate = () => {
    const csv = 'kode,nama,alamat\nGD-01,Gudang Utama Jakarta,Jl. Daan Mogot No. 12 Jakarta Barat\nGD-02,Gudang Transit Surabaya,Kawasan Industri Rungkut Surabaya';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'template_master_gudang.csv');
  };

  const handleExecuteImport = async () => {
    if (!currentTenant || !csvContent.trim()) return;
    setImportLoading(true);
    setImportResult(null);

    try {
      const lines = csvContent.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length <= 1) {
        alert('File CSV harus memiliki header dan minimal 1 baris data.');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const idxKode = headers.indexOf('kode');
      const idxNama = headers.indexOf('nama');
      const idxAlamat = headers.indexOf('alamat');

      const warehousesToImport = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (cols[idxKode] && cols[idxNama]) {
          warehousesToImport.push({
            kode: cols[idxKode],
            nama: cols[idxNama],
            alamat: idxAlamat >= 0 ? cols[idxAlamat] : undefined,
          });
        }
      }

      const res = await api.importWarehouses(currentTenant.id, { warehouses: warehousesToImport });
      setImportResult(res);
      fetchData();
    } catch (err: any) {
      alert(`Gagal mengimpor: ${err.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const filteredWarehouses = warehouses.filter((wh) => {
    return (
      wh.kode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wh.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wh.alamat && wh.alamat.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-600" />
            Master Gudang (Warehouses)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Daftar lokasi gudang penyimpanan fisik barang untuk mutasi keluar, masuk, dan transfer persediaan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCsvContent('');
              setImportResult(null);
              setIsImportOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm transition-colors border border-slate-200"
          >
            <Upload className="w-4 h-4" />
            Impor CSV
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Tambah Gudang
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kode, nama gudang, atau alamat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Tabel Gudang */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                <th className="py-3 px-4">Kode Gudang</th>
                <th className="py-3 px-4">Nama Gudang</th>
                <th className="py-3 px-4">Alamat / Lokasi</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Memuat data gudang...
                  </td>
                </tr>
              ) : filteredWarehouses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Belum ada gudang terdaftar.
                  </td>
                </tr>
              ) : (
                filteredWarehouses.map((wh) => (
                  <tr key={wh.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {wh.kode}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {wh.nama}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {wh.alamat || '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {wh.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(wh)}
                          title="Edit Gudang"
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(wh.id, wh.nama)}
                          title="Hapus / Nonaktifkan"
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
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
      </div>

      {/* Modal Create / Edit Gudang */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                {editingWh ? 'Edit Data Gudang' : 'Tambah Gudang Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Gudang <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.kode}
                  onChange={(e) => setFormData({ ...formData, kode: e.target.value.toUpperCase() })}
                  disabled={!!editingWh}
                  placeholder="Contoh: GD-UTAMA"
                  required
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Gudang <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  placeholder="Nama gudang penyimpanan..."
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat / Lokasi Gudang
                </label>
                <textarea
                  rows={3}
                  value={formData.alamat}
                  onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                  placeholder="Alamat lengkap lokasi gudang..."
                  className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveWh"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="isActiveWh" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Gudang Aktif
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 rounded-lg shadow-sm"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Gudang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impor CSV Gudang */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                Impor Gudang via CSV
              </h3>
              <button
                onClick={() => setIsImportOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Format: kode, nama, alamat</span>
              <button
                onClick={handleDownloadTemplate}
                className="text-emerald-600 hover:underline flex items-center gap-1 font-semibold"
              >
                <Download className="w-3.5 h-3.5" /> Unduh Template CSV
              </button>
            </div>

            <textarea
              rows={6}
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="kode,nama,alamat&#10;GD-01,Gudang Utama,Jl. Daan Mogot No. 12"
              className="w-full p-3 font-mono text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            {importResult && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div className="font-semibold text-slate-700">Hasil Impor:</div>
                <div className="text-emerald-600">Berhasil: {importResult.berhasil} gudang</div>
                {importResult.gagal > 0 && (
                  <div className="text-rose-600 mt-1">
                    Gagal: {importResult.gagal} gudang
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      {importResult.errors.map((err: any, idx: number) => (
                        <li key={idx}>Baris {err.baris} ({err.kode}): {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsImportOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Tutup
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={importLoading || !csvContent.trim()}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 rounded-lg shadow-sm"
              >
                {importLoading ? 'Memproses...' : 'Proses Impor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

