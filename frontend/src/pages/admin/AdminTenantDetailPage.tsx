import React, { useState, useEffect } from 'react';
import { api, Tenant, ConnectedApp } from '../../services/api';
import { ShieldCheck, ChevronLeft, ArrowRight, Eye, Database, Activity } from 'lucide-react';

interface Props {
  tenant: Tenant;
  onBack: () => void;
}

export function AdminTenantDetailPage({ tenant, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<'profil' | 'apps'>('profil');
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'apps') {
      fetchApps();
    }
  }, [activeTab]);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const data = await api.adminGetConnectedApps(tenant.id);
      setApps(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAuditAccess = async () => {
    // Simulasi Super Admin melihat data rahasia
    const reason = prompt('Peringatan Audit Privasi: Harap masukkan alasan Anda melihat data detail jurnal tenant ini.');
    if (!reason) return;

    try {
      await api.adminLogAccess('VIEW_TENANT_JOURNALS', tenant.id, reason);
      alert('Akses diizinkan. Log audit telah dicatat.');
      // Di sini bisa kita buka data jurnal (misal diarahkan ke Ledger view tenant ini)
    } catch (e: any) {
      alert(`Gagal mencatat audit: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Kembali ke Daftar
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Profil: {tenant.nama_perusahaan}
          </h1>
          <p className="text-sm text-slate-400 mt-1 font-mono">ID: {tenant.id}</p>
        </div>
        <button
          onClick={handleAuditAccess}
          className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          Lihat Data Transaksi (Audit Log)
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-slate-800 mt-6">
        <button
          onClick={() => setActiveTab('profil')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'profil' 
              ? 'border-rose-500 text-rose-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Profil Database
        </button>
        <button
          onClick={() => setActiveTab('apps')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'apps' 
              ? 'border-rose-500 text-rose-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Monitoring Aplikasi Terhubung
        </button>
      </div>

      {activeTab === 'profil' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 grid grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Informasi Dasar</h3>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">Status Langganan</div>
                <div className="text-sm text-white font-medium">{tenant.status_langganan}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Mata Uang & Tahun Buku</div>
                <div className="text-sm text-white font-medium">{tenant.mata_uang} / {tenant.tahun_buku_mulai}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Tanggal Bergabung</div>
                <div className="text-sm text-white font-medium">{new Date(tenant.createdAt).toLocaleString('id-ID')}</div>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Informasi Tagihan</h3>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">Status Pembayaran</div>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  tenant.billingStatus === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 
                  tenant.billingStatus === 'OVERDUE' ? 'bg-rose-500/20 text-rose-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {tenant.billingStatus || 'UNPAID'}
                </span>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Jatuh Tempo Langganan</div>
                <div className="text-sm text-white font-medium">
                  {tenant.billingDueDate ? new Date(tenant.billingDueDate).toLocaleDateString('id-ID') : 'Belum ditentukan'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'apps' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 font-medium">Aplikasi Sumber (API)</th>
                <th className="px-6 py-4 font-medium text-right">Jumlah Jurnal Terkirim</th>
                <th className="px-6 py-4 font-medium text-right">Terakhir Sinkronisasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr><td colSpan={3} className="p-6 text-center text-slate-500">Memuat metadata jurnal...</td></tr>
              ) : apps.length === 0 ? (
                <tr><td colSpan={3} className="p-6 text-center text-slate-500">Belum ada integrasi aplikasi / belum ada jurnal masuk.</td></tr>
              ) : (
                apps.map((app, i) => (
                  <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-sky-400">{app.namaAplikasi}</td>
                    <td className="px-6 py-4 text-right font-mono text-slate-300">{app.jumlahJurnal}</td>
                    <td className="px-6 py-4 text-right text-xs text-slate-500">
                      {new Date(app.terakhirKirim).toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
