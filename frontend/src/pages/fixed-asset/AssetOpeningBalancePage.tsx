import React, { useState, useEffect } from 'react';
import {
  api,
  AssetCategory,
  ChartOfAccount,
} from '../../services/api';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HelpCircle,
  Package,
  Layers,
} from 'lucide-react';
import { readExcelFile, exportToExcel, formatExcelDate } from '../../utils/excelUtils';

interface ParsedAssetItem {
  noAset: string;
  nama: string;
  kategoriKode: string;
  tanggalPerolehan: string;
  tanggalMulaiDigunakan?: string;
  hargaPerolehan: number;
  akumulasiPenyusutanKomersial: number;
  akumulasiPenyusutanFiskal: number;
  sisaUmurBulan?: number;
  tagCode?: string;
  isValid: boolean;
  error?: string;
}

interface AssetOpeningBalancePageProps {
  currentTenant?: any;
}

export const AssetOpeningBalancePage: React.FC<AssetOpeningBalancePageProps> = ({ currentTenant }) => {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [trialBalances, setTrialBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [parsedRows, setParsedRows] = useState<ParsedAssetItem[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [catsRes, coaRes] = await Promise.all([
        api.getAssetCategories(),
        api.getCoa(),
      ]);
      setCategories(Array.isArray(catsRes) ? catsRes : []);
      setAccounts(Array.isArray(coaRes) ? coaRes : []);

      // Ambil saldo buku besar GL saat ini untuk rekonsiliasi
      if (currentTenant?.id) {
        const tbRes = await api.getTrialBalance(currentTenant.id);
        const map: Record<string, number> = {};
        if (tbRes && Array.isArray(tbRes.items)) {
          tbRes.items.forEach((item: any) => {
            map[item.coa.id] = item.saldo;
          });
        }
        setTrialBalances(map);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal memuat master data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Download template Excel
  const handleDownloadTemplate = () => {
    const headers = [
      'No Aset',
      'Nama Aset',
      'Kode Kategori',
      'Tanggal Perolehan (YYYY-MM-DD)',
      'Tanggal Mulai Digunakan (YYYY-MM-DD)',
      'Harga Perolehan',
      'Akumulasi Penyusutan Komersial',
      'Akumulasi Penyusutan Fiskal',
      'Sisa Umur (Bulan)',
      'Tag Code (Opsional)',
    ];

    const sampleRows = [
      [
        'AST-0001',
        'Laptop Dell Latitude 7420 (Direktur)',
        categories[0]?.kode || 'KOMPUTER',
        '2024-01-15',
        '2024-01-15',
        22500000,
        5625000,
        5625000,
        36,
        'TAG-DELL-01',
      ],
      [
        'AST-0002',
        'Kendaraan Toyota Avanza 1.5G',
        categories[1]?.kode || 'KENDARAAN',
        '2023-06-10',
        '2023-06-10',
        260000000,
        65000000,
        65000000,
        68,
        'TAG-AVANZA-02',
      ],
    ];

    exportToExcel([headers, ...sampleRows], 'Template_Saldo_Awal_Aset_Tetap.xlsx', 'Saldo Awal Aset');
  };

  // Upload dan parse Excel file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setMsg(null);

    try {
      const data = await readExcelFile(file);
      if (data.length <= 1) {
        setMsg({ type: 'error', text: 'File Excel tidak memiliki baris data.' });
        return;
      }

      // Baris pertama adalah header
      const rows = data.slice(1);
      const categoryMap = new Map(categories.map((c) => [c.kode.toUpperCase(), c]));

      const parsed: ParsedAssetItem[] = rows
        .filter((r) => r.length > 1 && r[0] !== '')
        .map((row, idx) => {
          const noAset = String(row[0] || '').trim();
          const nama = String(row[1] || '').trim();
          const kategoriKode = String(row[2] || '').trim().toUpperCase();
          const tglPerolehan = formatExcelDate(row[3]);
          const tglMulai = formatExcelDate(row[4]) || tglPerolehan;
          const harga = Number(row[5]) || 0;
          const akumulasiKomersial = Number(row[6]) || 0;
          const akumulasiFiskal = Number(row[7]) || 0;
          const sisaUmur = row[8] !== '' && row[8] !== undefined ? Number(row[8]) : undefined;
          const tagCode = row[9] ? String(row[9]).trim() : undefined;

          let isValid = true;
          let error = '';

          if (!noAset) {
            isValid = false;
            error = 'No Aset wajib diisi';
          } else if (!nama) {
            isValid = false;
            error = 'Nama Aset wajib diisi';
          } else if (!kategoriKode || !categoryMap.has(kategoriKode)) {
            isValid = false;
            error = `Kategori "${kategoriKode}" tidak ditemukan`;
          } else if (!tglPerolehan) {
            isValid = false;
            error = 'Tanggal perolehan tidak valid';
          } else if (harga <= 0) {
            isValid = false;
            error = 'Harga perolehan harus > 0';
          }

          return {
            noAset,
            nama,
            kategoriKode,
            tanggalPerolehan: tglPerolehan,
            tanggalMulaiDigunakan: tglMulai,
            hargaPerolehan: harga,
            akumulasiPenyusutanKomersial: akumulasiKomersial,
            akumulasiPenyusutanFiskal: akumulasiFiskal,
            sisaUmurBulan: sisaUmur,
            tagCode,
            isValid,
            error,
          };
        });

      setParsedRows(parsed);
    } catch (err: any) {
      setMsg({ type: 'error', text: `Gagal membaca file Excel: ${err.message}` });
    }
  };

  // Simpan Saldo Awal Aset
  const handleSubmit = async () => {
    const invalidRows = parsedRows.filter((r) => !r.isValid);
    if (invalidRows.length > 0) {
      setMsg({
        type: 'error',
        text: `Terdapat ${invalidRows.length} baris tidak valid. Mohon perbaiki data sebelum mengimpor.`,
      });
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const items = parsedRows.map((r) => ({
        noAset: r.noAset,
        nama: r.nama,
        kategoriKode: r.kategoriKode,
        tanggalPerolehan: r.tanggalPerolehan,
        tanggalMulaiDigunakan: r.tanggalMulaiDigunakan,
        hargaPerolehan: r.hargaPerolehan,
        akumulasiPenyusutanKomersial: r.akumulasiPenyusutanKomersial,
        akumulasiPenyusutanFiskal: r.akumulasiPenyusutanFiskal,
        sisaUmurBulan: r.sisaUmurBulan,
        tagCode: r.tagCode,
      }));

      const res = await api.importAssetOpeningBalance({ items });
      setMsg({
        type: 'success',
        text: `Sukses mengimpor ${res.importedCount || items.length} kartu saldo awal aset tetap!`,
      });
      setParsedRows([]);
      setFileName('');
      await loadInitialData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal mengimpor saldo awal aset' });
    } finally {
      setSubmitting(false);
    }
  };

  // Kalkulasi total per kategori untuk perbandingan dengan GL
  const categoryTotals = categories.map((cat) => {
    const catRows = parsedRows.filter((r) => r.kategoriKode === cat.kode.toUpperCase());
    const totalHarga = catRows.reduce((acc, r) => acc + (r.hargaPerolehan || 0), 0);
    const totalAkumulasi = catRows.reduce((acc, r) => acc + (r.akumulasiPenyusutanKomersial || 0), 0);
    const glSaldoAset = trialBalances[cat.akunAsetId] || 0;
    const glSaldoAkumulasi = Math.abs(trialBalances[cat.akunAkumulasiId] || 0);

    const selisihHarga = totalHarga - glSaldoAset;
    const selisihAkumulasi = totalAkumulasi - glSaldoAkumulasi;

    return {
      category: cat,
      count: catRows.length,
      totalHarga,
      totalAkumulasi,
      glSaldoAset,
      glSaldoAkumulasi,
      selisihHarga,
      selisihAkumulasi,
      isReconciled: parsedRows.length === 0 || (selisihHarga === 0 && selisihAkumulasi === 0),
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#142820] flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-emerald-700" />
            Impor Saldo Awal Aset Tetap (Excel)
          </h2>
          <p className="text-xs text-[#556c5e] mt-1">
            Impor data historis aset tetap berjalan menggunakan spreadsheet Excel (.xlsx). Perekaman saldo awal membentuk kartu aset berstatus AKTIF tanpa membuat jurnal GL ganda.
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#cbdcd0] hover:bg-[#edf2ea] text-emerald-800 text-xs font-bold rounded-xl shadow-sm transition-all"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
          Unduh Template Excel (.xlsx)
        </button>
      </div>

      {/* Info Banner Penting */}
      <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 text-xs flex items-start gap-3 shadow-sm">
        <HelpCircle className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-emerald-900">Aturan Penting Saldo Awal Aset Tetap</div>
          <p className="text-emerald-900/90 leading-relaxed">
            Pencatatan saldo awal aset tetap <strong>TIDAK membuat jurnal buku besar baru</strong> karena mengasumsikan nilai akun harga perolehan dan akumulasi penyusutan sudah dicatat pada jurnal pembuka / neraca awal tenant. Modul ini melakukan validasi rekonsiliasi antara total nilai subledger aset dan saldo akun kontrol GL bersangkutan.
          </p>
        </div>
      </div>

      {/* Alert Notifikasi */}
      {msg && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-medium animate-in fade-in ${
            msg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-700" />
            )}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
      )}

      {/* Dropzone Upload Excel */}
      <div className="bg-white border-2 border-dashed border-[#cbdcd0] hover:border-emerald-600 rounded-2xl p-8 text-center transition-colors">
        <div className="max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-[#142820]">
            Pilih atau seret file Excel (.xlsx / .xls)
          </div>
          <p className="text-xs text-[#556c5e]">
            Pastikan kolom pada Excel sesuai dengan urutan pada template resmi Ledgery.
          </p>

          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl cursor-pointer shadow-sm transition-all hover:scale-[1.02]">
            <UploadCloud className="w-4 h-4" />
            Pilih File Spreadsheet Excel
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {fileName && (
            <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
              File terpilih: <strong>{fileName}</strong> ({parsedRows.length} baris terdeteksi)
            </div>
          )}
        </div>
      </div>

      {/* Ringkasan Indikator Validasi & Rekonsiliasi GL */}
      {parsedRows.length > 0 && (
        <div className="bg-white border border-[#cbdcd0] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#edf2ea]">
            <div className="font-bold text-[#142820] text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              Indikator Rekonsiliasi Subledger vs Saldo GL per Kategori
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#edf2ea] text-[#142820] border border-[#cbdcd0]">
              Total {parsedRows.length} Aset
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {categoryTotals
              .filter((ct) => ct.count > 0 || ct.glSaldoAset > 0)
              .map((ct) => (
                <div
                  key={ct.category.id}
                  className={`p-3 rounded-xl border text-xs space-y-2 ${
                    ct.isReconciled
                      ? 'bg-[#f7faf6] border-[#cbdcd0]'
                      : 'bg-amber-50/70 border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#142820]">
                      {ct.category.kode} ({ct.count} unit)
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ct.isReconciled
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-amber-200 text-amber-900 border border-amber-400'
                      }`}
                    >
                      {ct.isReconciled ? 'Cocok (Reconciled)' : 'Perlu Disesuaikan'}
                    </span>
                  </div>

                  <div className="space-y-1 font-mono text-[11px] text-slate-700">
                    <div className="flex justify-between">
                      <span>Subledger Perolehan:</span>
                      <span className="font-bold">{ct.totalHarga.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Saldo Akun GL Aset:</span>
                      <span>{ct.glSaldoAset.toLocaleString('id-ID')}</span>
                    </div>
                    {ct.selisihHarga !== 0 && (
                      <div className="flex justify-between text-rose-600 font-bold">
                        <span>Selisih Perolehan:</span>
                        <span>{ct.selisihHarga.toLocaleString('id-ID')}</span>
                      </div>
                    )}

                    <div className="pt-1 border-t border-slate-200 flex justify-between">
                      <span>Subledger Akumulasi:</span>
                      <span className="font-bold">{ct.totalAkumulasi.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Saldo Akun GL Akumulasi:</span>
                      <span>{ct.glSaldoAkumulasi.toLocaleString('id-ID')}</span>
                    </div>
                    {ct.selisihAkumulasi !== 0 && (
                      <div className="flex justify-between text-rose-600 font-bold">
                        <span>Selisih Akumulasi:</span>
                        <span>{ct.selisihAkumulasi.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tabel Pratinjau Baris Aset */}
      {parsedRows.length > 0 && (
        <div className="bg-white border border-[#cbdcd0] rounded-2xl overflow-hidden shadow-sm space-y-3">
          <div className="p-4 border-b border-[#edf2ea] flex items-center justify-between">
            <span className="font-bold text-[#142820] text-xs">
              Pratinjau Data Saldo Awal ({parsedRows.filter((r) => r.isValid).length} Valid, {parsedRows.filter((r) => !r.isValid).length} Tidak Valid)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setParsedRows([])}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || parsedRows.some((r) => !r.isValid)}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {submitting ? 'Mengimpor...' : 'Simpan & Terapkan Saldo Awal'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#eaf1e8] text-[#142e20] uppercase tracking-wider border-b border-[#cbdcd0] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">No Aset</th>
                  <th className="py-2.5 px-3">Nama Aset</th>
                  <th className="py-2.5 px-3">Kategori</th>
                  <th className="py-2.5 px-3">Tgl Perolehan</th>
                  <th className="py-2.5 px-3 text-right">Harga Perolehan</th>
                  <th className="py-2.5 px-3 text-right">Akum. Komersial</th>
                  <th className="py-2.5 px-3 text-right">Akum. Fiskal</th>
                  <th className="py-2.5 px-3 text-right">Sisa Umur</th>
                  <th className="py-2.5 px-3">Tag Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2ea]">
                {parsedRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-[#f7faf6] ${
                      !row.isValid ? 'bg-rose-50/50' : ''
                    }`}
                  >
                    <td className="py-2 px-3">
                      {row.isValid ? (
                        <span className="inline-flex items-center gap-1 text-emerald-800 font-bold text-[10px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Siap
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-800 font-bold text-[10px]" title={row.error}>
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> {row.error}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-[#142820]">{row.noAset}</td>
                    <td className="py-2 px-3 font-semibold text-[#142820]">{row.nama}</td>
                    <td className="py-2 px-3 text-slate-700">{row.kategoriKode}</td>
                    <td className="py-2 px-3 text-slate-700">{row.tanggalPerolehan}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-[#142820]">
                      {row.hargaPerolehan.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700">
                      {row.akumulasiPenyusutanKomersial.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700">
                      {row.akumulasiPenyusutanFiskal.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700">
                      {row.sisaUmurBulan !== undefined ? `${row.sisaUmurBulan} bln` : '-'}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600">{row.tagCode || '-'}</td>
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
