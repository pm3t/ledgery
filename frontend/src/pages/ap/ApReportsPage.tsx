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
} from '../../services/api';

interface ApReportsPageProps {
  currentTenant: Tenant | null;
}

export const ApReportsPage: React.FC<ApReportsPageProps> = ({ currentTenant }) => {
  const [activeTab, setActiveTab] = useState<'aging' | 'vendor-ledger'>('aging');
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [loading, setLoading] = useState(false);

  // Aging State
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [agingData, setAgingData] = useState<any | null>(null);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  // Vendor Ledger State
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [ledgerStartDate, setLedgerStartDate] = useState<string>(
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
  );
  const [ledgerEndDate, setLedgerEndDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [ledgerData, setLedgerData] = useState<any | null>(null);

  // Fetch initial partners
  useEffect(() => {
    if (currentTenant) {
      api.getBusinessPartners(currentTenant.id, { type: 'vendor', isActive: true }).then((data) => {
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
      const data = await api.getApAgingReport(currentTenant.id, asOfDate);
      setAgingData(data);
    } catch (err) {
      console.error('Gagal mengambil laporan aging hutang:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Vendor Ledger
  const fetchVendorLedger = async () => {
    if (!currentTenant || !selectedPartnerId) return;
    setLoading(true);
    try {
      const data = await api.getVendorLedger(
        currentTenant.id,
        selectedPartnerId,
        ledgerStartDate,
        ledgerEndDate,
      );
      setLedgerData(data);
    } catch (err) {
      console.error('Gagal mengambil kartu hutang:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'aging') {
      fetchAging();
    } else if (activeTab === 'vendor-ledger' && selectedPartnerId) {
      fetchVendorLedger();
    }
  }, [activeTab, asOfDate, selectedPartnerId, ledgerStartDate, ledgerEndDate]);

  // Export Aging to Excel
  const handleExportAgingExcel = () => {
    if (!agingData || !currentTenant) return;
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      [currentTenant.nama_perusahaan],
      ['LAPORAN UMUR HUTANG (AP AGING REPORT)'],
      [`Per Tanggal: ${agingData.asOfDate}`],
      [],
      [
        'Kode Vendor',
        'Nama Vendor',
        agingData.bucketDefinitions.current,
        agingData.bucketDefinitions.bucket1,
        agingData.bucketDefinitions.bucket2,
        agingData.bucketDefinitions.bucket3,
        agingData.bucketDefinitions.older,
        'Total Hutang',
      ],
    ];

    agingData.vendors.forEach((v: any) => {
      rows.push([
        v.partnerKode,
        v.partnerNama,
        v.current,
        v.bucket1,
        v.bucket2,
        v.bucket3,
        v.older,
        v.totalHutang,
      ]);
    });

    rows.push([]);
    rows.push([
      'GRAND TOTAL',
      '',
      agingData.grandTotal.current,
      agingData.grandTotal.bucket1,
      agingData.grandTotal.bucket2,
      agingData.grandTotal.bucket3,
      agingData.grandTotal.older,
      agingData.grandTotal.totalHutang,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Umur Hutang');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), `Umur_Hutang_${agingData.asOfDate}.xlsx`);
  };

  // Export Vendor Ledger to Excel
  const handleExportLedgerExcel = () => {
    if (!ledgerData || !currentTenant) return;
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      [currentTenant.nama_perusahaan],
      ['KARTU HUTANG & STATEMENT VENDOR'],
      [`Vendor: ${ledgerData.partner.nama} (${ledgerData.partner.kode})`],
      [`Periode: ${ledgerData.startDate} s/d ${ledgerData.endDate}`],
      [],
      ['Tanggal', 'No Dokumen', 'Deskripsi Transaksi', 'Debit (Pembayaran/Retur)', 'Kredit (Tagihan Baru)', 'Saldo Berjalan'],
      ['', '', 'SALDO AWAL', '', '', ledgerData.saldoAwal],
    ];

    ledgerData.mutasi.forEach((m: any) => {
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
    XLSX.utils.book_append_sheet(wb, ws, 'Kartu Hutang');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(
      new Blob([out], { type: 'application/octet-stream' }),
      `Kartu_Hutang_${ledgerData.partner.kode}_${ledgerData.endDate}.xlsx`,
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
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-600" />
            Laporan Sub Ledger Hutang (AP)
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Analisis umur hutang (aging buckets) dan kartu hutang vendor untuk{' '}
            <span className="text-emerald-700 font-semibold">{currentTenant.nama_perusahaan}</span>.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('aging')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'aging' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Umur Hutang (Aging)
          </button>
          <button
            onClick={() => setActiveTab('vendor-ledger')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'vendor-ledger' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kartu Hutang (Statement)
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: UMUR HUTANG (AGING REPORT) */}
      {/* ============================================================== */}
      {activeTab === 'aging' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm print:hidden">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold text-slate-600">Posisi Per Tanggal:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportAgingExcel}
                disabled={!agingData || !agingData.vendors || agingData.vendors.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" /> Unduh Excel
              </button>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak Laporan
              </button>
            </div>
          </div>

          {/* Aging Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm print:border-black print:text-black">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between print:hidden">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Rekapitulasi Umur Hutang per Vendor
              </span>
              <span className="text-xs text-slate-500 font-mono">Posisi: {asOfDate}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 print:text-black">
                <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider border-b border-slate-200 text-[11px] print:bg-gray-100 print:text-black">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Vendor</th>
                    <th className="py-3 px-3 text-right font-semibold">Belum Jatuh Tempo</th>
                    <th className="py-3 px-3 text-right font-semibold">{agingData?.bucketDefinitions?.bucket1 || '1-30'}</th>
                    <th className="py-3 px-3 text-right font-semibold">{agingData?.bucketDefinitions?.bucket2 || '31-60'}</th>
                    <th className="py-3 px-3 text-right font-semibold">{agingData?.bucketDefinitions?.bucket3 || '61-90'}</th>
                    <th className="py-3 px-3 text-right font-semibold">{agingData?.bucketDefinitions?.older || '>90'}</th>
                    <th className="py-3 px-4 text-right font-semibold">Total Hutang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 text-sm font-sans">
                        Menghitung umur hutang...
                      </td>
                    </tr>
                  ) : !agingData || !agingData.vendors || agingData.vendors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 text-sm font-sans">
                        Tidak ada hutang outstanding per tanggal {asOfDate}.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {agingData.vendors.map((v: any) => {
                        const isExpanded = expandedVendor === v.partnerId;
                        return (
                          <React.Fragment key={v.partnerId}>
                            <tr
                              onClick={() => setExpandedVendor(isExpanded ? null : v.partnerId)}
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <td className="py-3 px-4 font-sans font-semibold text-slate-900 flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                )}
                                <span>
                                  {v.partnerNama} <span className="text-[10px] text-slate-400">({v.partnerKode})</span>
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right text-slate-700">
                                {v.current > 0 ? new Intl.NumberFormat('id-ID').format(v.current) : '-'}
                              </td>
                              <td className="py-3 px-3 text-right text-blue-600">
                                {v.bucket1 > 0 ? new Intl.NumberFormat('id-ID').format(v.bucket1) : '-'}
                              </td>
                              <td className="py-3 px-3 text-right text-amber-600">
                                {v.bucket2 > 0 ? new Intl.NumberFormat('id-ID').format(v.bucket2) : '-'}
                              </td>
                              <td className="py-3 px-3 text-right text-orange-600">
                                {v.bucket3 > 0 ? new Intl.NumberFormat('id-ID').format(v.bucket3) : '-'}
                              </td>
                              <td className="py-3 px-3 text-right text-rose-600 font-bold">
                                {v.older > 0 ? new Intl.NumberFormat('id-ID').format(v.older) : '-'}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-slate-900">
                                {new Intl.NumberFormat('id-ID').format(v.totalHutang)}
                              </td>
                            </tr>

                            {/* Detail Tagihan jika expanded */}
                            {isExpanded && (
                              <tr className="bg-slate-50/70">
                                <td colSpan={7} className="p-3 pl-8">
                                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                    <table className="w-full text-left text-[11px] text-slate-600">
                                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                                        <tr>
                                          <th className="py-1.5 px-3">No. Dokumen</th>
                                          <th className="py-1.5 px-3">Faktur Vendor</th>
                                          <th className="py-1.5 px-3">Tanggal</th>
                                          <th className="py-1.5 px-3">Jatuh Tempo</th>
                                          <th className="py-1.5 px-3">Keterlambatan</th>
                                          <th className="py-1.5 px-3 text-right">Saldo Hutang</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {v.bills?.map((bill: any) => (
                                          <tr key={bill.id}>
                                            <td className="py-1.5 px-3 font-semibold text-slate-900">{bill.noDokumen}</td>
                                            <td className="py-1.5 px-3 text-slate-500">{bill.noFakturVendor || '-'}</td>
                                            <td className="py-1.5 px-3">{new Date(bill.tanggal).toLocaleDateString('id-ID')}</td>
                                            <td className="py-1.5 px-3">{new Date(bill.jatuhTempo).toLocaleDateString('id-ID')}</td>
                                            <td className="py-1.5 px-3">
                                              {bill.overdueDays <= 0 ? (
                                                <span className="text-emerald-600 font-medium">Belum jatuh tempo</span>
                                              ) : (
                                                <span className="text-rose-600 font-bold">Terlambat {bill.overdueDays} Hari</span>
                                              )}
                                            </td>
                                            <td className="py-1.5 px-3 text-right font-bold text-slate-900">
                                              {new Intl.NumberFormat('id-ID').format(bill.saldo)}
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
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900 text-xs">
                        <td className="py-3 px-4 font-sans uppercase">GRAND TOTAL HUTANG</td>
                        <td className="py-3 px-3 text-right text-slate-800">
                          {new Intl.NumberFormat('id-ID').format(agingData.grandTotal?.current || 0)}
                        </td>
                        <td className="py-3 px-3 text-right text-blue-700">
                          {new Intl.NumberFormat('id-ID').format(agingData.grandTotal?.bucket1 || 0)}
                        </td>
                        <td className="py-3 px-3 text-right text-amber-700">
                          {new Intl.NumberFormat('id-ID').format(agingData.grandTotal?.bucket2 || 0)}
                        </td>
                        <td className="py-3 px-3 text-right text-orange-700">
                          {new Intl.NumberFormat('id-ID').format(agingData.grandTotal?.bucket3 || 0)}
                        </td>
                        <td className="py-3 px-3 text-right text-rose-700">
                          {new Intl.NumberFormat('id-ID').format(agingData.grandTotal?.older || 0)}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-700 text-sm">
                          {new Intl.NumberFormat('id-ID', {
                            style: 'currency',
                            currency: currentTenant.mata_uang || 'IDR',
                            maximumFractionDigits: 0,
                          }).format(agingData.grandTotal?.totalHutang || 0)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: KARTU HUTANG & STATEMENT VENDOR */}
      {/* ============================================================== */}
      {activeTab === 'vendor-ledger' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm print:hidden">
            <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
              <select
                value={selectedPartnerId}
                onChange={(e) => setSelectedPartnerId(e.target.value)}
                className="bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 w-64"
              >
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.kode} - {p.nama}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>Periode:</span>
                <input
                  type="date"
                  value={ledgerStartDate}
                  onChange={(e) => setLedgerStartDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                <span>s/d</span>
                <input
                  type="date"
                  value={ledgerEndDate}
                  onChange={(e) => setLedgerEndDate(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportLedgerExcel}
                disabled={!ledgerData}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" /> Unduh Statement Excel
              </button>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Cetak Statement
              </button>
            </div>
          </div>

          {/* Statement Header Card */}
          {ledgerData && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm print:border-black print:text-black">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{ledgerData.partner.nama}</h3>
                  <p className="text-xs text-slate-500">
                    Kode Vendor: <span className="font-mono font-semibold">{ledgerData.partner.kode}</span> | NPWP: {ledgerData.partner.npwp || '-'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Saldo Akhir Hutang:</span>
                  <span className="text-xl font-bold text-emerald-700 font-mono">
                    {new Intl.NumberFormat('id-ID', {
                      style: 'currency',
                      currency: currentTenant.mata_uang || 'IDR',
                      maximumFractionDigits: 0,
                    }).format(ledgerData.saldoAkhir)}
                  </span>
                </div>
              </div>

              {/* Tabel Mutasi */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-[11px]">
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Tipe</th>
                      <th className="py-2.5 px-3">No. Dokumen</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                      <th className="py-2.5 px-3 text-right">Debit (Bayar/Retur)</th>
                      <th className="py-2.5 px-3 text-right">Kredit (Tagihan)</th>
                      <th className="py-2.5 px-3 text-right">Saldo Berjalan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {/* Saldo Awal */}
                    <tr className="bg-slate-50/50 font-semibold">
                      <td className="py-2.5 px-3 text-slate-500" colSpan={4}>
                        SALDO AWAL PERIODE
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right text-slate-800">
                        {new Intl.NumberFormat('id-ID').format(ledgerData.saldoAwal)}
                      </td>
                    </tr>

                    {ledgerData.mutasi.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400 font-sans">
                          Tidak ada transaksi hutang pada rentang tanggal ini.
                        </td>
                      </tr>
                    ) : (
                      ledgerData.mutasi.map((m: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 text-slate-600">
                            {new Date(m.tanggal).toLocaleDateString('id-ID')}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            {m.tipe === 'TAGIHAN' || m.tipe === 'FAKTUR' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                FAKTUR
                              </span>
                            ) : m.tipe === 'PEMBAYARAN' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                PEMBAYARAN
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                NOTA DEBIT
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800">{m.noDokumen}</td>
                          <td className="py-2 px-3 font-sans text-slate-600 max-w-xs truncate">{m.deskripsi}</td>
                          <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                            {m.debit > 0 ? new Intl.NumberFormat('id-ID').format(m.debit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-rose-600 font-semibold">
                            {m.kredit > 0 ? new Intl.NumberFormat('id-ID').format(m.kredit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">
                            {new Intl.NumberFormat('id-ID').format(m.saldoBerjalan)}
                          </td>
                        </tr>
                      ))
                    )}

                    {/* Saldo Akhir */}
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td className="py-2.5 px-3 text-slate-900" colSpan={4}>
                        SALDO AKHIR PERIODE
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 text-sm">
                        {new Intl.NumberFormat('id-ID').format(ledgerData.saldoAkhir)}
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

