import * as crypto from 'crypto';

/**
 * Utilitas Parser Angka dan Tanggal untuk Rekonsiliasi Bank
 * Mendukung format angka lokal Indonesia ("1.234.567,89") dan internasional ("1,234,567.89")
 * serta format tanggal bervariasi dari file ekspor bank di Indonesia.
 */

/**
 * Parse representasi string / angka menjadi float standar JavaScript.
 * Mendukung desimal koma (Indonesia) maupun titik, tanda kurung negatif, dan akhiran CR/DB.
 */
export function parseIndonesianNumber(
  value: any,
  pemisahDesimal: string = ',',
  pemisahRibuan: string = '.',
): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  let str = String(value).trim();
  if (!str) return 0;

  // Deteksi tanda negatif (misal: "(1.000,00)" atau "-1.000,00")
  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1).trim();
  } else if (str.startsWith('-')) {
    isNegative = true;
    str = str.slice(1).trim();
  }

  // Deteksi akhiran CR (Kredit/Positif) atau DB/DR (Debit/Keluar) jika ada
  if (str.toUpperCase().endsWith('DB') || str.toUpperCase().endsWith('DR')) {
    isNegative = true;
    str = str.replace(/(DB|DR)$/i, '').trim();
  } else if (str.toUpperCase().endsWith('CR')) {
    str = str.replace(/CR$/i, '').trim();
  }

  // Hapus karakter non-digit selain pemisah desimal dan ribuan
  str = str.replace(/[^\d.,]/g, '');

  if (pemisahDesimal === ',') {
    // Format Indonesia: 1.234.567,89 -> hapus titik ribuan, ganti koma dengan titik
    str = str.split(pemisahRibuan).join('');
    str = str.replace(',', '.');
  } else {
    // Format Internasional: 1,234,567.89 -> hapus koma ribuan
    str = str.split(pemisahRibuan).join('');
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : Math.abs(num);
}

/**
 * Parse nilai tanggal bervariasi (Excel serial, DD/MM/YYYY, YYYY-MM-DD, dsb.)
 */
export function parseFlexibleDate(value: any, formatString?: string): Date {
  if (!value) {
    return new Date();
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }

  // Handle Excel Serial Number (misal: 45567)
  if (typeof value === 'number' || (!isNaN(Number(value)) && String(value).trim().length <= 6)) {
    const serial = Number(value);
    if (serial > 30000 && serial < 60000) {
      // Excel epoch dimulai 30 Desember 1899 (dengan bug tahun kabisat 1900)
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const dateInMs = excelEpoch.getTime() + serial * 86400000;
      return new Date(dateInMs);
    }
  }

  const str = String(value).trim();

  // Pola YYYY-MM-DD atau YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const dt = new Date(Date.UTC(y, m, d));
    if (!isNaN(dt.getTime())) return dt;
  }

  // Pola DD/MM/YYYY atau DD-MM-YYYY atau DD.MM.YYYY
  const idMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (idMatch) {
    const d = parseInt(idMatch[1], 10);
    const m = parseInt(idMatch[2], 10) - 1;
    const y = parseInt(idMatch[3], 10);
    const dt = new Date(Date.UTC(y, m, d));
    if (!isNaN(dt.getTime())) return dt;
  }

  // Nama bulan bahasa Indonesia atau Inggris (misal: "15 Jan 2026", "20 Oktober 2026")
  const idMonthMap: Record<string, number> = {
    jan: 0, januari: 0, january: 0,
    feb: 1, februari: 1, february: 1,
    mar: 2, maret: 2, march: 2,
    apr: 3, april: 3,
    mei: 4, may: 4,
    jun: 5, juni: 5, june: 5,
    jul: 6, juli: 6, july: 6,
    agu: 7, ags: 7, agustus: 7, august: 7,
    sep: 8, september: 8,
    okt: 9, oktober: 9, october: 9,
    nov: 10, november: 10,
    des: 11, desember: 11, december: 11,
  };

  const textMatch = str.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
  if (textMatch) {
    const d = parseInt(textMatch[1], 10);
    const mStr = textMatch[2].toLowerCase();
    const y = parseInt(textMatch[3], 10);
    const m = idMonthMap[mStr];
    if (m !== undefined) {
      const dt = new Date(Date.UTC(y, m, d));
      if (!isNaN(dt.getTime())) return dt;
    }
  }

  // Fallback standar JS Date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return new Date();
}

/**
 * Menghasilkan SHA-256 dedupeHash unik untuk setiap baris rekening koran.
 * Unik per rekening: hash dari tanggal (YYYY-MM-DD) + nominal (debit/kredit) + keterangan + referensi + saldo.
 */
export function generateDedupeHash(
  cashBankAccountId: string,
  tanggal: Date,
  debit: number,
  kredit: number,
  keterangan: string,
  referensi?: string | null,
  saldo?: number | null,
): string {
  const dateStr = tanggal.toISOString().slice(0, 10);
  const debitStr = Number(debit || 0).toFixed(2);
  const kreditStr = Number(kredit || 0).toFixed(2);
  const ketClean = (keterangan || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const refClean = (referensi || '').trim().toLowerCase();
  const saldoStr = saldo !== undefined && saldo !== null ? Number(saldo).toFixed(2) : 'NONE';

  const payload = `${cashBankAccountId}|${dateStr}|D:${debitStr}|K:${kreditStr}|${ketClean}|${refClean}|${saldoStr}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

