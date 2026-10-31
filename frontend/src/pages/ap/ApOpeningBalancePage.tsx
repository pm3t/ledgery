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
} from 'lucide-react';
import { api, Tenant } from '../../services/api';
import { readExcelFile, exportToExcel, formatExcelDate } from '../../utils/excelUtils';

interface ApOpeningBalancePageProps {
  currentTenant: Tenant | null;
  onNavigateToBills?: () => void;
  onNavigateToReports?: () => void;
}

interface ParsedBillRow {
  noDokumen: string;
  noFakturVendor?: string;
  tanggal: string;
  jatuhTempo: string;
  partnerKode: string;
  saldo: number;
  mata_uang: string;
  kurs: number;
  catatan?: string;
  externalRef?: string;
}

interface ImportResult {
  message: string;
  asOfDate: string;
  apControlAccount: {
    kode: string;
    nama: string;
  };
  currentGlBalance: number;
  totalImportedSubledger: number;
  selisih: number;
  statusRekonsiliasi: 'RECONCILED' | 'SELISIH';
  keterangan: string;
  jumlahTagihanDiimpor: number;
}

export const ApOpeningBalancePage: React.FC<ApOpeningBalancePageProps> = ({
  currentTenant,
  onNavigateToBills,
  onNavigateToReports,
}) => {
  const [asOfDate, setAsOfDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [csvText, setCsvText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedBillRow[]>([]);
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

  // Unduh template Excel (.xlsx)
  const handleDownloadTemplate = () => {
    const headers = [
      'noDokumen',
      'noFakturVendor',
      'tanggal',
      'jatuhTempo',
      'partnerKode',
      'saldo',
      'mata_uang',
      'kurs',
      'catatan',
      'externalRef',
    ];
    const sampleRows = [
      headers,
      [
        'BILL-LEG-001',
        'VND-INV-9901',
        '2026-01-10',
        '2026-02-10',
        'VND-001',
        7500000,
        currentTenant?.mata_uang || 'IDR',
        1,
        'Saldo awal PT Sumber Makmur',
        'PO-LEG-01',
      ],
      [
        'BILL-LEG-002',
        'INV-XYZ-552',
        '2026-01-18',
        '2026-02-18',
        'VND-002',
        4200000,
        currentTenant?.mata_uang || 'IDR',
        1,
        'Saldo awal CV Mitra Abadi',
        'PO-LEG-02',
      ],
    ];

    const safeName = currentTenant?.nama_perusahaan
      ? currentTenant.nama_perusahaan.replace(/\s+/g, '_').toLowerCase()
      : 'tenant';
    exportToExcel(sampleRows, `template_saldo_awal_hutang_${safeName}.xlsx`, 'Saldo Awal Hutang');
  };

  // Proses data baris dari Excel (array of arrays)
  const processRawRows = (rawRows: any[][]) => {
    if (rawRows.length <= 1) {
      setParsedRows([]);
      setParseErrors(['File Excel minimal memiliki baris header dan 1 baris data.']);
      return;
    }

    const errors: string[] = [];
    const rows: ParsedBillRow[] = [];

    const headers = rawRows[0].map((h: any) =>
      String(h || '').trim().toLowerCase().replace(/[\s_\-]/g, '')
    );

    const expectedHeaders = ['nodokumen', 'tanggal', 'jatuhtempo', 'partnerkode', 'saldo'];
    const missingHeaders = expectedHeaders.filter((eh) => !headers.includes(eh));
    if (missingHeaders.length > 0) {
      errors.push(`Header kolom wajib belum ditemukan: ${missingHeaders.join(', ')}`);
      setParseErrors(errors);
      setParsedRows([]);
      return;
    }

    const idxNoDok = headers.indexOf('nodokumen');
    const idxNoFakturVendor = headers.findIndex((h: string) => h === 'nofakturvendor' || h === 'fakturvendor');
    const idxTgl = headers.indexOf('tanggal');
    const idxJt = headers.indexOf('jatuhtempo');
    const idxPartner = headers.indexOf('partnerkode');
    const idxSaldo = headers.indexOf('saldo');
    const idxMataUang = headers.findIndex((h: string) => h === 'matauang' || h === 'currency');
    const idxKurs = headers.indexOf('kurs');
    const idxCatatan = headers.findIndex((h: string) => h === 'catatan' || h === 'keterangan' || h === 'note');
    const idxExtRef = headers.findIndex((h: string) => h === 'externalref' || h === 'refeksternal');

    for (let i = 1; i < rawRows.length; i++) {
      const cols = rawRows[i];
      if (!cols || cols.length === 0 || cols.every((c: any) => c === '' || c === undefined || c === null)) {
        continue;
      }

      const noDokumen = String(cols[idxNoDok] || '').trim();
      const noFakturVendor = idxNoFakturVendor >= 0 && cols[idxNoFakturVendor] ? String(cols[idxNoFakturVendor]).trim() : undefined;
      const rawTgl = cols[idxTgl];
      const rawJt = cols[idxJt];
      const tanggal = formatExcelDate(rawTgl);
      const jatuhTempo = formatExcelDate(rawJt);
      const partnerKode = String(cols[idxPartner] || '').trim();
      const rawSaldo = typeof cols[idxSaldo] === 'number'
        ? cols[idxSaldo]
        : parseFloat(String(cols[idxSaldo] || '').replace(/[^0-9.-]/g, ''));
      const saldo = Number(rawSaldo);

      if (!noDokumen || !tanggal || !jatuhTempo || !partnerKode || isNaN(saldo) || saldo <= 0) {
        errors.push(`Baris ${i + 1}: Data tidak valid atau saldo <= 0 (${noDokumen || 'Tanpa No Dokumen'}).`);
        continue;
      }

      const mata_uang = idxMataUang >= 0 && cols[idxMataUang]
        ? String(cols[idxMataUang]).trim().toUpperCase()
        : (currentTenant?.mata_uang || 'IDR');
      const rawKurs = idxKurs >= 0 ? Number(cols[idxKurs]) : 1;
      const kurs = !isNaN(rawKurs) && rawKurs > 0 ? rawKurs : 1;
      const catatan = idxCatatan >= 0 && cols[idxCatatan] ? String(cols[idxCatatan]).trim() : undefined;
      const externalRef = idxExtRef >= 0 && cols[idxExtRef] ? String(cols[idxExtRef]).trim() : undefined;

      rows.push({
        noDokumen,
        noFakturVendor,
        tanggal,
        jatuhTempo,
        partnerKode,
        saldo,
        mata_uang,
        kurs,
        catatan,
        externalRef,
      });
    }

    setParseErrors(errors);
    setParsedRows(rows);
  };

  // Upload file Excel / spreadsheet
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setErrorMsg(null);
    setImportResult(null);

    try {
      const rows = await readExcelFile(file);
      processRawRows(rows);
    } catch (err: any) {
      console.error('Gagal membaca file Excel:', err);
      setParseErrors([`Gagal membaca file Excel: ${err.message || 'Format tidak didukung'}`]);
    }
  };

  // Parse CSV string jika user mengetik/menempel teks
  const parseCSV = (content: string) => {
    const lines = content.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
    const rawRows = lines.map((l) => l.split(',').map((c) => c.trim().replace(/^["']|["']$/g, '')));
    processRawRows(rawRows);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setCsvText(text);
    if (text.trim()) {
      parseCSV(text);
    } else {
      setParsedRows([]);
      setParseErrors([]);
    }
  };

  // Submit Import
  const handleExecuteImport = async () => {
    if (!currentTenant) return;
    if (parsedRows.length === 0) {
      setErrorMsg('Tidak ada baris tagihan yang valid untuk diimpor.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setImportResult(null);

    try {
      const payload = {
        asOfDate,
        bills: parsedRows.map((r) => ({
          noDokumen: r.noDokumen,
          noFakturVendor: r.noFakturVendor,
          tanggal: r.tanggal,
          jatuhTempo: r.jatuhTempo,
          partnerKode: r.partnerKode,
          saldo: r.saldo,
          mata_uang: r.mata_uang,
          kurs: r.kurs,
          catatan: r.catatan,
          externalRef: r.externalRef,
        })),
      };

      const res = await api.importApOpeningBalance(currentTenant.id, payload);
      setImportResult(res);
      setParsedRows([]);
      setCsvText('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengimpor saldo awal hutang');
    } finally {
      setLoading(false);
    }
  };

  const totalSaldoSubledger = parsedRows.reduce((acc, curr) => acc + curr.saldo * curr.kurs, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-emerald-600" />
            Impor Saldo Awal Hutang (AP Opening Balance)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Migrasi daftar tagihan hutang vendor beredar dari sistem lama tanpa membuat jurnal GL ganda, sekaligus memverifikasi rekonsiliasi terhadap saldo akun kontrol hutang.
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm shadow-sm transition-all"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Unduh Template Excel (.xlsx)
        </button>
      </div>

      {/* Info Alert Box */}
      <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 space-y-1">
          <p className="font-semibold">Ketentuan Impor Saldo Awal Sub Ledger:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              Tagihan yang diimpor melalui fitur ini berstatus <strong>POSTED</strong> (atau <strong>PARTIAL</strong> jika saldo &lt; total) dan <strong>TIDAK membuat jurnal umum baru</strong>, karena saldo GL hutang seharusnya sudah dicatat saat setup Neraca Awal tenant.
            </li>
            <li>
              Kode vendor (<strong>partnerKode</strong>) harus sudah terdaftar pada master Data Partner.
            </li>
            <li>
              Sistem akan secara otomatis membandingkan total saldo tagihan yang diimpor dengan saldo GL akun kontrol hutang (<strong>AP_CONTROL</strong>) per tanggal posisi yang ditentukan.
            </li>
          </ul>
        </div>
      </div>

      {/* Hasil Rekonsiliasi Setelah Impor */}
      {importResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              {importResult.statusRekonsiliasi === 'RECONCILED' ? (
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-full">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2 bg-amber-100 text-amber-700 rounded-full">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {importResult.statusRekonsiliasi === 'RECONCILED'
                    ? 'Saldo Awal Hutang Berhasil Diimpor & Ter-rekonsiliasi Sempurna'
                    : 'Saldo Awal Berhasil Diimpor, Ditemukan Selisih Rekonsiliasi'}
                </h3>
                <p className="text-xs text-slate-500">{importResult.keterangan}</p>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                importResult.statusRekonsiliasi === 'RECONCILED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {importResult.statusRekonsiliasi}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">Akun Kontrol Hutang</span>
              <span className="font-bold text-slate-800 text-sm">
                {importResult.apControlAccount.kode} - {importResult.apControlAccount.nama}
              </span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">Saldo Akun GL (Buku Besar)</span>
              <span className="font-bold text-slate-800 text-sm font-mono">
                {currentTenant?.mata_uang} {formatNumber(importResult.currentGlBalance)}
              </span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">Total Tagihan Sub Ledger Diimpor</span>
              <span className="font-bold text-emerald-600 text-sm font-mono">
                {currentTenant?.mata_uang} {formatNumber(importResult.totalImportedSubledger)}
              </span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500 block">Selisih Rekonsiliasi</span>
              <span
                className={`font-bold text-sm font-mono ${
                  importResult.selisih === 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {currentTenant?.mata_uang} {formatNumber(importResult.selisih)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            {onNavigateToBills && (
              <button
                onClick={onNavigateToBills}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                Lihat Faktur Pembelian <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {onNavigateToReports && (
              <button
                onClick={onNavigateToReports}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5"
              >
                Buka Laporan Umur Hutang <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Form Input CSV */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tanggal Posisi Saldo Awal (Cut-off Date) <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
              <span>Pilih Berkas Excel (.xlsx / .xls)</span>
              {uploadedFileName && (
                <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {uploadedFileName} ({parsedRows.length} baris)
                </span>
              )}
            </label>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="w-full text-xs text-slate-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer border border-slate-200 rounded-lg p-1"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Atau Tempel (Paste) Konten CSV di Sini:
          </label>
          <textarea
            rows={5}
            value={csvText}
            onChange={handleTextChange}
            placeholder="noDokumen,noFakturVendor,tanggal,jatuhTempo,partnerKode,saldo,mata_uang,kurs,catatan,externalRef"
            className="w-full p-3 font-mono text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Error Messages */}
        {parseErrors.length > 0 && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> Ditemukan {parseErrors.length} kesalahan format:
            </div>
            <ul className="list-disc pl-5 max-h-32 overflow-y-auto space-y-0.5">
              {parseErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Preview Tabel Tagihan yang Akan Diimpor */}
        {parsedRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Pratinjau Data Tagihan ({parsedRows.length} Baris Siap Diimpor)
                </h4>
              </div>
              <div className="text-xs font-bold text-slate-800">
                Total Saldo: {currentTenant?.mata_uang} {formatNumber(totalSaldoSubledger)}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                  <tr>
                    <th className="py-2 px-3">No. Dokumen</th>
                    <th className="py-2 px-3">No. Faktur Vendor</th>
                    <th className="py-2 px-3">Tanggal</th>
                    <th className="py-2 px-3">Jatuh Tempo</th>
                    <th className="py-2 px-3">Kode Vendor</th>
                    <th className="py-2 px-3 text-right">Saldo Tagihan</th>
                    <th className="py-2 px-3 text-right">Kurs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {parsedRows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold text-slate-800">{r.noDokumen}</td>
                      <td className="py-2 px-3 text-slate-600">{r.noFakturVendor || '-'}</td>
                      <td className="py-2 px-3 text-slate-600">{r.tanggal}</td>
                      <td className="py-2 px-3 text-slate-600">{r.jatuhTempo}</td>
                      <td className="py-2 px-3 text-emerald-700 font-semibold">{r.partnerKode}</td>
                      <td className="py-2 px-3 text-right text-slate-800 font-semibold">
                        {r.mata_uang} {formatNumber(r.saldo)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">{r.kurs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={loading || parseErrors.length > 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-medium text-xs rounded-xl shadow-sm transition-all"
              >
                <UploadCloud className="w-4 h-4" />
                {loading ? 'Mengimpor Saldo Awal...' : `Proses Impor ${parsedRows.length} Tagihan`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

