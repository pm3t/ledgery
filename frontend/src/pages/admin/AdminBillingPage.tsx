import React, { useEffect, useState } from 'react';
import { api, Tenant } from '../../services/api';
import { CreditCard, CalendarClock, CheckCircle2, AlertCircle } from 'lucide-react';

export function AdminBillingPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);

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

  const handleUpdateStatus = async (tenantId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'PAID' ? 'UNPAID' : 'PAID';
    if (!confirm(`Ubah status tagihan menjadi ${newStatus}?`)) return;

    try {
      // Jika diubah jadi PAID, kita tambah +30 hari ke jatuh tempo
      const extDays = newStatus === 'PAID' ? 30 : 0;
      await api.adminUpdateBilling(tenantId, newStatus, extDays);
      fetchTenants();
    } catch (e: any) {
      alert(`Gagal update billing: ${e.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'PAID': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'OVERDUE': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      default: return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-amber-400" />
            Status Langganan & Tagihan
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Pencatatan manual untuk jatuh tempo *flat-fee* langganan bulanan tenant.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-medium">Tenant</th>
              <th className="px-6 py-4 font-medium">Jatuh Tempo</th>
              <th className="px-6 py-4 font-medium">Status Pembayaran</th>
              <th className="px-6 py-4 font-medium text-right">Aksi Manual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500">Memuat data...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500">Tidak ada data</td></tr>
            ) : (
              tenants.map(t => {
                const dueDate = t.billingDueDate ? new Date(t.billingDueDate) : null;
                const isOverdue = dueDate ? dueDate < new Date() && t.billingStatus !== 'PAID' : false;
                const displayStatus = isOverdue ? 'OVERDUE' : (t.billingStatus || 'UNPAID');

                return (
                  <tr key={t.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{t.nama_perusahaan}</td>
                    <td className="px-6 py-4 text-slate-300 flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-slate-500" />
                      {dueDate ? dueDate.toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border flex items-center gap-1.5 w-max ${getStatusColor(displayStatus)}`}>
                        {displayStatus === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {displayStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {displayStatus !== 'PAID' ? (
                        <button
                          onClick={() => handleUpdateStatus(t.id, displayStatus)}
                          className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        >
                          Tandai Lunas (+30 Hari)
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateStatus(t.id, displayStatus)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        >
                          Batalkan Pelunasan
                        </button>
                      )}
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
