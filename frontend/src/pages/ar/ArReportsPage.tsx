import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Search,
  Filter,
  Users,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  api,
  Tenant,
  BusinessPartner,
  ArAgingReportResponse,
  CustomerLedgerResponse,
} from '../../services/api';

interface ArReportsPageProps {
  currentTenant: Tenant | null;
}

export const ArReportsPage: React.FC<ArReportsPageProps> = ({ currentTenant }) => {
  const [activeTab, setActiveTab] = useState<'aging' | 'customer-ledger'>('aging');
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [loading, setLoading] = useState(false);

  // Aging State
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [agingData, setAgingData] = useState<ArAgingReportResponse | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  // Customer Ledger State
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [ledgerStartDate, setLedgerStartDate] = useState<string>(
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
  );
  const [ledgerEndDate, setLedgerEndDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [ledgerData, setLedgerData] = useState<CustomerLedgerResponse | null>(null);

  // Fetch initial partners
  useEffect(() => {
    if (currentTenant) {
      api.getBusinessPartners(currentTenant.id, { type: 'customer', isActive: true }).then((data) => {
        setPartners(data);
        if (data.length > 0 && !selectedPartnerId) {
          setSelectedPartnerId(data[0].id);
        }
      });
    }
  }, [currentTenant]);

  // Fetch Aging Report
  const fetchAging = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const data = await api.getArAgingReport(currentTenant.id, asOfDate);
      setAgingData(data);
    } catch (err) {
      console.error('Gagal mengambil laporan aging:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Customer Ledger
  const fetchCustomerLedger = async () => {
    if (!currentTenant || !selectedPartnerId) return;
    setLoading(true);
    try {
      const data = await api.getCustomerLedger(
        currentTenant.id,
        selectedPartnerId,
        ledgerStartDate,
        ledgerEndDate,
      );
      setLedgerData(data);
    } catch (err) {
      console.error('Gagal mengambil kartu piutang:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'aging') {
      fetchAging();
    } else if (activeTab === 'customer-ledger' && selectedPartnerId) {
      fetchCustomerLedger();
    }
  }, [activeTab, asOfDate, selectedPartnerId, ledgerStartDate, ledgerEndDate]);

  // Export Aging to Excel
  const handleExportAgingExcel = () => {
    if (!agingData || !currentTenant) return;
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      [currentTenant.nama_perusahaan],
      ['LAPORAN UMUR PIUTANG (AGING REPORT)'],
      [`Per Tanggal: ${agingData.asOfDate}`],
      [],
      [
        'Kode Pelanggan',
        'Nama Pelanggan',
        agingData.bucketDefinitions.current,
        agingData.bucketDefinitions.bucket1,
        agingData.bucketDefinitions.bucket2,
        agingData.bucketDefinitions.bucket3,
        agingData.bucketDefinitions.older,
        'Total Piutang',
      ],
    ];

    agingData.customers.forEach((c) => {
      rows.push([
        c.partnerKode,
        c.partnerNama,
        c.current,
        c.bucket1,
        c.bucket2,
        c.bucket3,
        c.older,
        c.totalPiutang,
      ]);
    });

    // Grand total
    rows.push([
      'TOTAL',
      '',
      agingData.grandTotal.current,
      agingData.grandTotal.bucket1,
      agingData.grandTotal.bucket2,
      agingData.grandTotal.bucket3,
      agingData.grandTotal.older,
      agingData.grandTotal.totalPiutang,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Aging Report');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), `Umur_Piutang_${agingData.asOfDate}.xlsx`);
  };

  // Export Customer Ledger to Excel
  const handleExportLedgerExcel = () => {
    if (!ledgerData || !currentTenant) return;
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      [currentTenant.nama_perusahaan],
      ['KARTU PIUTANG & STATEMENT PELANGGAN'],
      [`Pelanggan: ${ledgerData.partner.nama} (${ledgerData.partner.kode})`],
      [`Periode: ${ledgerData.startDate} s/d ${ledgerData.endDate}`],
      [],
      ['Tanggal', 'No Dokumen', 'Deskripsi Transaksi', 'Debit (Penjualan)', 'Kredit (Pelunasan)', 'Saldo Berjalan'],
      ['', '', 'SALDO AWAL', '', '', ledgerData.saldoAwal],
    ];

    ledgerData.mutasi.forEach((m) => {
      rows.push([
        new Date(m.tanggal).toLocaleDateString('id-ID'),
        m.noDokumen,
        m.deskripsi,
        m.debit > 0 ? m.debit : '',
        m.kredit > 0 ? m.kredit : '',
        m.saldoBerjalan,
      ]);
    });

    rows.push(['', '', 'SALDO AKHIR', '', '', ledgerData.saldoAkhir]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Kartu Piutang');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(
      new Blob([out], { type: 'application/octet-stream' }),
      `Kartu_Piutang_${ledgerData.partner.kode}_${ledgerData.endDate}.xlsx`,
    );
  };

  const handlePrint = () => {
    window.print();
  };

  if (!currentTenant) {
    return <div className="text-slate-400">Pilih tenant terlebih dahulu.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-indigo-400" />
            Laporan Sub Ledger Piutang (AR)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Analisis umur piutang (aging buckets) dan mutasi kartu piutang pelanggan untuk{' '}
            <span className="text-indigo-300 font-semibold">{currentTenant.nama_perusahaan}</span>.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('aging')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'aging' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Umur Piutang (Aging)
          </button>
          <button
            onClick={() => setActiveTab('customer-ledger')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'customer-ledger' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Kartu Piutang (Statement)
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: UMUR PIUTANG (AGING REPORT) */}
      {/* ============================================================== */}
      {activeTab === 'aging' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold text-slate-300">Posisi Per Tanggal:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportAgingExcel}
                disabled={!agingData || agingData.customers.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" /> Unduh Excel
              </button>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak Laporan
              </button>
            </div>
          </div>

          {/* Aging Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl print:bg-white print:border-black print:text-black">
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between print:hidden">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Rekapitulasi Umur Piutang per Pelanggan
              </span>
              <span className="text-xs text-slate-400 font-mono">Posisi: {asOfDate}</span>
            </div>

            <table className="w-full text-left text-xs text-slate-300 print:text-black">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px] print:bg-gray-100 print:text-black">
                <tr>
                  <th className="py-3 px-4 font-semibold">Pelanggan</th>
                  <th className="py-3 px-3 text-right font-semibold">Belum Jatuh Tempo</th>
                  <th className="py-3 px-3 text-right font-semibold">{agingData?.bucketDefinitions.bucket1 || '1-30'}</th>
                  <th className="py-3 px-3 text-right font-semibold">{agingData?.bucketDefinitions.bucket2 || '31-60'}</th>
                  <th className="py-3 px-3 text-right font-semibold">{agingData?.bucketDefinitions.bucket3 || '61-90'}</th>
                  <th className="py-3 px-3 text-right font-semibold">{agingData?.bucketDefinitions.older || '>90'}</th>
                  <th className="py-3 px-4 text-right font-semibold">Total Piutang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                      Menghitung umur piutang...
                    </td>
                  </tr>
                ) : !agingData || agingData.customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                      Tidak ada piutang outstanding per tanggal {asOfDate}.
                    </td>
                  </tr>
                ) : (
                  <>
                    {agingData.customers.map((c) => {
                      const isExpanded = expandedCustomer === c.partnerId;
                      return (
                        <React.Fragment key={c.partnerId}>
                          <tr
                            onClick={() => setExpandedCustomer(isExpanded ? null : c.partnerId)}
                            className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-sans font-semibold text-white flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              )}
                              <span>
                                {c.partnerNama} <span className="text-[10px] text-slate-500">({c.partnerKode})</span>
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right text-slate-300">
                              {c.current > 0 ? new Intl.NumberFormat('id-ID').format(c.current) : '-'}
                            </td>
                            <td className="py-3 px-3 text-right text-blue-300">
                              {c.bucket1 > 0 ? new Intl.NumberFormat('id-ID').format(c.bucket1) : '-'}
                            </td>
                            <td className="py-3 px-3 text-right text-amber-300">
                              {c.bucket2 > 0 ? new Intl.NumberFormat('id-ID').format(c.bucket2) : '-'}
                            </td>
                            <td className="py-3 px-3 text-right text-orange-300">
                              {c.bucket3 > 0 ? new Intl.NumberFormat('id-ID').format(c.bucket3) : '-'}
                            </td>
                            <td className="py-3 px-3 text-right text-rose-400 font-bold">
                              {c.older > 0 ? new Intl.NumberFormat('id-ID').format(c.older) : '-'}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-white">
                              {new Intl.NumberFormat('id-ID').format(c.totalPiutang)}
                            </td>
                          </tr>

                          {/* Detail Faktur jika expanded */}
                          {isExpanded && (
                            <tr className="bg-slate-950/60">
                              <td colSpan={7} className="p-3 pl-8">
                                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                                  <table className="w-full text-left text-[11px] text-slate-400">
                                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-300">
                                      <tr>
                                        <th className="py-1.5 px-3">No Faktur</th>
                                        <th className="py-1.5 px-3">Tanggal</th>
                                        <th className="py-1.5 px-3">Jatuh Tempo</th>
                                        <th className="py-1.5 px-3">Keterlambatan</th>
                                        <th className="py-1.5 px-3 text-right">Saldo Faktur</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/40">
                                      {c.invoices.map((inv) => (
                                        <tr key={inv.id}>
                                          <td className="py-1.5 px-3 font-bold text-white">{inv.noDokumen}</td>
                                          <td className="py-1.5 px-3">{new Date(inv.tanggal).toLocaleDateString('id-ID')}</td>
                                          <td className="py-1.5 px-3">{new Date(inv.jatuhTempo).toLocaleDateString('id-ID')}</td>
                                          <td className="py-1.5 px-3">
                                            {inv.overdueDays <= 0 ? (
                                              <span className="text-emerald-400">Belum jatuh tempo</span>
                                            ) : (
                                              <span className="text-amber-400 font-semibold">{inv.overdueDays} Hari</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-bold text-white">
                                            {new Intl.NumberFormat('id-ID').format(inv.saldo)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Grand Total Row */}
                    <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-white text-xs">
                      <td className="py-3 px-4 font-sans uppercase">GRAND TOTAL PIUTANG</td>
                      <td className="py-3 px-3 text-right text-slate-200">
                        {new Intl.NumberFormat('id-ID').format(agingData.grandTotal.current)}
                      </td>
                      <td className="py-3 px-3 text-right text-blue-300">
                        {new Intl.NumberFormat('id-ID').format(agingData.grandTotal.bucket1)}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-300">
                        {new Intl.NumberFormat('id-ID').format(agingData.grandTotal.bucket2)}
                      </td>
                      <td className="py-3 px-3 text-right text-orange-300">
                        {new Intl.NumberFormat('id-ID').format(agingData.grandTotal.bucket3)}
                      </td>
                      <td className="py-3 px-3 text-right text-rose-400">
                        {new Intl.NumberFormat('id-ID').format(agingData.grandTotal.older)}
                      </td>
                      <td className="py-3 px-4 text-right text-indigo-300 text-sm">
                        {new Intl.NumberFormat('id-ID', {
                          style: 'currency',
                          currency: currentTenant.mata_uang || 'IDR',
                          maximumFractionDigits: 0,
                        }).format(agingData.grandTotal.totalPiutang)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: KARTU PIUTANG & STATEMENT PELANGGAN */}
      {/* ============================================================== */}
      {activeTab === 'customer-ledger' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
              <select
                value={selectedPartnerId}
                onChange={(e) => setSelectedPartnerId(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500 w-64"
              >
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.kode} - {p.nama}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Periode:</span>
                <input
                  type="date"
                  value={ledgerStartDate}
                  onChange={(e) => setLedgerStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                />
                <span>s/d</span>
                <input
                  type="date"
                  value={ledgerEndDate}
                  onChange={(e) => setLedgerEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportLedgerExcel}
                disabled={!ledgerData}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" /> Unduh Excel
              </button>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak Statement
              </button>
            </div>
          </div>

          {/* Statement View / Ledger Table */}
          {ledgerData && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-6 space-y-6 print:bg-white print:border-none print:text-black print:p-0">
              {/* Statement Header */}
              <div className="flex justify-between items-start border-b border-slate-800 pb-5">
                <div>
                  <div className="text-xl font-bold text-white print:text-black">STATEMENT OF ACCOUNT (KARTU PIUTANG)</div>
                  <div className="text-xs text-slate-400 mt-1 print:text-gray-600">
                    {currentTenant.nama_perusahaan}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 print:text-gray-500">
                    Periode: {new Date(ledgerData.startDate).toLocaleDateString('id-ID')} s/d{' '}
                    {new Date(ledgerData.endDate).toLocaleDateString('id-ID')}
                  </div>
                </div>

                <div className="text-right text-xs">
                  <span className="text-slate-400 print:text-gray-600">Kepada Yth. Pelanggan:</span>
                  <div className="font-bold text-white text-sm mt-0.5 print:text-black">{ledgerData.partner.nama}</div>
                  <div className="font-mono text-slate-400 print:text-gray-600">Kode: {ledgerData.partner.kode}</div>
                  {ledgerData.partner.alamat && (
                    <div className="text-slate-500 mt-0.5 max-w-xs">{ledgerData.partner.alamat}</div>
                  )}
                  {ledgerData.partner.npwp && (
                    <div className="text-slate-500 font-mono">NPWP: {ledgerData.partner.npwp}</div>
                  )}
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 print:text-black">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 print:bg-gray-100 print:text-black">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Tanggal</th>
                      <th className="py-2.5 px-3 font-semibold">No Dokumen</th>
                      <th className="py-2.5 px-3 font-semibold">Keterangan</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Debit (Tagihan)</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Kredit (Pembayaran)</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Saldo Piutang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {/* Saldo Awal */}
                    <tr className="bg-slate-950/40 font-semibold text-slate-200">
                      <td className="py-2 px-3">{new Date(ledgerData.startDate).toLocaleDateString('id-ID')}</td>
                      <td className="py-2 px-3">-</td>
                      <td className="py-2 px-3 font-sans">SALDO AWAL</td>
                      <td className="py-2 px-3 text-right">-</td>
                      <td className="py-2 px-3 text-right">-</td>
                      <td className="py-2 px-3 text-right font-bold text-indigo-300">
                        {new Intl.NumberFormat('id-ID').format(ledgerData.saldoAwal)}
                      </td>
                    </tr>

                    {ledgerData.mutasi.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 italic font-sans">
                          Tidak ada mutasi transaksi pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      ledgerData.mutasi.map((m, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3">{new Date(m.tanggal).toLocaleDateString('id-ID')}</td>
                          <td className="py-2 px-3 font-bold text-white">{m.noDokumen}</td>
                          <td className="py-2 px-3 font-sans">{m.deskripsi}</td>
                          <td className="py-2 px-3 text-right text-white">
                            {m.debit > 0 ? new Intl.NumberFormat('id-ID').format(m.debit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-400">
                            {m.kredit > 0 ? new Intl.NumberFormat('id-ID').format(m.kredit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-indigo-300">
                            {new Intl.NumberFormat('id-ID').format(m.saldoBerjalan)}
                          </td>
                        </tr>
                      ))
                    )}

                    {/* Saldo Akhir */}
                    <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-white text-xs">
                      <td colSpan={3} className="py-3 px-3 font-sans uppercase">
                        SALDO AKHIR PER {new Date(ledgerData.endDate).toLocaleDateString('id-ID')}
                      </td>
                      <td colSpan={3} className="py-3 px-3 text-right text-indigo-300 text-sm">
                        {new Intl.NumberFormat('id-ID', {
                          style: 'currency',
                          currency: currentTenant.mata_uang || 'IDR',
                          maximumFractionDigits: 0,
                        }).format(ledgerData.saldoAkhir)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

