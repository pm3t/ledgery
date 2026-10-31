import React, { useState, useEffect } from 'react';
import { api, Tenant, ChartOfAccount, LedgerResponse, Dimension } from '../services/api';
import { Layers, Loader2, AlertCircle, ExternalLink, FileText, CheckCircle2 } from 'lucide-react';

interface Props {
  currentTenant: Tenant | null;
  onNavigate?: (tab: string) => void;
}

export const GeneralLedgerPage: React.FC<Props> = ({ currentTenant, onNavigate }) => {
  const [coas, setCoas] = useState<ChartOfAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [selectedDimensionValue, setSelectedDimensionValue] = useState<string>('');
  
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper navigasi ke dokumen sumber sub ledger
  const handleNavigateToSource = (sourceDocType?: string | null, sourceDocId?: string | null) => {
    if (!sourceDocType || !onNavigate) return;
    const typeUpper = sourceDocType.toUpperCase();
    if (typeUpper.includes('SALES_INVOICE')) {
      onNavigate('ar-invoices');
    } else if (typeUpper.includes('RECEIPT')) {
      onNavigate('ar-receipts');
    } else if (typeUpper.includes('CREDIT_NOTE')) {
      onNavigate('ar-credit-notes');
    } else if (typeUpper.includes('PURCHASE_BILL') || typeUpper.includes('BILL')) {
      onNavigate('ap-bills');
    } else if (typeUpper.includes('PAYMENT')) {
      onNavigate('ap-payments');
    } else if (typeUpper.includes('DEBIT_NOTE')) {
      onNavigate('ap-debit-notes');
    } else if (typeUpper.includes('GOODS_RECEIPT')) {
      onNavigate('order-goods-receipts');
    } else if (typeUpper.includes('DELIVERY_ORDER')) {
      onNavigate('order-delivery-orders');
    } else if (typeUpper.includes('PURCHASE_ORDER')) {
      onNavigate('order-purchase-orders');
    } else if (typeUpper.includes('SALES_ORDER')) {
      onNavigate('order-sales-orders');
    } else if (typeUpper.includes('TRANSFER')) {
      onNavigate('inventory-transfers');
    } else if (typeUpper.includes('ADJUSTMENT') || typeUpper.includes('STOCK')) {
      onNavigate('inventory-adjustments');
    } else {
      alert(`Dokumen Sumber: ${sourceDocType}\nID: ${sourceDocId || '-'}`);
    }
  };

  useEffect(() => {
    if (currentTenant) {
      api.getCoaByTenant(currentTenant.id)
        .then((res) => setCoas(res.filter(c => c.isActive)))
        .catch(() => setError('Gagal memuat daftar akun'));
      api.getDimensions()
        .then((res) => setDimensions(res.filter(d => d.isActive)))
        .catch(() => console.error('Gagal memuat dimensi'));
    }
  }, [currentTenant]);

  const fetchLedger = async () => {
    if (!currentTenant || !selectedAccountId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAccountLedger(currentTenant.id, selectedAccountId, startDate, endDate, selectedDimensionValue || undefined);
      setLedger(res);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat Buku Besar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId) {
      fetchLedger();
    } else {
      setLedger(null);
    }
  }, [selectedAccountId, startDate, endDate, selectedDimensionValue, currentTenant]);

  if (!currentTenant) return <div>Pilih tenant terlebih dahulu</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Layers className="w-6 h-6 text-indigo-400" /> Buku Besar (General Ledger)
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Laporan rincian mutasi akun akuntansi <strong>{currentTenant.nama_perusahaan}</strong>
        </p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-xs font-medium text-slate-400 mb-1">Pilih Akun Buku Besar</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2"
          >
            <option value="">-- Silakan Pilih Akun --</option>
            {coas.map(c => (
              <option key={c.id} value={c.id}>{c.kode_akun} - {c.nama_akun}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-400 mb-1">Dimensi (Opsional)</label>
          <select
            value={selectedDimensionValue}
            onChange={(e) => setSelectedDimensionValue(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-2"
          >
            <option value="">-- Semua Dimensi --</option>
            {dimensions.map(d => (
              <optgroup key={d.id} label={d.nama_dimension}>
                {d.values.filter(v => v.isActive).map(v => (
                  <option key={v.id} value={v.id}>
                    {d.nama_dimension}: {v.kode} - {v.nama}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {!selectedAccountId && !loading && !error && (
        <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
          <p className="text-slate-500">Pilih akun dari menu di atas untuk melihat buku besar.</p>
        </div>
      )}

      {loading && (
        <div className="p-12 flex justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      )}

      {ledger && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-1">Nama Akun</p>
              <p className="text-lg font-bold text-white">{ledger.akun.kode_akun} - {ledger.akun.nama_akun}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-1">Saldo Normal / Kategori</p>
              <p className="text-lg font-bold text-indigo-400">{ledger.normalBalance} <span className="text-sm font-normal text-slate-500">({ledger.akun.kategori})</span></p>
            </div>
            <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-2xl shadow-sm">
              <p className="text-xs font-medium text-indigo-300 mb-1">Saldo Akhir Berjalan</p>
              <p className="text-2xl font-bold text-emerald-400">
                {currentTenant.mata_uang} {ledger.saldoAkhir.toLocaleString('id-ID')}
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-semibold">Tanggal</th>
                    <th className="p-4 font-semibold">Voucher</th>
                    <th className="p-4 font-semibold">Dokumen Sumber</th>
                    <th className="p-4 font-semibold">Keterangan</th>
                    <th className="p-4 font-semibold text-right text-emerald-400/80">Debit</th>
                    <th className="p-4 font-semibold text-right text-rose-400/80">Kredit</th>
                    <th className="p-4 font-semibold text-right text-indigo-300">Saldo Berjalan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {ledger.mutasi.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 text-sm text-slate-300">
                        {new Date(m.tanggal).toLocaleDateString('id-ID')}
                      </td>
                      <td className="p-4 text-sm font-medium text-slate-400 font-mono">
                        {m.no_voucher}
                      </td>
                      <td className="p-4 text-xs">
                        {m.sourceDocType ? (
                          <button
                            onClick={() => handleNavigateToSource(m.sourceDocType, m.sourceDocId)}
                            className="inline-flex items-center space-x-1 rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                            title={`Klik untuk melihat dokumen sumber: ${m.sourceDocId || ''}`}
                          >
                            <FileText className="h-3 w-3" />
                            <span>{m.sourceDocType}</span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-slate-300">
                        {m.deskripsi}
                      </td>
                      <td className="p-4 text-sm text-emerald-400 text-right font-mono">
                        {m.debit > 0 ? m.debit.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="p-4 text-sm text-rose-400 text-right font-mono">
                        {m.kredit > 0 ? m.kredit.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="p-4 text-sm font-bold text-indigo-300 text-right font-mono">
                        {m.saldo_berjalan.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                  {ledger.mutasi.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        Tidak ada mutasi jurnal untuk akun ini pada rentang waktu yang dipilih.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
