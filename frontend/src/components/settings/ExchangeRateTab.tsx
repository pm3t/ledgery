import React, { useState, useEffect } from 'react';
import { api, Tenant, Currency, ExchangeRate } from '../../services/api';
import { Loader2, Plus, Save, Banknote, History } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
}

export const ExchangeRateTab: React.FC<Props> = ({ currentTenant }) => {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [selectedCurrencyId, setSelectedCurrencyId] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [kurs, setKurs] = useState<number | ''>('');

  // New Currency State
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [newCurrencyName, setNewCurrencyName] = useState('');
  const [savingCurrency, setSavingCurrency] = useState(false);

  const fetchCurrencies = async () => {
    try {
      const data = await api.getCurrencies();
      setCurrencies(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const fetchRates = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getExchangeRates(currentTenant.id);
      setExchangeRates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, [currentTenant]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !selectedCurrencyId || !tanggal || !kurs) return;
    
    setSaving(true);
    try {
      await api.setExchangeRate({
        tenantId: currentTenant.id,
        currencyId: selectedCurrencyId,
        tanggal,
        kurs: Number(kurs),
        createdBy: 'Admin',
      });
      alert('Kurs berhasil disimpan');
      setKurs('');
      fetchRates();
    } catch (err: any) {
      alert('Gagal menyimpan kurs: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrencyCode || !newCurrencyName) return;

    setSavingCurrency(true);
    try {
      const created = await api.createCurrency({
        kode_iso: newCurrencyCode.toUpperCase(),
        nama: newCurrencyName,
      });
      alert('Mata uang berhasil ditambahkan');
      setNewCurrencyCode('');
      setNewCurrencyName('');
      setShowAddCurrency(false);
      setSelectedCurrencyId(created.id);
      fetchCurrencies();
    } catch (err: any) {
      alert('Gagal menambahkan mata uang: ' + err.message);
    } finally {
      setSavingCurrency(false);
    }
  };

  if (!currentTenant) return <div>Pilih tenant terlebih dahulu</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Banknote className="w-6 h-6 text-indigo-400" /> Kurs Mata Uang (Exchange Rates)
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Kelola kurs mata uang asing ke mata uang fungsional tenant ({currentTenant.mata_uang}).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Kolom Kiri: Form Input */}
        <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm h-fit">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> Input Kurs Harian
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-400">Mata Uang Asing</label>
                <button
                  type="button"
                  onClick={() => setShowAddCurrency(!showAddCurrency)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  {showAddCurrency ? 'Batal Tambah' : '+ Tambah Baru'}
                </button>
              </div>

              {showAddCurrency ? (
                <div className="bg-slate-950 p-3 rounded-xl border border-indigo-500/30 mb-3 space-y-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Kode ISO (ex: SGD)</label>
                    <input
                      required={showAddCurrency}
                      type="text"
                      maxLength={3}
                      value={newCurrencyCode}
                      onChange={e => setNewCurrencyCode(e.target.value.toUpperCase())}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none uppercase"
                      placeholder="SGD"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Nama Mata Uang</label>
                    <input
                      required={showAddCurrency}
                      type="text"
                      value={newCurrencyName}
                      onChange={e => setNewCurrencyName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                      placeholder="Singapore Dollar"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveCurrency}
                    disabled={savingCurrency || !newCurrencyCode || !newCurrencyName}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
                  >
                    {savingCurrency ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Simpan Mata Uang
                  </button>
                </div>
              ) : (
                <select
                  required={!showAddCurrency}
                  value={selectedCurrencyId}
                  onChange={e => setSelectedCurrencyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="">-- Pilih Mata Uang --</option>
                  {currencies
                    .filter(c => c.kode_iso !== currentTenant.mata_uang) // Jangan tampilkan base currency
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.kode_iso} - {c.nama}</option>
                    ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Berlaku Tanggal</label>
              <input
                required
                type="date"
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Nilai Kurs (ke {currentTenant.mata_uang})</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-slate-500 sm:text-sm">{currentTenant.mata_uang}</span>
                </div>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={kurs}
                  onChange={e => setKurs(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl pl-12 pr-3 py-2"
                  placeholder="Misal: 15600"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-semibold py-2 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan Kurs
            </button>
          </form>
        </div>

        {/* Kolom Kanan: Daftar Kurs */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" /> Riwayat Kurs
            </h3>
          </div>
          
          <div className="overflow-x-auto p-4 flex-1">
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
            ) : exchangeRates.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-700/50 text-slate-400 text-xs">
                    <th className="pb-2 font-semibold">Tanggal</th>
                    <th className="pb-2 font-semibold">Mata Uang</th>
                    <th className="pb-2 font-semibold text-right">Nilai Kurs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {exchangeRates.map(rate => (
                    <tr key={rate.id} className="hover:bg-slate-800/30">
                      <td className="py-3 text-sm text-slate-300">
                        {new Date(rate.tanggal).toLocaleDateString('id-ID')}
                      </td>
                      <td className="py-3 text-sm text-slate-300">
                        <span className="bg-slate-800 text-indigo-300 px-2 py-0.5 rounded text-xs font-bold border border-slate-700">
                          {rate.currency.kode_iso}
                        </span>
                      </td>
                      <td className="py-3 text-sm font-medium text-emerald-400 text-right">
                        {rate.kurs.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center p-8 text-slate-500 text-sm">
                Belum ada data kurs yang diinput.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
