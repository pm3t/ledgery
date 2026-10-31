import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Info,
  RefreshCw,
  Download,
  AlertCircle,
  FileCheck,
  Package,
} from 'lucide-react';
import { api, Tenant } from '../../services/api';
import { readExcelFile, exportToExcel, formatExcelDate } from '../../utils/excelUtils';

interface InventoryOpeningBalancePageProps {
  currentTenant: Tenant | null;
  onNavigateToStock?: () => void;
  onNavigateToReports?: () => void;
}

interface ParsedStockRow {
  itemKode: string;
  warehouseKode: string;
  tanggalMasuk?: string;
  qty: number;
  biayaSatuan: number;
  catatan?: string;
}

interface ImportResult {
  message: string;
  asOfDate: string;
  inventoryControlAccount: {
    id: string;
    kode: string;
    nama: string;
  };
  currentGlBalance: number;
  totalImportedSubledger: number;
  selisih: number;
  statusRekonsiliasi: 'RECONCILED' | 'SELISIH';
  keterangan: string;
  jumlahBarisDiimpor: number;
}

export const InventoryOpeningBalancePage: React.FC<InventoryOpeningBalancePageProps> = ({
  currentTenant,
  onNavigateToStock,
  onNavigateToReports,
}) => {
  const [asOfDate, setAsOfDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [csvText, setCsvText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedStockRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Unduh contoh Excel template (.xlsx)
  const handleDownloadTemplate = () => {
    const headers = ['itemKode', 'warehouseKode', 'tanggalMasuk', 'qty', 'biayaSatuan', 'catatan'];
    const sampleRows = [
      headers,
      ['ITM-001', 'GDG-UTM', '2026-01-01', 100, 50000, 'Saldo awal stok batch 1'],
      ['ITM-001', 'GDG-UTM', '2026-01-15', 50, 52000, 'Saldo awal stok batch 2 (FIFO)'],
      ['ITM-002', 'GDG-TKO', '2026-01-01', 25, 120000, 'Saldo awal toko'],
    ];

    const safeName = currentTenant?.nama_perusahaan
      ? currentTenant.nama_perusahaan.replace(/\s+/g, '_').toLowerCase()
      : 'tenant';
    exportToExcel(sampleRows, `template_saldo_awal_persediaan_${safeName}.xlsx`, 'Saldo Awal Persediaan');
  };

  // Proses data baris dari Excel (array of arrays)
  const processRawRows = (rawRows: any[][]) => {
    setParseErrors([]);
    setParsedRows([]);
    setErrorMsg(null);
    setImportResult(null);

    if (rawRows.length <= 1) {
      setParseErrors(['File Excel minimal harus memiliki baris header dan 1 baris data.']);
      return;
    }

    const headers = rawRows[0].map((h: any) =>
      String(h || '').trim().toLowerCase().replace(/[\s_\-]/g, '')
    );

    const itemKodeIdx = headers.findIndex((h: string) => h === 'itemkode' || h === 'kodebarang');
    const warehouseKodeIdx = headers.findIndex((h: string) => h === 'warehousekode' || h === 'kodegudang');
    const tanggalMasukIdx = headers.findIndex((h: string) => h === 'tanggalmasuk' || h === 'tglmasuk' || h === 'tanggal');
    const qtyIdx = headers.findIndex((h: string) => h === 'qty' || h === 'kuantitas' || h === 'jumlah');
    const biayaSatuanIdx = headers.findIndex((h: string) => h === 'biayasatuan' || h === 'hargasatuan' || h === 'hpp');
    const catatanIdx = headers.findIndex((h: string) => h === 'catatan' || h === 'keterangan' || h === 'note');

    if (itemKodeIdx === -1 || warehouseKodeIdx === -1 || qtyIdx === -1 || biayaSatuanIdx === -1) {
      setParseErrors([
        `Header Excel wajib menyertakan: itemKode, warehouseKode, qty, biayaSatuan. Header terdeteksi: ${rawRows[0].join(', ')}`,
      ]);
      return;
    }

    const rows: ParsedStockRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < rawRows.length; i++) {
      const cols = rawRows[i];
      if (!cols || cols.length === 0 || cols.every((c: any) => c === '' || c === undefined || c === null)) {
        continue;
      }

      const itemKode = String(cols[itemKodeIdx] || '').trim();
      const warehouseKode = String(cols[warehouseKodeIdx] || '').trim();
      const rawTanggal = tanggalMasukIdx !== -1 ? cols[tanggalMasukIdx] : undefined;
      const tanggalMasuk = rawTanggal ? formatExcelDate(rawTanggal) : undefined;
      
      const rawQty = typeof cols[qtyIdx] === 'number'
        ? cols[qtyIdx]
        : parseFloat(String(cols[qtyIdx] || '').replace(/[^0-9.-]/g, ''));
      const rawBiaya = typeof cols[biayaSatuanIdx] === 'number'
        ? cols[biayaSatuanIdx]
        : parseFloat(String(cols[biayaSatuanIdx] || '').replace(/[^0-9.-]/g, ''));

      const qty = Number(rawQty);
      const biayaSatuan = Number(rawBiaya);
      const catatan = catatanIdx !== -1 && cols[catatanIdx] ? String(cols[catatanIdx]).trim() : undefined;

      if (!itemKode) {
        errors.push(`Baris ${i + 1}: itemKode tidak boleh kosong.`);
      }
      if (!warehouseKode) {
        errors.push(`Baris ${i + 1}: warehouseKode tidak boleh kosong.`);
      }
      if (isNaN(qty) || qty <= 0) {
        errors.push(`Baris ${i + 1}: kuantitas (qty) harus angka > 0 (${itemKode || 'Tanpa Kode'}).`);
      }
      if (isNaN(biayaSatuan) || biayaSatuan < 0) {
        errors.push(`Baris ${i + 1}: biayaSatuan harus angka >= 0 (${itemKode || 'Tanpa Kode'}).`);
      }

      if (itemKode && warehouseKode && qty > 0 && biayaSatuan >= 0) {
        rows.push({
          itemKode,
          warehouseKode,
          tanggalMasuk: tanggalMasuk || asOfDate,
          qty,
          biayaSatuan,
          catatan,
        });
      }
    }

    setParsedRows(rows);
    setParseErrors(errors);
  };

  // Upload file Excel / spreadsheet
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    try {
      const rows = await readExcelFile(file);
      processRawRows(rows);
    } catch (err: any) {
      console.error('Gagal membaca file Excel:', err);
      setParseErrors([`Gagal membaca file Excel: ${err.message || 'Format tidak didukung'}`]);
    }
  };

  // Parsing CSV string jika pengguna menempel teks
  const handleParseCsv = (content: string) => {
    setCsvText(content);
    if (!content.trim()) {
      setParsedRows([]);
      setParseErrors([]);
      return;
    }
    const lines = content.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
    const rawRows = lines.map((l) => l.split(',').map((c) => c.trim().replace(/^["']|["']$/g, '')));
    processRawRows(rawRows);
  };

  const calculateSubledgerTotal = () => {
    return parsedRows.reduce((acc, r) => acc + r.qty * r.biayaSatuan, 0);
  };

  const handleExecuteImport = async () => {
    if (!currentTenant) return;
    if (parsedRows.length === 0) {
      setErrorMsg('Tidak ada baris data yang valid untuk diimpor.');
      return;
    }
    if (parseErrors.length > 0) {
      setErrorMsg('Harap perbaiki semua kesalahan baris data sebelum melakukan impor.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const payload = {
        asOfDate,
        items: parsedRows.map((r) => ({
          itemKode: r.itemKode,
          warehouseKode: r.warehouseKode,
          tanggalMasuk: r.tanggalMasuk,
          qty: r.qty,
          biayaSatuan: r.biayaSatuan,
          catatan: r.catatan,
        })),
      };

      const res = await api.importStockOpeningBalance(currentTenant.id, payload);
      setImportResult(res);
      setParsedRows([]);
      setCsvText('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengimpor saldo awal persediaan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UploadCloud className="w-7 h-7 text-indigo-600" />
            Impor Saldo Awal Persediaan
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Impor saldo kuantitas dan nilai awal per barang dan gudang (termasuk lapisan FIFO) saat migrasi
            ke Ledgery tanpa menduplikasi jurnal Buku Besar (GL).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Unduh Template Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Info Callout */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3 text-sm text-indigo-900">
        <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold">Mekanisme Rekonsiliasi Saldo Awal Subledger:</span>
          <p className="text-xs text-indigo-800 leading-relaxed">
            Data yang diimpor di sini mengisi saldo kuantitas gudang (StockBalance) dan lapisan harga perolehan (StockCostLayer)
            tanpa membuat jurnal tambahan di Buku Besar. Sistem kemudian secara otomatis membandingkan total nilai subledger
            yang diimpor dengan saldo akun kontrol <strong>INVENTORY</strong> pada Buku Besar (GL) per tanggal cut-off.
          </p>
        </div>
      </div>

      {/* Form & Upload Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Tanggal Cut-Off (As-Of Date) *
            </label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Tanggal posisi saldo awal neraca (mis. 2026-01-01).
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1 flex items-center justify-between">
              <span>Unggah Berkas Excel (.xlsx / .xls)</span>
              {uploadedFileName && (
                <span className="text-xs text-emerald-600 font-medium normal-case flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {uploadedFileName} ({parsedRows.length} baris)
                </span>
              )}
            </label>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer border border-gray-200 rounded-lg p-1"
            />
          </div>
        </div>

        {/* Text Area for manual paste */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
            Atau Salin & Tempel Konten CSV di Bawah:
          </label>
          <textarea
            rows={5}
            value={csvText}
            onChange={(e) => handleParseCsv(e.target.value)}
            placeholder={`itemKode,warehouseKode,tanggalMasuk,qty,biayaSatuan,catatan\nITM-001,GDG-01,2026-01-01,100,25000,Saldo Awal`}
            className="w-full p-3 font-mono text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
          />
        </div>

        {/* Error Messages */}
        {parseErrors.length > 0 && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>Ditemukan {parseErrors.length} kesalahan pada data CSV:</span>
            </div>
            <ul className="list-disc list-inside text-xs text-rose-700 max-h-36 overflow-y-auto space-y-0.5">
              {parseErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Preview Table */}
        {parsedRows.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                Pratinjau Data ({parsedRows.length} baris)
              </h3>
              <div className="text-sm font-semibold text-gray-700">
                Total Nilai Subledger:{' '}
                <span className="text-indigo-600">Rp {formatNumber(calculateSubledgerTotal())}</span>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">Kode Barang</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">Kode Gudang</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">Tgl Masuk</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase">Kuantitas</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase">Biaya Satuan</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase">Total Nilai</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {parsedRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400 font-mono">{idx + 1}</td>
                      <td className="px-3 py-1.5 font-semibold text-gray-900 font-mono">{row.itemKode}</td>
                      <td className="px-3 py-1.5 text-gray-700 font-mono">{row.warehouseKode}</td>
                      <td className="px-3 py-1.5 text-gray-600">{row.tanggalMasuk || '-'}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-gray-800">
                        {formatNumber(row.qty)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-700">
                        Rp {formatNumber(row.biayaSatuan)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold text-gray-900">
                        Rp {formatNumber(row.qty * row.biayaSatuan)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">{row.catatan || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleExecuteImport}
                disabled={loading || parseErrors.length > 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Memproses Impor...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Mulai Eksekusi Impor Saldo Awal
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Result Section */}
      {importResult && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3">
            {importResult.statusRekonsiliasi === 'RECONCILED' ? (
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900">{importResult.message}</h2>
              <p className="text-xs text-gray-500">
                {importResult.jumlahBarisDiimpor} baris barang berhasil dicatat ke subledger persediaan per {importResult.asOfDate}.
              </p>
            </div>
          </div>

          {/* Reconciliation Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase">Akun Kontrol GL</span>
              <div className="text-sm font-bold text-gray-900 mt-1">
                {importResult.inventoryControlAccount.kode} - {importResult.inventoryControlAccount.nama}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase">Saldo Buku Besar (GL)</span>
              <div className="text-lg font-bold text-gray-900 mt-1">
                Rp {formatNumber(importResult.currentGlBalance)}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase">Total Subledger Diimpor</span>
              <div className="text-lg font-bold text-indigo-600 mt-1">
                Rp {formatNumber(importResult.totalImportedSubledger)}
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                importResult.statusRekonsiliasi === 'RECONCILED'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <span className="text-xs font-semibold uppercase">
                {importResult.statusRekonsiliasi === 'RECONCILED' ? 'Status: MATCH (Reconciled)' : 'Selisih Rekonsiliasi'}
              </span>
              <div className="text-lg font-bold mt-1">
                Rp {formatNumber(importResult.selisih)}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 leading-relaxed">
            <span className="font-semibold text-gray-900 block mb-1">Keterangan Sistem:</span>
            {importResult.keterangan}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            {onNavigateToStock && (
              <button
                onClick={onNavigateToStock}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Package className="w-4 h-4 text-indigo-600" />
                Lihat Master Barang
              </button>
            )}
            {onNavigateToReports && (
              <button
                onClick={onNavigateToReports}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Lihat Laporan Valuasi & Kartu Stok
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

