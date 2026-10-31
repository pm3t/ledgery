import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Normalisasi nilai tanggal dari Excel (bisa berupa serial number, Date, atau string format YYYY-MM-DD / DD/MM/YYYY)
 * menjadi format standar ISO YYYY-MM-DD.
 */
export function formatExcelDate(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Serial date number Excel (hari sejak 1899-12-30)
  if (typeof val === 'number') {
    // 25569 = selisih hari antara 1900-01-01 (dengan bug leap year 1900) dan 1970-01-01
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(val).trim();
  // Format ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Format DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Format YYYY/MM/DD
  const ymdSlash = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) {
    const y = ymdSlash[1];
    const m = ymdSlash[2].padStart(2, '0');
    const d = ymdSlash[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Fallback parsing date string biasa
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return str;
}

/**
 * Membaca file Excel (.xlsx / .xls) atau CSV dan mengembalikan baris-baris data dalam bentuk Array of Arrays (string/number).
 */
export async function readExcelFile(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve([]);
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        // Baca sebagai array of arrays
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
          header: 1,
          defval: '',
          raw: true,
          blankrows: false,
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Membuat dan mengunduh file workbook Excel (.xlsx) dengan kolom dan data sampel/nyata.
 */
export function exportToExcel(
  data: any[][],
  fileName: string,
  sheetName: string = 'Sheet1'
): void {
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Styling / auto-width kolom sederhana
  const colWidths = data[0]?.map((_, colIdx) => {
    let maxLen = 12;
    for (const row of data) {
      const val = row[colIdx];
      if (val !== undefined && val !== null) {
        const len = String(val).length;
        if (len > maxLen) maxLen = Math.min(len + 4, 40);
      }
    }
    return { wch: maxLen };
  });
  if (colWidths) {
    ws['!cols'] = colWidths;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const cleanFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), cleanFileName);
}

