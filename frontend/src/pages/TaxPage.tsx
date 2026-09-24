import React, { useState, useEffect } from 'react';
import { api, Tenant, TaxSetting, TaxRecap } from '../services/api';
import { Calculator, Save, FileText, Download } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
}

export function TaxPage({ currentTenant }: Props) {
  const [activeTab, setActiveTab] = useState<'setting' | 'recap'>('setting');
  
  // States for Settings
  const [taxSetting, setTaxSetting] = useState<TaxSetting | null>(null);
  const [tarifPpn, setTarifPpn] = useState(11);
  const [npwp, setNpwp] = useState('');
  const [aktifkanPph, setAktifkanPph] = useState(false);
  const [loadingSetting, setLoadingSetting] = useState(false);

  // States for Recap
  const [recaps, setRecaps] = useState<TaxRecap[]>([]);
  const [periodeCalc, setPeriodeCalc] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loadingCalc, setLoadingCalc] = useState(false);

  const fetchSetting = async () => {
    if (!currentTenant) return;
    try {
      const data = await api.getTaxSetting(currentTenant.id);
      setTaxSetting(data);
      setTarifPpn(data.tarif_ppn);
      setNpwp(data.npwp || '');
      setAktifkanPph(data.aktifkan_pph21);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRecaps = async () => {
    if (!currentTenant) return;
    try {
      const data = await api.getTaxRecaps(currentTenant.id);
      setRecaps(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSetting();
    fetchRecaps();
  }, [currentTenant]);

  const handleSaveSetting = async () => {
    if (!currentTenant) return;
    setLoadingSetting(true);
    try {
      await api.updateTaxSetting(currentTenant.id, {
        tarif_ppn: tarifPpn,
        npwp: npwp.trim() || null,
        aktifkan_pph21: aktifkanPph
      });
      alert('Pengaturan Pajak berhasil disimpan!');
      fetchSetting();
    } catch (e: any) {
      alert(`Gagal: ${e.message}`);
    } finally {
      setLoadingSetting(false);
    }
  };

  const handleCalculatePPN = async () => {
    if (!currentTenant) return;
    setLoadingCalc(true);
    try {
      await api.calculatePpn(currentTenant.id, periodeCalc);
      alert('Rekap PPN berhasil dihitung & disimpan!');
      fetchRecaps();
    } catch (e: any) {
      alert(`Gagal menghitung PPN: ${e.message}`);
    } finally {
      setLoadingCalc(false);
    }
  };

  const handleCalculatePPH21 = async () => {
    if (!currentTenant) return;
    if (!aktifkanPph) {
      alert('Aktifkan dulu fitur PPh 21 di Setting Pajak!');
      return;
    }
    setLoadingCalc(true);
    try {
      await api.calculatePph21(currentTenant.id, periodeCalc);
      alert('Rekap PPh 21 berhasil dihitung & disimpan!');
      fetchRecaps();
    } catch (e: any) {
      alert(`Gagal menghitung PPh 21: ${e.message}`);
    } finally {
      setLoadingCalc(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val);
  };

  if (!currentTenant) {
    return <div className="p-6 text-slate-400">Pilih tenant terlebih dahulu...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calculator className="w-6 h-6 text-indigo-400" />
            Modul Perpajakan
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Kelola tarif dan rekapitulasi pelaporan pajak (Estimasi Internal).
          </p>
        </div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-amber-400 text-sm">
          <strong>Perhatian:</strong> Modul perpajakan ini hanya ditujukan untuk <strong>REKAP DASAR internal</strong> dan estimasi kasar (agregat bulanan). Fitur ini BUKAN integrasi resmi ke sistem DJP (Coretax) untuk e-Filing langsung.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('setting')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'setting' 
              ? 'border-indigo-500 text-indigo-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Setting Pajak
        </button>
        <button
          onClick={() => setActiveTab('recap')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'recap' 
              ? 'border-indigo-500 text-indigo-400' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Rekap Pajak Periodik
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'setting' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">NPWP Perusahaan</label>
              <input 
                type="text" 
                value={npwp}
                onChange={e => setNpwp(e.target.value)}
                placeholder="Misal: 01.234.567.8-901.000"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Tarif PPN (%)</label>
              <input 
                type="number" 
                value={tarifPpn}
                onChange={e => setTarifPpn(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            
            <label className="flex items-center gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input 
                type="checkbox" 
                checked={aktifkanPph}
                onChange={e => setAktifkanPph(e.target.checked)}
                className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 rounded focus:ring-indigo-500"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">Aktifkan Perhitungan PPh 21 (Progresif)</span>
                <span className="text-xs text-slate-400">Hitung estimasi pajak penghasilan karyawan dari Jurnal "Rekan"</span>
              </div>
            </label>
          </div>

          <button
            onClick={handleSaveSetting}
            disabled={loadingSetting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {loadingSetting ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      )}

      {activeTab === 'recap' && (
        <div className="space-y-6">
          {/* Kalkulator Header */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Pilih Periode Bulan</label>
              <input 
                type="month" 
                value={periodeCalc}
                onChange={e => setPeriodeCalc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleCalculatePPN}
              disabled={loadingCalc}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Hitung PPN
            </button>
            <button
              onClick={handleCalculatePPH21}
              disabled={loadingCalc || !aktifkanPph}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                aktifkanPph && !loadingCalc 
                  ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Hitung PPh 21
            </button>
          </div>

          {/* Tabel Rekap */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Histori Rekapitulasi Pajak
              </h2>
              <button className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors">
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3 font-medium">Periode</th>
                    <th className="px-6 py-3 font-medium">Jenis Pajak</th>
                    <th className="px-6 py-3 font-medium text-right">Dasar Pengenaan (DPP)</th>
                    <th className="px-6 py-3 font-medium text-right">Total Pajak</th>
                    <th className="px-6 py-3 font-medium text-right">Waktu Dihitung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {recaps.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        Belum ada data rekap pajak.
                      </td>
                    </tr>
                  ) : (
                    recaps.map(r => (
                      <tr key={r.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4 text-white font-medium">{r.periode}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            r.jenis_pajak === 'PPN' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {r.jenis_pajak}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-slate-300 font-mono">{formatCurrency(r.total_dasar_pengenaan)}</td>
                        <td className="px-6 py-4 text-right text-emerald-400 font-mono font-medium">{formatCurrency(r.total_pajak)}</td>
                        <td className="px-6 py-4 text-right text-slate-500 text-xs">
                          {new Date(r.createdAt).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
