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

interface ArOpeningBalancePageProps {
  currentTenant: Tenant | null;
  onNavigateToInvoices?: () => void;
  onNavigateToReports?: () => void;
}

interface ParsedInvoiceRow {
  noDokumen: string;
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
  arControlAccount: {
    kode: string;
    nama: string;
  };
  currentGlBalance: number;
  totalImportedSubledger: number;
  selisih: number;
  statusRekonsiliasi: 'RECONCILED' | 'SELISIH';
  keterangan: string;
  jumlahFakturDiimpor: number;
}

export const ArOpeningBalancePage: React.FC<ArOpeningBalancePageProps> = ({
  currentTenant,
  onNavigateToInvoices,
  onNavigateToReports,
}) => {
  const [asOfDate, setAsOfDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [csvText, setCsvText] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedInvoiceRow[]>([]);
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

  // Download contoh CSV template
  const handleDownloadTemplate = () => {
    const header = 'noDokumen,tanggal,jatuhTempo,partnerKode,saldo,mata_uang,kurs,catatan,externalRef\n';
    const sample = `INV-LEGACY-001,2026-01-15,2026-02-15,CUST-001,5000000,${currentTenant?.mata_uang || 'IDR'},1,Saldo awal PT Maju,LEG-01\nINV-LEGACY-002,2026-01-20,2026-02-20,CUST-002,3500000,${currentTenant?.mata_uang || 'IDR'},1,Saldo awal CV Berkah,LEG-02`;
    const blob = new Blob([header + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = currentTenant?.nama_perusahaan ? currentTenant.nama_perusahaan.replace(/\s+/g, '_').toLowerCase() : 'tenant';
    link.setAttribute('download', `template_saldo_awal_piutang_${safeName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse CSV string into rows
  const parseCSV = (content: string) => {
    const lines = content.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length <= 1) {
      setParsedRows([]);
      setParseErrors(['File CSV minimal memiliki baris header dan 1 baris data.']);
      return;
    }

    const errors: string[] = [];
    const rows: ParsedInvoiceRow[] = [];

    // Baca header
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const expectedHeaders = ['nodokumen', 'tanggal', 'jatuhtempo', 'partnerkode', 'saldo'];
    const missingHeaders = expectedHeaders.filter((eh) => !headers.includes(eh));
    if (missingHeaders.length > 0) {
      errors.push(`Header wajib belum ada: ${missingHeaders.join(', ')}`);
      setParseErrors(errors);
      setParsedRows([]);
      return;
    }

    const idxNoDok = headers.indexOf('nodokumen');
    const idxTgl = headers.indexOf('tanggal');
    const idxJt = headers.indexOf('jatuhtempo');
    const idxPart = headers.indexOf('partnerkode');
    const idxSaldo = headers.indexOf('saldo');
    const idxMataUang = headers.indexOf('mata_uang');
    const idxKurs = headers.indexOf('kurs');
    const idxCatatan = headers.indexOf('catatan');
    const idxExt = headers.indexOf('externalref');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));

      const noDok = cols[idxNoDok];
      const tgl = cols[idxTgl];
      const jt = cols[idxJt];
      const part = cols[idxPart];
      const rawSaldo = cols[idxSaldo];
      const saldo = parseFloat(rawSaldo);

      if (!noDok || !tgl || !jt || !part || isNaN(saldo) || saldo <= 0) {
        errors.push(`Baris ${i + 1}: Data tidak valid atau saldo <= 0.`);
        continue;
      }

      const mu = idxMataUang >= 0 && cols[idxMataUang] ? cols[idxMataUang] : (currentTenant?.mata_uang || 'IDR');
      const kurs = idxKurs >= 0 && parseFloat(cols[idxKurs]) > 0 ? parseFloat(cols[idxKurs]) : 1;
      const catatan = idxCatatan >= 0 ? cols[idxCatatan] : undefined;
      const externalRef = idxExt >= 0 ? cols[idxExt] : undefined;

      rows.push({
        noDokumen: noDok,
        tanggal: tgl,
        jatuhTempo: jt,
        partnerKode: part,
        saldo,
        mata_uang: mu,
        kurs,
        catatan,
        externalRef,
      });
    }

    setParseErrors(errors);
    setParsedRows(rows);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      parseCSV(text);
    };
    reader.readAsText(file);
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

  const totalSaldoSubledger = parsedRows.reduce((sum, r) => sum + r.saldo * r.kurs, 0);

  const handleExecuteImport = async () => {
    if (!currentTenant) return;
    if (parsedRows.length === 0) {
      setErrorMsg('Tidak ada baris faktur valid untuk diimpor.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.importArOpeningBalance(currentTenant.id, {
        asOfDate,
        invoices: parsedRows,
      });
      setImportResult(res);
      setParsedRows([]);
      setCsvText('');
    } catch (err: any) {
      console.error('Gagal impor saldo awal AR:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat memproses impor saldo awal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <UploadCloud className="w-7 h-7 text-indigo-400" />
            Impor Saldo Awal Piutang (AR)
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Inisialisasi faktur-faktur outstanding go-live ke Subledger Piutang untuk{' '}
            <span className="text-indigo-300 font-semibold">{currentTenant?.nama_perusahaan}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
        >
          <Download className="w-4 h-4 text-indigo-400" />
          Download Template CSV
        </button>
      </div>

      {/* Info Card / Pedoman Konseptual */}
      <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-800/40 text-slate-300 text-xs leading-relaxed space-y-2">
        <div className="flex items-center gap-2 font-semibold text-indigo-300 text-sm">
          <Info className="w-4 h-4 text-indigo-400" />
          Aturan Rekonsiliasi & Migrasi Saldo Awal
        </div>
        <p>
          Faktur saldo awal akan dibuat dengan status <span className="font-bold text-white">POSTED</span>{' '}
          <span className="text-amber-300">tanpa membentuk jurnal GL baru</span>, karena saldo akun kontrol Piutang (AR_CONTROL) telah dibentuk melalui Jurnal Saldo Awal Neraca sebelumnya.
        </p>
        <p>
          Sistem akan memverifikasi bahwa total saldo faktur yang diimpor sesuai (balance) dengan saldo akun GL{' '}
          <span className="font-semibold text-white">AR_CONTROL</span> per tanggal go-live yang dipilih.
        </p>
      </div>

      {/* Hasil Impor Banner (Jika Baru Selesai) */}
      {importResult && (
        <div
          className={`p-5 rounded-2xl border ${
            importResult.statusRekonsiliasi === 'RECONCILED'
              ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
              : 'bg-amber-950/30 border-amber-800/50 text-amber-200'
          } space-y-4 animate-in fade-in`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {importResult.statusRekonsiliasi === 'RECONCILED' ? (
                <FileCheck className="w-6 h-6 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              )}
              <div>
                <h3 className="font-bold text-white text-base">
                  {importResult.message}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tanggal Cut-Off / Go-Live: {importResult.asOfDate} &bull; Akun Kontrol:{' '}
                  {importResult.arControlAccount.kode} - {importResult.arControlAccount.nama}
                </p>
              </div>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                importResult.statusRekonsiliasi === 'RECONCILED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {importResult.statusRekonsiliasi === 'RECONCILED' ? 'RECONCILED (Cocok)' : 'ADA SELISIH GL'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            <div>
              <div className="text-slate-400">Faktur Berhasil:</div>
              <div className="text-white font-bold text-sm mt-0.5">
                {importResult.jumlahFakturDiimpor} Faktur
              </div>
            </div>
            <div>
              <div className="text-slate-400">Total Subledger:</div>
              <div className="text-indigo-300 font-bold font-mono text-sm mt-0.5">
                {currentTenant?.mata_uang} {formatNumber(importResult.totalImportedSubledger)}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Saldo Akun GL (AR_CONTROL):</div>
              <div className="text-white font-bold font-mono text-sm mt-0.5">
                {currentTenant?.mata_uang} {formatNumber(importResult.currentGlBalance)}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Selisih Rekonsiliasi:</div>
              <div
                className={`font-bold font-mono text-sm mt-0.5 ${
                  Math.abs(importResult.selisih) < 0.01 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {currentTenant?.mata_uang} {formatNumber(importResult.selisih)}
              </div>
            </div>
          </div>

          <p className="text-xs">{importResult.keterangan}</p>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
            {onNavigateToInvoices && (
              <button
                type="button"
                onClick={onNavigateToInvoices}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <span>Buka Daftar Faktur Penjualan</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {onNavigateToReports && (
              <button
                type="button"
                onClick={onNavigateToReports}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <span>Buka Laporan Umur Piutang</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="px-3 py-1.5 bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-medium transition-colors"
            >
              Tutup Ringkasan
            </button>
          </div>
        </div>
      )}

      {/* Form Input File & CSV */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Tanggal Cut-Off / Go-Live (As-Of Date) *
            </label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Tanggal validasi saldo GL buku besar akun AR_CONTROL.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Upload File CSV Saldo Awal
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer bg-slate-950 rounded-xl border border-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Text Area CSV Paste */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Atau Salin / Tempel Konten CSV di Bawah:</span>
            <span className="text-[11px] text-slate-500 font-normal">
              Header: noDokumen,tanggal,jatuhTempo,partnerKode,saldo,mata_uang,kurs,catatan,externalRef
            </span>
          </label>
          <textarea
            rows={5}
            value={csvText}
            onChange={handleTextChange}
            placeholder={`noDokumen,tanggal,jatuhTempo,partnerKode,saldo,mata_uang,kurs,catatan,externalRef\nINV-001,2026-01-10,2026-02-10,CUST-001,15000000,IDR,1,Saldo invoice lama,EXT-01`}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Error Notif */}
        {parseErrors.length > 0 && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-rose-300 text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              Peringatan Parsing Format CSV:
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              {parseErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Tabel Pratinjau Baris Faktur */}
      {parsedRows.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden space-y-3 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
                Pratinjau Data Faktur Saldo Awal ({parsedRows.length} Baris)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Periksa kelengkapan dan nilai saldo sebelum memproses eksekusi impor.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block">Total Nilai Subledger:</span>
                <span className="text-base font-bold text-indigo-300 font-mono">
                  {currentTenant?.mata_uang} {formatNumber(totalSaldoSubledger)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={loading || parsedRows.length === 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mulai Impor Saldo Awal</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 text-slate-400 uppercase tracking-wider border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">No Dokumen</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Jatuh Tempo</th>
                  <th className="py-2.5 px-3">Kode Pelanggan</th>
                  <th className="py-2.5 px-3">Mata Uang</th>
                  <th className="py-2.5 px-3 text-right">Kurs</th>
                  <th className="py-2.5 px-3 text-right">Saldo</th>
                  <th className="py-2.5 px-3 text-right">Saldo Fungsional</th>
                  <th className="py-2.5 px-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {parsedRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 font-mono font-medium text-white">{r.noDokumen}</td>
                    <td className="py-2 px-3 font-mono">{r.tanggal}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">{r.jatuhTempo}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-indigo-300">
                        {r.partnerKode}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono">{r.mata_uang}</td>
                    <td className="py-2 px-3 text-right font-mono">{r.kurs}</td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-white">
                      {formatNumber(r.saldo)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-indigo-300">
                      {formatNumber(r.saldo * r.kurs)}
                    </td>
                    <td className="py-2 px-3 text-slate-400 truncate max-w-xs">{r.catatan || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
