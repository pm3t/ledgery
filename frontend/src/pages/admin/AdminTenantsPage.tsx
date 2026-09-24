import React, { useEffect, useState } from 'react';
import { api, Tenant } from '../../services/api';
import { Building2, Plus, ArrowRight, ShieldAlert } from 'lucide-react';

export function AdminTenantsPage({ onSelectTenant }: { onSelectTenant: (tenant: Tenant) => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);

  // Onboarding Form
  const [showForm, setShowForm] = useState(false);
  const [namaPerusahaan, setNamaPerusahaan] = useState('');
  const [tahunBuku, setTahunBuku] = useState(2026);
  const [mataUang, setMataUang] = useState('IDR');
  const [loadingOnboard, setLoadingOnboard] = useState(false);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const data = await api.adminGetTenants();
      setTenants(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingOnboard(true);
    try {
      await api.adminOnboardTenant({
        nama_perusahaan: namaPerusahaan,
        tahun_buku_mulai: tahunBuku,
        mata_uang: mataUang
      });
      alert('Tenant berhasil dionboard dengan template COA bawaan!');
      setShowForm(false);
      fetchTenants();
    } catch (e: any) {
      alert(`Gagal: ${e.message}`);
    } finally {
      setLoadingOnboard(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-rose-400" />
            Daftar Tenant Terdaftar
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Kelola dan pantau seluruh pelanggan SaaS Ledgery dari satu tempat.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Onboard Tenant Baru
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Form Onboarding</h2>
          <form onSubmit={handleOnboard} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Nama Perusahaan / Bisnis</label>
              <input
                required
                value={namaPerusahaan}
                onChange={e => setNamaPerusahaan(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-rose-500 outline-none"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-400 mb-1">Tahun Buku</label>
                <input
                  type="number"
                  required
                  value={tahunBuku}
                  onChange={e => setTahunBuku(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-rose-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-400 mb-1">Mata Uang</label>
                <select
                  value={mataUang}
                  onChange={e => setMataUang(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-rose-500 outline-none"
                >
                  <option value="IDR">IDR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loadingOnboard}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-medium"
              >
                {loadingOnboard ? 'Memproses...' : 'Simpan & Buat Database'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-medium">Tenant ID & Nama</th>
              <th className="px-6 py-4 font-medium">Status Akun</th>
              <th className="px-6 py-4 font-medium">Tahun Buku</th>
              <th className="px-6 py-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500">Memuat...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500">Belum ada tenant</td></tr>
            ) : (
              tenants.map(t => (
                <tr key={t.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{t.nama_perusahaan}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{t.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      t.status_langganan === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      t.status_langganan === 'TRIAL' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                    }`}>
                      {t.status_langganan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    {t.tahun_buku_mulai} ({t.mata_uang})
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onSelectTenant(t)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors border border-rose-500/20"
                    >
                      Buka Profil <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
