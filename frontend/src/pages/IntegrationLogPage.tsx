import React, { useEffect, useState } from 'react';
import { api, Tenant, IntegrationLog } from '../services/api';
import { Activity, Search, AlertCircle, CheckCircle2, Filter } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
}

export function IntegrationLogPage({ currentTenant }: Props) {
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');
  const [filterModul, setFilterModul] = useState<string>('ALL');
  const [filterEndpoint, setFilterEndpoint] = useState('');

  const fetchLogs = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getIntegrationLogs(currentTenant.id, filterModul);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [currentTenant, filterModul]);

  const getModuleBadge = (endpoint: string) => {
    const ep = endpoint.toLowerCase();
    if (ep.includes('/ar/') || ep.includes('/invoices') || ep.includes('/receipts')) {
      return { name: 'AR', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' };
    }
    if (ep.includes('/ap/') || ep.includes('/bills') || ep.includes('/payments') || ep.includes('/vendors')) {
      return { name: 'AP', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    }
    if (ep.includes('/inventory') || ep.includes('/items') || ep.includes('/warehouses') || ep.includes('/stock')) {
      return { name: 'INVENTORY', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    }
    if (ep.includes('/orders') || ep.includes('/purchase-order') || ep.includes('/sales-order') || ep.includes('/goods-receipt') || ep.includes('/delivery-order')) {
      return { name: 'ORDERS', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
    }
    if (ep.includes('/journals')) {
      return { name: 'JOURNAL', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' };
    }
    if (ep.includes('/periods')) {
      return { name: 'PERIOD', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' };
    }
    return { name: 'CORE', color: 'bg-slate-700/50 text-slate-300 border-slate-600' };
  };

  const filteredLogs = logs.filter(log => {
    const matchStatus = filterStatus === 'ALL' 
      ? true 
      : filterStatus === 'SUCCESS' ? log.statusCode < 400 : log.statusCode >= 400;
    const matchEndpoint = log.endpoint.toLowerCase().includes(filterEndpoint.toLowerCase());
    return matchStatus && matchEndpoint;
  });

  if (!currentTenant) {
    return <div className="p-6 text-slate-400">Pilih tenant terlebih dahulu...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-400" />
            Log Integrasi API Publik
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Pantau dan debug request dari aplikasi sumber (Rekan, DigiSale, Cultiva, Servio) ke API publik (v1, v2).
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          Segarkan Data
        </button>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-300">
          <strong>Kebijakan Versioning API:</strong> Setiap perubahan struktur payload yang bersifat <em>breaking change</em> akan dirilis pada versi endpoint baru (misal: `/v2/journals`). Endpoint versi lama (seperti `/v1/journals`) akan tetap didukung (<em>backward compatible</em>) hingga seluruh aplikasi klien Anda selesai melakukan migrasi penuh.
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 bg-slate-900 p-4 border border-slate-800 rounded-2xl items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari endpoint (contoh: /v1/ar/invoices)..."
            value={filterEndpoint}
            onChange={e => setFilterEndpoint(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Modul Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterModul}
            onChange={e => setFilterModul(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Semua Modul</option>
            <option value="AR">Modul AR (Piutang)</option>
            <option value="AP">Modul AP (Hutang)</option>
            <option value="INVENTORY">Modul Inventory</option>
            <option value="ORDERS">Modul Order Management</option>
            <option value="JOURNALS">Buku Jurnal</option>
            <option value="PERIODS">Periode Akuntansi</option>
            <option value="COA">Bagan Akun (CoA)</option>
          </select>
        </div>

        {/* Status Filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">Semua Status</option>
          <option value="SUCCESS">Hanya Berhasil (2xx)</option>
          <option value="ERROR">Hanya Error (4xx/5xx)</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-medium">Waktu</th>
              <th className="px-6 py-4 font-medium">Modul & Endpoint</th>
              <th className="px-6 py-4 font-medium">Status Code</th>
              <th className="px-6 py-4 font-medium">Aplikasi / API Key</th>
              <th className="px-6 py-4 font-medium w-1/3">Payload Ringkas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">Memuat log...</td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">Belum ada request integrasi yang tercatat untuk filter ini.</td></tr>
            ) : (
              filteredLogs.map(log => {
                const isError = log.statusCode >= 400;
                const mod = getModuleBadge(log.endpoint);
                return (
                  <tr key={log.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${mod.color}`}>
                          {mod.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300 uppercase">
                          {log.versi_api}
                        </span>
                        <span className="text-white font-mono text-xs">{log.endpoint}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold w-max ${
                        isError ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {isError ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        HTTP {log.statusCode}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-sky-400 text-xs">
                      {log.apiKeyId || 'Gagal Autentikasi'}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500 break-all overflow-hidden max-w-[200px] hover:text-slate-300 transition-colors cursor-help" title={log.payload_ringkas}>
                      {log.payload_ringkas}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

