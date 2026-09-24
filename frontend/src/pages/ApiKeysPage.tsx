import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Ban,
  AlertTriangle,
  Clock,
  ShieldAlert,
  X,
} from 'lucide-react';
import { api, ApiKeyItem, Tenant } from '../services/api';

interface ApiKeysPageProps {
  currentTenant: Tenant | null;
}

export const ApiKeysPage: React.FC<ApiKeysPageProps> = ({ currentTenant }) => {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // State Modal Generate
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [namaLabel, setNamaLabel] = useState<string>('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchApiKeys = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getApiKeysByTenant(currentTenant.id);
      setApiKeys(data);
    } catch (err) {
      console.error('Gagal mengambil daftar API Key:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, [currentTenant]);

  const handleOpenGenerateModal = () => {
    setNamaLabel('');
    setGeneratedKey(null);
    setCopied(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;

    if (!namaLabel.trim()) {
      setFormError('Nama label aplikasi sumber wajib diisi');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const res = await api.generateApiKey({
        tenantId: currentTenant.id,
        nama_label: namaLabel.trim(),
      });
      setGeneratedKey(res.rawApiKey);
      fetchApiKeys();
    } catch (err: any) {
      setFormError(err.message || 'Gagal membuat API Key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string, label: string) => {
    if (!confirm(`Apakah Anda yakin ingin menonaktifkan (revoke) API Key "${label}"? Integrasi aplikasi sumber terkait akan langsung terputus!`)) {
      return;
    }
    try {
      await api.revokeApiKey(id);
      fetchApiKeys();
    } catch (err: any) {
      alert(`Gagal menarik API Key: ${err.message}`);
    }
  };

  const handleCopyKey = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <KeyRound className="w-7 h-7 text-indigo-400" />
            Manajemen API Key Tenant
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Kredensial integrasi untuk menerima jurnal otomatis dari produk ABP (Rekan, DigiSale, Cultiva) & aplikasi pihak ketiga.
          </p>
        </div>
        <button
          onClick={handleOpenGenerateModal}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Generate Key Baru
        </button>
      </div>

      {/* Info Card Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3 backdrop-blur-sm">
        <ShieldAlert className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-white">Prinsip Keamanan API Key Ledgery:</p>
          <p>
            Setiap aplikasi sumber mengirim payload jurnal via header <code className="bg-slate-950 px-1.5 py-0.5 rounded text-indigo-300 font-mono">X-API-Key</code>.
            Plaintext API Key hanya ditampilkan <strong>SEKALI</strong> saat proses generate dan disimpan secara aman dalam bentuk <code>SHA-256 Hash</code>.
          </p>
        </div>
      </div>

      {/* Tabel API Key Aktif & Revoked */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Memuat daftar API Key...</div>
        ) : apiKeys.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Belum ada API Key yang dibuat untuk tenant ini. Klik "Generate Key Baru" untuk membuat kredensial integrasi pertama.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Nama Label Aplikasi</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold">Terakhir Digunakan</th>
                  <th className="py-3.5 px-4 font-semibold">Dibuat Pada</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {apiKeys.map((key) => (
                  <tr key={key.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                        {key.nama_label}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {key.isActive ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          Ditarik (Revoked)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {key.lastUsedAt ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {new Date(key.lastUsedAt).toLocaleString('id-ID')}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">Belum Pernah</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {new Date(key.createdAt).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {key.isActive ? (
                        <button
                          onClick={() => handleRevoke(key.id, key.nama_label)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" /> Revoke Key
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600 italic">Non-Aktif</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog Generate API Key Baru */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Generate API Key Baru</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/50 rounded-xl text-xs text-rose-300">
                {formError}
              </div>
            )}

            {!generatedKey ? (
              /* Step 1: Input Nama Label Aplikasi */
              <form onSubmit={handleGenerate} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Label Aplikasi Sumber <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Rekan (Payroll), DigiSale (POS), Servio"
                    value={namaLabel}
                    onChange={(e) => setNamaLabel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  <p className="text-slate-400 text-[11px] mt-1">
                    Nama ini akan muncul pada audit log sebagai identitas sumber pengirim jurnal.
                  </p>
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
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                  >
                    {submitting ? 'Generating...' : 'Buat API Key'}
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2: Tampilkan Plaintext API Key Sekali Saja */
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-amber-950/60 border border-amber-800/60 rounded-xl text-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-300 text-sm">Simpan API Key Ini Sekarang!</p>
                    <p className="mt-0.5 text-[11px] text-amber-200/90">
                      Kredensial ini HANYA ditampilkan SEKALI. Jika Anda menutup modal ini, Anda tidak dapat melihat kunci plaintext ini lagi.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Plaintext API Key:</label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-2.5 rounded-xl font-mono text-xs text-indigo-300 break-all select-all">
                    <span>{generatedKey}</span>
                  </div>
                </div>

                <button
                  onClick={handleCopyKey}
                  className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                    copied
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" /> API Key Tersalin ke Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Salin API Key
                    </>
                  )}
                </button>

                <div className="pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                  >
                    Saya Sudah Menyimpannya (Tutup)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
