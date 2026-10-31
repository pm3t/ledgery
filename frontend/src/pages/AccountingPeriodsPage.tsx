import React, { useState, useEffect } from 'react';
import { api, Tenant, FiscalYear, AccountingPeriod } from '../services/api';
import { Calendar, Plus, Lock, Unlock, AlertCircle, Loader2, Scale, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
  onNavigate?: (tab: string) => void;
}

export const AccountingPeriodsPage: React.FC<Props> = ({ currentTenant, onNavigate }) => {
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reconciliation Alert / Modal State
  const [reconModal, setReconModal] = useState<{
    isOpen: boolean;
    isBlocked: boolean;
    message: string;
    details?: any;
  } | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [namaTahunBuku, setNamaTahunBuku] = useState('');
  const [tanggalMulai, setTanggalMulai] = useState('');
  const [tanggalSelesai, setTanggalSelesai] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [manualPeriods, setManualPeriods] = useState<{ nomor_periode: number; tanggal_mulai: string; tanggal_selesai: string }[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  const fetchFiscalYears = async () => {
    if (!currentTenant) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFiscalYears();
      setFiscalYears(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar Tahun Buku');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiscalYears();
  }, [currentTenant]);

  const handleAddManualPeriod = () => {
    setManualPeriods([
      ...manualPeriods,
      { nomor_periode: manualPeriods.length + 1, tanggal_mulai: '', tanggal_selesai: '' }
    ]);
  };

  const handleManualPeriodChange = (index: number, field: string, value: string) => {
    const newPeriods = [...manualPeriods];
    newPeriods[index] = { ...newPeriods[index], [field]: value };
    setManualPeriods(newPeriods);
  };

  const handleRemoveManualPeriod = (index: number) => {
    const newPeriods = [...manualPeriods];
    newPeriods.splice(index, 1);
    // re-index
    newPeriods.forEach((p, i) => p.nomor_periode = i + 1);
    setManualPeriods(newPeriods);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;
    
    try {
      setFormLoading(true);
      await api.createFiscalYear({
        nama_tahun_buku: namaTahunBuku,
        tanggal_mulai: new Date(tanggalMulai).toISOString(),
        tanggal_selesai: new Date(tanggalSelesai).toISOString(),
        auto_generate: autoGenerate,
        periods: autoGenerate ? undefined : manualPeriods.map(p => ({
          nomor_periode: p.nomor_periode,
          tanggal_mulai: new Date(p.tanggal_mulai).toISOString(),
          tanggal_selesai: new Date(p.tanggal_selesai).toISOString()
        }))
      });
      
      setIsFormOpen(false);
      setNamaTahunBuku('');
      setTanggalMulai('');
      setTanggalSelesai('');
      setAutoGenerate(true);
      setManualPeriods([]);
      fetchFiscalYears();
    } catch (err: any) {
      alert(err.message || 'Gagal membuat Tahun Buku');
    } finally {
      setFormLoading(false);
    }
  };

  const handleTogglePeriodStatus = async (period: AccountingPeriod) => {
    const actionName = period.status === 'OPEN' ? 'menutup (CLOSE)' : 'membuka kembali (REOPEN)';
    const confirm = window.confirm(`Apakah Anda yakin ingin ${actionName} periode ${period.nomor_periode}?`);
    if (!confirm) return;

    try {
      setLoading(true);
      if (period.status === 'OPEN') {
        const res: any = await api.closePeriod(period.id);
        if (res?.warning) {
          setReconModal({
            isOpen: true,
            isBlocked: false,
            message: res.warning.message || 'Peringatan selisih rekonsiliasi subledger',
            details: res.warning.details,
          });
        }
      } else {
        await api.reopenPeriod(period.id);
      }
      fetchFiscalYears();
    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.includes('selisih rekonsiliasi') || errMsg.includes('PERIOD_CLOSE_BLOCKED_ON_RECONCILIATION')) {
        setReconModal({
          isOpen: true,
          isBlocked: true,
          message: errMsg,
        });
      } else {
        alert(errMsg || `Gagal ${actionName} periode`);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!currentTenant) return <div>Pilih tenant terlebih dahulu</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-400" /> Manajemen Periode
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Kelola Tahun Buku dan status Periode Akuntansi (Tutup Buku Bulanan)
          </p>
        </div>
        <button
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          {isFormOpen ? 'Batal' : <><Plus className="w-4 h-4" /> Tahun Buku Baru</>}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {/* Form Tahun Buku Baru */}
      {isFormOpen && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4">Buat Tahun Buku Baru</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nama Tahun Buku</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: 2026"
                  value={namaTahunBuku}
                  onChange={e => setNamaTahunBuku(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tanggal Mulai</label>
                <input
                  type="date"
                  required
                  value={tanggalMulai}
                  onChange={e => setTanggalMulai(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tanggal Selesai</label>
                <input
                  type="date"
                  required
                  value={tanggalSelesai}
                  onChange={e => setTanggalSelesai(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="autoGenerate"
                checked={autoGenerate}
                onChange={e => setAutoGenerate(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-800"
              />
              <label htmlFor="autoGenerate" className="text-sm font-medium text-slate-300">
                Otomatis buat 12 periode bulanan
              </label>
            </div>

            {!autoGenerate && (
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-semibold text-slate-300">Periode Manual</h4>
                  <button type="button" onClick={handleAddManualPeriod} className="text-xs text-indigo-400 hover:text-indigo-300">
                    + Tambah Periode
                  </button>
                </div>
                {manualPeriods.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-xs text-slate-500 w-6">{p.nomor_periode}.</span>
                    <input type="date" required value={p.tanggal_mulai} onChange={e => handleManualPeriodChange(idx, 'tanggal_mulai', e.target.value)} className="bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-1.5 text-sm" />
                    <span className="text-slate-500">-</span>
                    <input type="date" required value={p.tanggal_selesai} onChange={e => handleManualPeriodChange(idx, 'tanggal_selesai', e.target.value)} className="bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-1.5 text-sm" />
                    <button type="button" onClick={() => handleRemoveManualPeriod(idx)} className="text-rose-400 hover:text-rose-300 ml-2">X</button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={formLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Simpan Tahun Buku
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List Tahun Buku & Periode */}
      {loading && !isFormOpen ? (
        <div className="p-12 flex justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : fiscalYears.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
          <p className="text-slate-500">Belum ada Tahun Buku. Silakan buat Tahun Buku baru.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {fiscalYears.map(fy => (
            <div key={fy.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-slate-950/80 p-4 border-b border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-indigo-300">{fy.nama_tahun_buku}</h3>
                  <p className="text-xs text-slate-400">
                    {new Date(fy.tanggal_mulai).toLocaleDateString('id-ID')} - {new Date(fy.tanggal_selesai).toLocaleDateString('id-ID')}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-950/40 text-slate-400 border-b border-slate-800">
                      <th className="p-4 font-semibold w-24">Periode</th>
                      <th className="p-4 font-semibold">Mulai</th>
                      <th className="p-4 font-semibold">Selesai</th>
                      <th className="p-4 font-semibold">Status</th>
                      <th className="p-4 font-semibold">Log (Closed/Reopened)</th>
                      <th className="p-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {fy.accountingPeriods?.map(p => (
                      <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="p-4 text-slate-300 font-medium">#{p.nomor_periode}</td>
                        <td className="p-4 text-slate-400">{new Date(p.tanggal_mulai).toLocaleDateString('id-ID')}</td>
                        <td className="p-4 text-slate-400">{new Date(p.tanggal_selesai).toLocaleDateString('id-ID')}</td>
                        <td className="p-4">
                          {p.status === 'OPEN' ? (
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">OPEN</span>
                          ) : (
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">CLOSED</span>
                          )}
                        </td>
                        <td className="p-4 text-xs text-slate-500 space-y-1">
                          {p.closedAt && <div>Closed: {new Date(p.closedAt).toLocaleDateString('id-ID')}</div>}
                          {p.reopenedAt && <div>Reopened: {new Date(p.reopenedAt).toLocaleDateString('id-ID')}</div>}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleTogglePeriodStatus(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ml-auto transition-colors ${
                              p.status === 'OPEN'
                                ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                            }`}
                          >
                            {p.status === 'OPEN' ? <><Lock className="w-3.5 h-3.5" /> Tutup</> : <><Unlock className="w-3.5 h-3.5" /> Buka</>}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!fy.accountingPeriods || fy.accountingPeriods.length === 0) && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-500">Tidak ada periode</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reconciliation Alert / Blocking Modal */}
      {reconModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <button
              onClick={() => setReconModal(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-start space-x-3">
              <div
                className={`rounded-xl p-2.5 ${
                  reconModal.isBlocked
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {reconModal.isBlocked ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <Scale className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">
                  {reconModal.isBlocked
                    ? 'Penutupan Periode Ditolak (Ada Selisih)'
                    : 'Peringatan Rekonsiliasi Sub Ledger'}
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  {reconModal.message}
                </p>

                {reconModal.details && (
                  <div className="mt-3 rounded-lg bg-slate-800/80 p-3 text-xs border border-slate-700 space-y-1 text-slate-300">
                    <div>
                      Total Selisih:{' '}
                      <span className="font-mono font-bold text-rose-400">
                        Rp {reconModal.details.totalSelisihAbsolut?.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-end space-x-3">
                  <button
                    onClick={() => setReconModal(null)}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    Tutup
                  </button>
                  {onNavigate && (
                    <button
                      onClick={() => {
                        setReconModal(null);
                        onNavigate('subledger-reconciliation');
                      }}
                      className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      <Scale className="h-3.5 w-3.5" />
                      <span>Buka Rekonsiliasi Sub Ledger</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
