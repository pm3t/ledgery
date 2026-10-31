import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Download,
  CreditCard,
  ArrowRight,
  TrendingDown,
  Building2,
  Search,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  api,
  Tenant,
  BusinessPartner,
  PaymentScheduleResponse,
  PaymentScheduleItem,
} from '../../services/api';

interface PaymentSchedulePageProps {
  currentTenant: Tenant | null;
  onNavigateToPayments?: (billId?: string, partnerId?: string) => void;
}

export const PaymentSchedulePage: React.FC<PaymentSchedulePageProps> = ({
  currentTenant,
  onNavigateToPayments,
}) => {
  const [scheduleData, setScheduleData] = useState<PaymentScheduleResponse | null>(null);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [daysAhead, setDaysAhead] = useState<number>(30);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('ALL');

  const fetchPartners = async () => {
    if (!currentTenant) return;
    try {
      const data = await api.getBusinessPartners(currentTenant.id, { type: 'vendor', isActive: true });
      setPartners(data);
    } catch (err) {
      console.error('Gagal mengambil data vendor:', err);
    }
  };

  const fetchSchedule = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const partnerParam = selectedPartnerId === 'ALL' ? undefined : selectedPartnerId;
      const data = await api.getPaymentSchedule(currentTenant.id, daysAhead, partnerParam);
      setScheduleData(data);
    } catch (err) {
      console.error('Gagal mengambil jadwal pembayaran:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [currentTenant]);

  useEffect(() => {
    fetchSchedule();
  }, [currentTenant, daysAhead, selectedPartnerId]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currentTenant?.mata_uang || 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    if (!scheduleData?.items) return [];
    return scheduleData.items.filter((item) => {
      const matchUrgency = urgencyFilter === 'ALL' || item.urgency === urgencyFilter;
      const matchSearch =
        item.noDokumen.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.noFakturVendor && item.noFakturVendor.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.partnerNama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.partnerKode.toLowerCase().includes(searchQuery.toLowerCase());
      return matchUrgency && matchSearch;
    });
  }, [scheduleData, urgencyFilter, searchQuery]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!scheduleData || !currentTenant) return;
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      [currentTenant.nama_perusahaan],
      ['JADWAL PEMBAYARAN HUTANG VENDOR (CASH OUTFLOW SCHEDULE)'],
      [`Posisi Per: ${scheduleData.asOfDate} | Proyeksi: ${scheduleData.daysAhead} Hari ke Depan (Cut-off: ${scheduleData.cutOffDate})`],
      [],
      [
        'No. Dokumen',
        'No. Faktur Vendor',
        'Kode Vendor',
        'Nama Vendor',
        'Tanggal Faktur',
        'Jatuh Tempo',
        'Status Urgensi',
        'Sisa Hari',
        'Mata Uang',
        'Saldo Tagihan',
        'Saldo Ekuivalen (IDR)',
      ],
    ];

    filteredItems.forEach((item) => {
      rows.push([
        item.noDokumen,
        item.noFakturVendor || '-',
        item.partnerKode,
        item.partnerNama,
        item.tanggal,
        item.jatuhTempo,
        item.urgency,
        item.daysUntilDue,
        item.mata_uang,
        item.saldo,
        item.saldoFungsional,
      ]);
    });

    rows.push([]);
    rows.push([
      'TOTAL KEBUTUHAN KAS',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      scheduleData.totalKomitmenFungsional,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Jadwal Pembayaran');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), `Jadwal_Pembayaran_${scheduleData.asOfDate}.xlsx`);
  };

  const getUrgencyBadge = (urgency: PaymentScheduleItem['urgency'], days: number) => {
    switch (urgency) {
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Terlambat {Math.abs(days)} Hari
          </span>
        );
      case 'DUE_TODAY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Jatuh Tempo Hari Ini
          </span>
        );
      case 'DUE_SOON':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" />
            Dalam {days} Hari
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            Dalam {days} Hari
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-600" />
            Jadwal Pembayaran Vendor
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Perencanaan arus kas keluar untuk pelunasan tagihan jatuh tempo dalam {daysAhead} hari ke depan.
          </p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={!scheduleData || scheduleData.items.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium rounded-lg text-sm transition-colors disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          Unduh Jadwal (Excel)
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Komitmen Kas */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Total Kebutuhan Kas</span>
            <TrendingDown className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-800 font-mono">
            {formatCurrency(scheduleData?.totalKomitmenFungsional || 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {scheduleData?.totalBills || 0} tagihan jatuh tempo s/d {scheduleData?.cutOffDate}
          </div>
        </div>

        {/* Overdue */}
        <div className="bg-white p-5 rounded-xl border border-rose-200 shadow-sm bg-rose-50/20">
          <div className="flex items-center justify-between text-rose-600 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Sudah Lewat Jatuh Tempo</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-rose-700 font-mono">
            {formatCurrency(scheduleData?.summary.overdue || 0)}
          </div>
          <div className="text-xs text-rose-500 mt-1">
            Prioritas penanganan segera
          </div>
        </div>

        {/* Due Today */}
        <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm bg-amber-50/20">
          <div className="flex items-center justify-between text-amber-600 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Jatuh Tempo Hari Ini</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-amber-700 font-mono">
            {formatCurrency(scheduleData?.summary.dueToday || 0)}
          </div>
          <div className="text-xs text-amber-600 mt-1">
            Jadwal pengeluaran hari ini
          </div>
        </div>

        {/* Due This Week */}
        <div className="bg-white p-5 rounded-xl border border-blue-200 shadow-sm bg-blue-50/20">
          <div className="flex items-center justify-between text-blue-600 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Jatuh Tempo Pekan Ini</span>
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-blue-700 font-mono">
            {formatCurrency(scheduleData?.summary.dueThisWeek || 0)}
          </div>
          <div className="text-xs text-blue-500 mt-1">
            Jatuh tempo 1 s/d 7 hari
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Days Ahead Filter */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 px-2 font-medium">Rentang:</span>
            {[7, 14, 30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDaysAhead(d)}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  daysAhead === d
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {d} Hari
              </button>
            ))}
          </div>

          {/* Vendor Filter */}
          <div className="w-56">
            <select
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="ALL">Semua Vendor</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.kode} - {p.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Urgency Filter */}
          <div className="w-44">
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="ALL">Semua Urgensi</option>
              <option value="OVERDUE">Lewat Jatuh Tempo</option>
              <option value="DUE_TODAY">Jatuh Tempo Hari Ini</option>
              <option value="DUE_SOON">Dalam 7 Hari</option>
              <option value="UPCOMING">Mendatang</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nomor tagihan/vendor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Tabel Jadwal Pembayaran */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                <th className="py-3 px-4">No. Dokumen</th>
                <th className="py-3 px-4">No. Faktur Vendor</th>
                <th className="py-3 px-4">Vendor</th>
                <th className="py-3 px-4">Tanggal Tagihan</th>
                <th className="py-3 px-4">Jatuh Tempo</th>
                <th className="py-3 px-4 text-center">Status Urgensi</th>
                <th className="py-3 px-4 text-right">Saldo Tagihan</th>
                <th className="py-3 px-4 text-right">Ekuivalen Fungsional</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 text-sm">
                    Memuat jadwal pembayaran...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 text-sm">
                    Tidak ada tagihan yang jatuh tempo sesuai kriteria yang dipilih.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {item.noDokumen}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {item.noFakturVendor ? (
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                          {item.noFakturVendor}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      <div>{item.partnerNama}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{item.partnerKode}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(item.tanggal).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {new Date(item.jatuhTempo).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getUrgencyBadge(item.urgency, item.daysUntilDue)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-800 font-mono">
                      {item.mata_uang} {formatNumber(Number(item.saldo))}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono">
                      {currentTenant?.mata_uang} {formatNumber(Number(item.saldoFungsional))}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          if (onNavigateToPayments) {
                            onNavigateToPayments(item.id, item.partnerId);
                          } else {
                            alert(`Buka menu Pembayaran Vendor untuk membayar tagihan ${item.noDokumen}`);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-colors border border-emerald-200"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Bayar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

