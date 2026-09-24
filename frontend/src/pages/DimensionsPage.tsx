import React, { useState, useEffect } from 'react';
import { api, Tenant, Dimension } from '../services/api';
import { Plus, Trash2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
}

export const DimensionsPage: React.FC<Props> = ({ currentTenant }) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newDimName, setNewDimName] = useState('');
  const [newValueCode, setNewValueCode] = useState('');
  const [newValueName, setNewValueName] = useState('');
  const [selectedDimId, setSelectedDimId] = useState<string | null>(null);

  const loadDimensions = () => {
    if (!currentTenant) return;
    setLoading(true);
    api.getDimensions()
      .then(setDimensions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDimensions();
  }, [currentTenant]);

  const handleCreateDimension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDimName) return;
    try {
      await api.createDimension({ nama_dimension: newDimName });
      setNewDimName('');
      loadDimensions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddValue = async (e: React.FormEvent, dimId: string) => {
    e.preventDefault();
    if (!newValueCode || !newValueName) return;
    try {
      await api.addDimensionValue(dimId, { kode: newValueCode, nama: newValueName });
      setNewValueCode('');
      setNewValueName('');
      setSelectedDimId(null);
      loadDimensions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteDimension = async (id: string) => {
    if (!confirm('Yakin ingin menghapus dimensi ini?')) return;
    try {
      await api.removeDimension(id);
      loadDimensions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteValue = async (id: string) => {
    if (!confirm('Yakin ingin menghapus value ini?')) return;
    try {
      await api.removeDimensionValue(id);
      loadDimensions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Manajemen Dimensi</h2>
          <p className="text-slate-400 text-sm mt-1">Kelola jenis dimensi (seperti Cost Center, Project) dan value-nya.</p>
        </div>
        <button onClick={loadDimensions} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {/* Form Buat Dimensi Baru */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-lg font-medium text-white mb-4">Buat Kategori Dimensi Baru</h3>
        <form onSubmit={handleCreateDimension} className="flex gap-4">
          <input
            type="text"
            required
            placeholder="Misal: Project, Cost Center, Area"
            value={newDimName}
            onChange={(e) => setNewDimName(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2 focus:ring-1 focus:ring-indigo-500"
          />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl flex items-center gap-2">
            <Plus className="w-4 h-4" /> Buat Dimensi
          </button>
        </form>
      </div>

      {/* Daftar Dimensi */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center text-slate-400 py-10">Memuat dimensi...</div>
        ) : dimensions.length === 0 ? (
          <div className="text-center text-slate-400 py-10">Belum ada dimensi yang dibuat.</div>
        ) : (
          dimensions.map(dim => (
            <div key={dim.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-indigo-400">{dim.nama_dimension}</h3>
                <button onClick={() => handleDeleteDimension(dim.id)} className="text-slate-500 hover:text-rose-400 text-sm flex items-center gap-1">
                  <Trash2 className="w-4 h-4" /> Hapus Dimensi
                </button>
              </div>

              {/* Daftar Values */}
              {dim.values.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {dim.values.map(val => (
                    <div key={val.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between group">
                      <div>
                        <p className="text-xs font-mono text-indigo-400">{val.kode}</p>
                        <p className="text-sm font-medium text-slate-200">{val.nama}</p>
                      </div>
                      <button onClick={() => handleDeleteValue(val.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-opacity">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Belum ada item value pada dimensi ini.</p>
              )}

              {/* Form Tambah Value */}
              {selectedDimId === dim.id ? (
                <form onSubmit={(e) => handleAddValue(e, dim.id)} className="flex gap-2 mt-4 items-end bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="w-1/3">
                    <label className="text-xs text-slate-400">Kode Value</label>
                    <input
                      type="text"
                      required
                      placeholder="Misal: PRJ-01"
                      value={newValueCode}
                      onChange={e => setNewValueCode(e.target.value)}
                      className="w-full mt-1 bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-3 py-2"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-400">Nama Value</label>
                    <input
                      type="text"
                      required
                      placeholder="Misal: Pembangunan Gedung A"
                      value={newValueName}
                      onChange={e => setNewValueName(e.target.value)}
                      className="w-full mt-1 bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-3 py-2"
                    />
                  </div>
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 h-[38px] rounded-lg">
                    Simpan
                  </button>
                  <button type="button" onClick={() => setSelectedDimId(null)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 h-[38px] rounded-lg">
                    Batal
                  </button>
                </form>
              ) : (
                <button onClick={() => setSelectedDimId(dim.id)} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-2">
                  <Plus className="w-4 h-4" /> Tambah Item Value
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
