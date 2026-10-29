import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// =====================================================
// Helper Utilitas Export Laporan Keuangan
// Mendukung format Excel (.xlsx) dan PDF (via browser print)
// =====================================================

// Format angka ke format Rupiah yang rapi untuk Excel
function formatCurrency(amount: number): number {
  return Math.round(amount);
}

// Fungsi header standar laporan
function createHeaderRows(judulLaporan: string, namaPerusahaan: string, periode: string) {
  return [
    [namaPerusahaan],
    [judulLaporan],
    [periode],
    [], // baris kosong
  ];
}

// =====================================================
// EXPORT EXCEL — Neraca Saldo (Trial Balance)
// =====================================================
export function exportTrialBalanceToExcel(
  data: any,
  namaPerusahaan: string,
  startDate: string,
  endDate: string
) {
  const wb = XLSX.utils.book_new();
  const periode = `Periode: ${new Date(startDate).toLocaleDateString('id-ID')} s/d ${new Date(endDate).toLocaleDateString('id-ID')}`;

  const rows: any[][] = [
    ...createHeaderRows('NERACA SALDO', namaPerusahaan, periode),
    ['Kode Akun', 'Nama Akun', 'Kategori', 'Debit', 'Kredit'],
  ];

  for (const item of data.accounts || []) {
    rows.push([
      item.kode_akun,
      item.nama_akun,
      item.kategori,
      item.debit > 0 ? formatCurrency(item.debit) : '',
      item.kredit > 0 ? formatCurrency(item.kredit) : '',
    ]);
  }

  // Baris Total
  rows.push([]);
  rows.push(['', 'TOTAL', '', formatCurrency(data.totalDebit || 0), formatCurrency(data.totalKredit || 0)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Neraca Saldo');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `neraca-saldo_${startDate}_${endDate}.xlsx`);
}

// =====================================================
// EXPORT EXCEL — Neraca (Balance Sheet)
// =====================================================
export function exportBalanceSheetToExcel(data: any, namaPerusahaan: string, tanggal: string) {
  const wb = XLSX.utils.book_new();
  const periode = `Per Tanggal: ${new Date(tanggal).toLocaleDateString('id-ID')}`;

  const rows: any[][] = [
    ...createHeaderRows('NERACA (BALANCE SHEET)', namaPerusahaan, periode),
    ['Kelompok', 'Nama Akun', 'Saldo'],
  ];

  const addSection = (label: string, items: any[]) => {
    rows.push([label, '', '']);
    for (const item of items || []) {
      rows.push(['', item.nama_akun, formatCurrency(item.saldo)]);
    }
    const total = (items || []).reduce((s: number, i: any) => s + i.saldo, 0);
    rows.push(['', `Total ${label}`, formatCurrency(total)]);
    rows.push([]);
  };

  addSection('ASET', data.aset);
  addSection('LIABILITAS', data.liabilitas);
  addSection('EKUITAS', data.ekuitas);

  rows.push(['', 'TOTAL LIABILITAS + EKUITAS', formatCurrency((data.totalLiabilitas || 0) + (data.totalEkuitas || 0))]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 35 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Neraca');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `neraca_${tanggal}.xlsx`);
}

// =====================================================
// EXPORT EXCEL — Laba Rugi (Income Statement)
// =====================================================
export function exportIncomeStatementToExcel(
  data: any,
  namaPerusahaan: string,
  startDate: string,
  endDate: string
) {
  const wb = XLSX.utils.book_new();
  const periode = `Periode: ${new Date(startDate).toLocaleDateString('id-ID')} s/d ${new Date(endDate).toLocaleDateString('id-ID')}`;
  const hasCompare = !!data.comparative;

  const rows: any[][] = [
    ...createHeaderRows('LAPORAN LABA RUGI', namaPerusahaan, periode),
    hasCompare
      ? ['Nama Akun', 'Periode Ini', 'Periode Pembanding', 'Selisih']
      : ['Nama Akun', 'Jumlah'],
  ];

  const addSection = (label: string, items: any[], compItems?: any[]) => {
    rows.push([label]);
    for (let i = 0; i < (items || []).length; i++) {
      const item = items[i];
      const compItem = compItems?.[i];
      if (hasCompare) {
        const selisih = (item.saldo || 0) - (compItem?.saldo || 0);
        rows.push(['  ' + item.nama_akun, formatCurrency(item.saldo), formatCurrency(compItem?.saldo || 0), formatCurrency(selisih)]);
      } else {
        rows.push(['  ' + item.nama_akun, formatCurrency(item.saldo)]);
      }
    }
    const total = (items || []).reduce((s: number, i: any) => s + i.saldo, 0);
    const compTotal = (compItems || []).reduce((s: number, i: any) => s + i.saldo, 0);
    if (hasCompare) {
      rows.push([`Total ${label}`, formatCurrency(total), formatCurrency(compTotal), formatCurrency(total - compTotal)]);
    } else {
      rows.push([`Total ${label}`, formatCurrency(total)]);
    }
    rows.push([]);
  };

  addSection('PENDAPATAN', data.pendapatan, data.comparative?.pendapatan);
  addSection('BEBAN', data.beban, data.comparative?.beban);

  rows.push([]);
  if (hasCompare) {
    rows.push(['LABA / RUGI BERSIH', formatCurrency(data.labaRugiBersih), formatCurrency(data.comparative?.labaRugiBersih || 0), formatCurrency((data.labaRugiBersih || 0) - (data.comparative?.labaRugiBersih || 0))]);
  } else {
    rows.push(['LABA / RUGI BERSIH', formatCurrency(data.labaRugiBersih)]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Laba Rugi');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `laba-rugi_${startDate}_${endDate}.xlsx`);
}

// =====================================================
// EXPORT EXCEL — Arus Kas (Cash Flow)
// =====================================================
export function exportCashFlowToExcel(
  data: any,
  namaPerusahaan: string,
  startDate: string,
  endDate: string
) {
  const wb = XLSX.utils.book_new();
  const periode = `Periode: ${new Date(startDate).toLocaleDateString('id-ID')} s/d ${new Date(endDate).toLocaleDateString('id-ID')}`;

  const rows: any[][] = [
    ...createHeaderRows('LAPORAN ARUS KAS', namaPerusahaan, periode),
    ['Keterangan', 'Jumlah (Rp)'],
  ];

  const addCashSection = (label: string, items: any[], total: number) => {
    rows.push([label, '']);
    for (const item of items || []) {
      rows.push(['  ' + item.label, formatCurrency(item.jumlah)]);
    }
    rows.push([`  Total ${label}`, formatCurrency(total)]);
    rows.push([]);
  };

  addCashSection('AKTIVITAS OPERASI', data.operasi?.items, data.operasi?.total || 0);
  addCashSection('AKTIVITAS INVESTASI', data.investasi?.items, data.investasi?.total || 0);
  addCashSection('AKTIVITAS PENDANAAN', data.pendanaan?.items, data.pendanaan?.total || 0);

  rows.push(['KENAIKAN / PENURUNAN KAS BERSIH', formatCurrency(data.netCashFlow || 0)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Arus Kas');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `arus-kas_${startDate}_${endDate}.xlsx`);
}

// =====================================================
// EXPORT EXCEL — Analisa Per Dimensi (Matrix Pivot)
// =====================================================
export function exportDimensionAnalysisToExcel(
  data: any,
  namaPerusahaan: string,
  tipeSaldo: string,
  startDate: string,
  endDate: string,
  dimensionName: string
) {
  const wb = XLSX.utils.book_new();
  const periode = tipeSaldo === 'AS_OF' 
    ? `As Of: ${new Date(endDate).toLocaleDateString('id-ID')}`
    : `Mutasi: ${new Date(startDate).toLocaleDateString('id-ID')} s/d ${new Date(endDate).toLocaleDateString('id-ID')}`;

  const headerColumns = [
    'Kode Akun',
    'Nama Akun',
    'Kategori',
    ...data.columns.map((c: any) => `${c.kode} - ${c.nama}`),
    ...(data.hasUnassigned ? ['Tanpa Dimensi'] : []),
    'Total',
  ];

  const rows: any[][] = [
    ...createHeaderRows(`ANALISA PER DIMENSI (${dimensionName.toUpperCase()})`, namaPerusahaan, periode),
    headerColumns,
  ];

  for (const item of data.rows || []) {
    const rowValues = [
      item.coa.kode_akun,
      item.coa.nama_akun,
      item.coa.kategori,
      ...data.columns.map((c: any) => formatCurrency(item.values[c.id] || 0)),
      ...(data.hasUnassigned ? [formatCurrency(item.values['UNASSIGNED'] || 0)] : []),
      formatCurrency(item.total || 0),
    ];
    rows.push(rowValues);
  }

  // Baris Total
  const totalRow = [
    'TOTAL',
    '',
    '',
    ...data.columns.map((c: any) => formatCurrency(data.columnTotals[c.id] || 0)),
    ...(data.hasUnassigned ? [formatCurrency(data.columnTotals['UNASSIGNED'] || 0)] : []),
    formatCurrency(data.grandTotal || 0),
  ];
  rows.push(totalRow);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Analisa Dimensi');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([wbout], { type: 'application/octet-stream' }),
    `Analisa_Dimensi_${dimensionName.replace(/\s+/g, '_')}_${endDate}.xlsx`
  );
}

// =====================================================
// EXPORT PDF — Menggunakan browser print dialog
// Meng-clone section laporan ke iframe tersembunyi, lalu trigger print
// =====================================================
export function exportToPdf(reportElementId: string, judulLaporan: string) {
  const el = document.getElementById(reportElementId);
  if (!el) {
    alert('Elemen laporan tidak ditemukan. Pastikan laporan sudah dimuat terlebih dahulu.');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Popup diblokir. Izinkan popup untuk halaman ini agar bisa mencetak PDF.');
    return;
  }

  // Ambil semua stylesheet dari halaman utama dan sertakan di window print
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(el => el.outerHTML)
    .join('\n');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${judulLaporan}</title>
        ${styles}
        <style>
          /* Override tema gelap ke terang untuk print */
          body { background: white !important; color: black !important; font-family: Arial, sans-serif; }
          .bg-slate-900, .bg-slate-950, .bg-slate-800 { background: white !important; }
          .text-white, .text-slate-200, .text-slate-300, .text-slate-400 { color: black !important; }
          .border-slate-800, .border-slate-700 { border-color: #ccc !important; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 6px 10px; font-size: 11px; }
          th { background: #f0f0f0; font-weight: bold; }
          @media print {
            @page { margin: 15mm; }
          }
        </style>
      </head>
      <body>
        ${el.innerHTML}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  // Tunggu sampai halaman selesai load sebelum trigger print
  printWindow.onload = () => {
    printWindow.print();
    printWindow.close();
  };
}
