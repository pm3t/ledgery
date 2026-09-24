import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Building,
  KeyRound,
  FolderTree,
  ShieldCheck,
  Calendar,
  X,
  AlertCircle,
} from 'lucide-react';
import { api, Tenant } from '../services/api';

interface TenantsPageProps {
  tenants: Tenant[];
  onRefreshTenants: () => void;
  onSelectTenant: (tenant: Tenant) => void;
}

export const TenantsPage: React.FC<TenantsPageProps> = ({
  tenants,
  onRefreshTenants,
  onSelectTenant,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [namaPerusahaan, setNamaPerusahaan] = useState<string>('');
  const [tahunBuku, setTahunBuku] = useState<number>(2026);
  const [mataUang, setMataUang] = useState<string>('IDR');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaPerusahaan.trim()) {
      setFormError('Nama perusahaan tidak boleh kosong');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const newTenant = await api.createTenant({
        nama_perusahaan: namaPerusahaan.trim(),
        tahun_buku_mulai: tahunBuku,
        mata_uang: mataUang,
      });
      setIsModalOpen(false);
      onRefreshTenants();
      onSelectTenant(newTenant);
    } catch (err: any) {
      setFormError(err.message || 'Gagal merilis tenant baru');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-7 h-7 text-violet-400" />
            Manajemen Tenant (Super Admin ABP)
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Kelola pendaftaran entitas bisnis baru, status langganan, dan pemantauan statistik integrasi SaaS Ledgery.
          </p>
        </div>
        <button
          onClick={() => {
            setNamaPerusahaan('');
            setTahunBuku(2026);
            setMataUang('IDR');
            setFormError(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-violet-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Onboard Tenant Baru
        </button>
      </div>

      {/* Grid Kartu Tenant */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tenants.map((t) => (
          <div
            key={t.id}
            className="bg-slate-900/70 border border-slate-800 hover:border-violet-500/50 rounded-2xl p-5 transition-all shadow-lg flex flex-col justify-between space-y-4 group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
                  <Building className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {t.status_langganan}
                </span>
              </div>

              <h3 className="font-bold text-lg text-white group-hover:text-violet-300 transition-colors">
                {t.nama_perusahaan}
              </h3>
              <p className="text-xs font-mono text-slate-500 truncate mt-0.5">ID: {t.id}</p>

              <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Statistik COA</span>
                  <span className="font-bold text-slate-200 text-sm flex items-center gap-1.5 mt-0.5">
                    <FolderTree className="w-4 h-4 text-indigo-400" />
                    {t._count?.chartOfAccounts ?? 0} Akun
                  </span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">API Key Integrasi</span>
                  <span className="font-bold text-slate-200 text-sm flex items-center gap-1.5 mt-0.5">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    {t._count?.apiKeys ?? 0} Active Keys
                  </span>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-400 flex items-center justify-between px-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" /> Tahun Buku: {t.tahun_buku_mulai}
                </span>
                <span className="font-medium text-slate-300">Valuta: {t.mata_uang}</span>
              </div>
            </div>

            <button
              onClick={() => onSelectTenant(t)}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-violet-600 hover:text-white text-slate-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" /> Kelola Pembukuan Tenant Ini
            </button>
          </div>
        ))}
      </div>

      {/* Modal Dialog Onboard Tenant Baru */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Onboard Tenant Baru</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Nama Perusahaan / UMKM <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT. Sumber Makmur Abadi"
                  value={namaPerusahaan}
                  onChange={(e) => setNamaPerusahaan(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-violet-500 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Tahun Buku Mulai</label>
                  <input
                    type="number"
                    value={tahunBuku}
                    onChange={(e) => setTahunBuku(parseInt(e.target.value) || 2026)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:ring-2 focus:ring-violet-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Mata Uang Pelaporan</label>
                  <input
                    type="text"
                    value={mataUang}
                    onChange={(e) => setMataUang(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:ring-2 focus:ring-violet-500 uppercase font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-600/30 disabled:opacity-50"
                >
                  {submitting ? 'Membuat Tenant...' : 'Daftarkan Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
