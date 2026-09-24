import React, { useState, useEffect } from 'react';
import { api, Tenant, ChartOfAccount, Dimension, Currency } from '../services/api';
import { Plus, Trash2, Save, AlertCircle } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
}

export const ManualJournalPage: React.FC<Props> = ({ currentTenant }) => {
  const [coas, setCoas] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [deskripsi, setDeskripsi] = useState('');
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [selectedCurrencyIso, setSelectedCurrencyIso] = useState<string>('');
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [entries, setEntries] = useState<{ kode_akun: string; tipe: 'DEBIT' | 'KREDIT'; jumlah: number; dimValueId: string }[]>([
    { kode_akun: '', tipe: 'DEBIT', jumlah: 0, dimValueId: '' },
    { kode_akun: '', tipe: 'KREDIT', jumlah: 0, dimValueId: '' },
  ]);

  useEffect(() => {
    if (currentTenant) {
      api.getCoaByTenant(currentTenant.id)
        .then((res) => setCoas(res.filter(c => c.isActive)))
        .catch(() => setError('Gagal memuat Chart of Accounts'));
      api.getDimensions()
        .then((res) => setDimensions(res))
        .catch(() => console.error('Gagal memuat Dimensi'));
      api.getCurrencies()
        .then((res) => setCurrencies(res))
        .catch(() => console.error('Gagal memuat mata uang'));
      
      setSelectedCurrencyIso(currentTenant.mata_uang);
    }
  }, [currentTenant]);

  const totalDebit = entries.filter((e) => e.tipe === 'DEBIT').reduce((acc, curr) => acc + (Number(curr.jumlah) || 0), 0);
  const totalKredit = entries.filter((e) => e.tipe === 'KREDIT').reduce((acc, curr) => acc + (Number(curr.jumlah) || 0), 0);
  const isBalanced = totalDebit === totalKredit && totalDebit > 0;
  const isFormValid = isBalanced && deskripsi && tanggal && entries.every(e => e.kode_akun !== '');

  const handleAddRow = () => {
    setEntries([...entries, { kode_akun: '', tipe: 'DEBIT', jumlah: 0, dimValueId: '' }]);
  };

  const handleRemoveRow = (index: number) => {
    if (entries.length > 2) {
      setEntries(entries.filter((_, i) => i !== index));
    }
  };

  const handleRowChange = (index: number, field: string, value: any) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    setEntries(newEntries);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;
    if (!isBalanced) return;

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      const payload = {
        tenantId: currentTenant.id,
        tanggal: new Date(tanggal).toISOString(),
        deskripsi,
        sumber_aplikasi: 'Dashboard Manual',
        mata_uang: selectedCurrencyIso,
        entries: entries.map(e => {
          let dims = undefined;
          if (e.dimValueId) {
            for (const d of dimensions) {
              const val = d.values.find(v => v.id === e.dimValueId);
              if (val) {
                dims = [{ nama_dimension: d.nama_dimension, kode_value: val.kode }];
                break;
              }
            }
          }
          return {
            kode_akun: e.kode_akun,
            tipe: e.tipe,
            jumlah: Number(e.jumlah),
            dimensions: dims
          };
        })
      };

      await api.createManualJournal(payload);
      setSuccess('Jurnal berhasil disimpan!');
      
      // Reset form
      setDeskripsi('');
      setEntries([
        { kode_akun: '', tipe: 'DEBIT', jumlah: 0, dimValueId: '' },
        { kode_akun: '', tipe: 'KREDIT', jumlah: 0, dimValueId: '' },
      ]);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat menyimpan jurnal');
    } finally {
      setLoading(false);
    }
  };

  if (!currentTenant) return <div>Pilih tenant terlebih dahulu</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Input Jurnal Manual</h2>
        <p className="text-slate-400 text-sm mt-1">Buat entri jurnal baru secara langsung</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> {error}
          </div>
        )}
        
        {success && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Tanggal Transaksi</label>
              <input
                type="date"
                required
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Mata Uang Jurnal</label>
              <select
                required
                value={selectedCurrencyIso}
                onChange={(e) => setSelectedCurrencyIso(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2"
              >
                <option value="" disabled>-- Pilih Mata Uang --</option>
                {currencies.map(c => (
                  <option key={c.id} value={c.kode_iso}>
                    {c.kode_iso} - {c.nama} {c.kode_iso === currentTenant.mata_uang ? '(Base)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Deskripsi / Keterangan</label>
              <input
                type="text"
                required
                placeholder="Misal: Pembayaran sewa kantor"
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Baris Jurnal</h3>
              <button
                type="button"
                onClick={handleAddRow}
                className="text-xs flex items-center gap-1 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> Tambah Baris
              </button>
            </div>

            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div key={index} className="flex items-center gap-3 bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                  <div className="flex-1">
                    <select
                      required
                      value={entry.kode_akun}
                      onChange={(e) => handleRowChange(index, 'kode_akun', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                    >
                      <option value="" disabled>-- Pilih Akun --</option>
                      {coas.map(c => (
                        <option key={c.id} value={c.kode_akun}>{c.kode_akun} - {c.nama_akun}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="w-32">
                    <select
                      value={entry.tipe}
                      onChange={(e) => handleRowChange(index, 'tipe', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                    >
                      <option value="DEBIT">DEBIT</option>
                      <option value="KREDIT">KREDIT</option>
                    </select>
                  </div>
                  
                  <div className="w-48">
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder={`Jumlah (${selectedCurrencyIso})`}
                      value={entry.jumlah || ''}
                      onChange={(e) => handleRowChange(index, 'jumlah', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                    />
                  </div>
                  
                  <div className="w-48">
                    <select
                      value={entry.dimValueId}
                      onChange={(e) => handleRowChange(index, 'dimValueId', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                    >
                      <option value="">-- Dimensi --</option>
                      {dimensions.map(d => (
                        <optgroup key={d.id} label={d.nama_dimension}>
                          {d.values.map(v => (
                            <option key={v.id} value={v.id}>{v.kode} - {v.nama}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveRow(index)}
                    disabled={entries.length <= 2}
                    className="p-2 text-slate-500 hover:text-rose-400 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-between items-center bg-slate-950/30 p-4 rounded-xl">
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-slate-400 font-medium">Total Debit</p>
                <p className={`text-lg font-bold ${totalDebit === totalKredit && totalDebit > 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  Rp {totalDebit.toLocaleString('id-ID')}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Total Kredit</p>
                <p className={`text-lg font-bold ${totalDebit === totalKredit && totalKredit > 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  Rp {totalKredit.toLocaleString('id-ID')}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Selisih</p>
                <p className={`text-lg font-bold ${isBalanced ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Rp {Math.abs(totalDebit - totalKredit).toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
            >
              {loading ? <span className="animate-spin">⏳</span> : <Save className="w-5 h-5" />}
              Simpan Jurnal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
