import React, { useState, useEffect } from 'react';
import {
  Settings,
  Zap,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { api, PostingPolicySetting, Tenant } from '../services/api';
import { ApiKeysPage } from './ApiKeysPage';
import { ExchangeRateTab } from '../components/settings/ExchangeRateTab';
import { SubledgerSettingsTab } from '../components/settings/SubledgerSettingsTab';

interface SettingsPageProps {
  currentTenant: Tenant | null;
}

const PostingPolicyTab: React.FC<SettingsPageProps> = ({ currentTenant }) => {
  const [policy, setPolicy] = useState<PostingPolicySetting | null>(null);
  const [selectedMode, setSelectedMode] = useState<'AUTO_POST' | 'APPROVAL_MANUAL'>('AUTO_POST');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPolicy = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getPostingPolicy(currentTenant.id);
      setPolicy(data);
      setSelectedMode(data.mode);
    } catch (err) {
      console.error('Gagal mengambil kebijakan posting:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicy();
  }, [currentTenant]);

  const handleSave = async () => {
    if (!currentTenant) return;
    setSaving(true);
    setSuccessMessage(null);
    try {
      const updated = await api.updatePostingPolicy(currentTenant.id, selectedMode, 'Tenant Admin Dashboard');
      setPolicy(updated);
      setSuccessMessage('Kebijakan posting jurnal berhasil diperbarui!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(`Gagal memperbarui kebijakan posting: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header Halaman */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-7 h-7 text-indigo-400" />
          Pengaturan Kebijakan Posting Jurnal
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Konfigurasi alur penerimaan jurnal dari API eksternal untuk <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>.
        </p>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800/60 rounded-2xl text-emerald-300 text-sm flex items-center gap-3 animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Memuat pengaturan...</div>
      ) : (
        <div className="space-y-6">
          {/* Radio Card Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* OPSI 1: AUTO_POST */}
            <div
              onClick={() => setSelectedMode('AUTO_POST')}
              className={`cursor-pointer rounded-2xl p-5 border transition-all relative flex flex-col justify-between ${
                selectedMode === 'AUTO_POST'
                  ? 'bg-indigo-950/40 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">Auto-Post</h3>
                      <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Kecepatan & Otomatisasi</span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="postingMode"
                    value="AUTO_POST"
                    checked={selectedMode === 'AUTO_POST'}
                    onChange={() => setSelectedMode('AUTO_POST')}
                    className="w-4 h-4 text-indigo-600 border-slate-700 bg-slate-950 focus:ring-indigo-500"
                  />
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Jurnal yang dikirim via API (dari Rekan, DigiSale, Cultiva, dll) <strong>langsung ter-posting otomatis</strong> ke buku besar tenant tanpa perlu review manual.
                </p>

                <div className="mt-4 p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 text-[11px] space-y-1 text-slate-400">
                  <span className="font-semibold text-amber-300 block">Konsekuensi Opsi:</span>
                  <p>• Status jurnal langsung <code className="text-emerald-400">POSTED</code> saat API merespons.</p>
                  <p>• Laporan keuangan (Neraca & Laba Rugi) langsung ter-update seketika.</p>
                  <p>• Cocok untuk transaksi berulang dengan validasi balance yang sudah matang.</p>
                </div>
              </div>
            </div>

            {/* OPSI 2: APPROVAL_MANUAL */}
            <div
              onClick={() => setSelectedMode('APPROVAL_MANUAL')}
              className={`cursor-pointer rounded-2xl p-5 border transition-all relative flex flex-col justify-between ${
                selectedMode === 'APPROVAL_MANUAL'
                  ? 'bg-indigo-950/40 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">Approval Manual</h3>
                      <span className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">Kontrol & Review</span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="postingMode"
                    value="APPROVAL_MANUAL"
                    checked={selectedMode === 'APPROVAL_MANUAL'}
                    onChange={() => setSelectedMode('APPROVAL_MANUAL')}
                    className="w-4 h-4 text-indigo-600 border-slate-700 bg-slate-950 focus:ring-indigo-500"
                  />
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Jurnal yang masuk via API ditampung terlebih dahulu dalam status <strong className="text-amber-400">PENDING</strong>, menunggu staf akuntansi menyetujui (Approve) di dashboard.
                </p>

                <div className="mt-4 p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 text-[11px] space-y-1 text-slate-400">
                  <span className="font-semibold text-violet-300 block">Konsekuensi Opsi:</span>
                  <p>• Staf akuntansi dapat memeriksa kode akun & nominal sebelum ter-posting final.</p>
                  <p>• Riwayat approval (siapa, kapan, alasan reject) tersimpan dalam audit trail.</p>
                  <p>• Memberikan lapisan keamanan ekstra dari salah input transaksi.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Card Informasi Perubahan */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-400 space-y-1">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <Clock className="w-4 h-4 text-indigo-400" />
                Status Kebijakan Terakhir:
              </div>
              <p>
                Mode Aktif saat ini:{' '}
                <span className="font-bold text-white">
                  {policy?.mode === 'AUTO_POST' ? '⚡ Auto-Post' : '🛡️ Approval Manual'}
                </span>{' '}
                (Terakhir diubah oleh <span className="text-indigo-300">{policy?.updatedBy || 'System'}</span>)
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || selectedMode === policy?.mode}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {saving ? 'Memproses...' : 'Simpan Perubahan Kebijakan'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ currentTenant }) => {
  const [activeTab, setActiveTab] = useState<'api-keys' | 'posting-policy' | 'exchange-rate' | 'subledger'>('api-keys');

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'api-keys'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'
            }`}
          >
            API Key Management
          </button>
          <button
            onClick={() => setActiveTab('posting-policy')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'posting-policy'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'
            }`}
          >
            Kebijakan Posting
          </button>
          <button
            onClick={() => setActiveTab('exchange-rate')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'exchange-rate'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'
            }`}
          >
            Kurs Mata Uang
          </button>
          <button
            onClick={() => setActiveTab('subledger')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'subledger'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'
            }`}
          >
            Sub Ledger
          </button>
        </nav>
      </div>

      <div className="pt-4">
        {activeTab === 'api-keys' && <ApiKeysPage currentTenant={currentTenant} />}
        {activeTab === 'posting-policy' && <PostingPolicyTab currentTenant={currentTenant} />}
        {activeTab === 'exchange-rate' && <ExchangeRateTab currentTenant={currentTenant} />}
        {activeTab === 'subledger' && <SubledgerSettingsTab currentTenant={currentTenant} />}
      </div>
    </div>
  );
};
