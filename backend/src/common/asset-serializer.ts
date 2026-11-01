/**
 * Utility untuk sanitasi data Aset Tetap di sisi server (Server-Side Serialization).
 * Memastikan peran PETUGAS_ASET sama sekali tidak dapat melihat informasi finansial
 * (harga perolehan, nilai residu, akumulasi penyusutan, nilai buku, tarif penyusutan, akun GL, dsb),
 * melainkan hanya field operasional fisik (nomor aset, nama, lokasi, kategori, penanggung jawab, spesifikasi).
 */

export const FINANCIAL_ASSET_FIELDS = [
  'hargaPerolehan',
  'hargaPerolehanAsli',
  'acquisitionCost',
  'kurs',
  'mata_uang',
  'nilaiResidu',
  'nilaiResiduNominal',
  'nilaiResiduPersen',
  'salvageValue',
  'akumulasiPenyusutan',
  'akumulasiKomersial',
  'akumulasiFiskal',
  'accumulatedDepreciation',
  'nilaiBuku',
  'nilaiTercatat',
  'nilaiSisaBukuFiskal',
  'fiskalSisaBuku',
  'fiskalLabaRugi',
  'bookValue',
  'tarifPenyusutan',
  'depreciationRate',
  'metodePenyusutan',
  'depreciationMethod',
  'faktorSaldoMenurun',
  'akunAset',
  'akunAkumulasi',
  'akunBebanPenyusutan',
  'fakturPembelian',
  'purchaseBillId',
  'journalId',
  'journal',
  'costAdditions',
  'depreciationEntries',
  'impairments',
  'disposals',
] as const;

/**
 * Menyaring objek aset tunggal atau array aset agar bebas dari field finansial jika pemanggil adalah PETUGAS_ASET.
 */
export function sanitizeAssetForRole<T extends Record<string, any>>(
  data: T[],
  role?: string,
): T[];
export function sanitizeAssetForRole<T extends Record<string, any>>(
  data: T,
  role?: string,
): T;
export function sanitizeAssetForRole<T extends Record<string, any>>(
  data: T | T[],
  role?: string,
): T | T[] {
  if (role !== 'PETUGAS_ASET' || !data) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => stripFinancialFields(item));
  }

  return stripFinancialFields(data);
}

function stripFinancialFields<T extends Record<string, any>>(item: T): T {
  if (!item || typeof item !== 'object') return item;
  const clone = { ...item } as any;
  for (const field of FINANCIAL_ASSET_FIELDS) {
    delete clone[field];
  }
  if (clone.category && typeof clone.category === 'object') {
    const cat = { ...clone.category };
    delete cat.nilaiResiduNominal;
    delete cat.nilaiResiduPersen;
    delete cat.faktorSaldoMenurun;
    delete cat.akunAset;
    delete cat.akunAkumulasi;
    delete cat.akunBeban;
    delete cat.akunCip;
    delete cat.akunRugiPenurunanNilai;
    delete cat.akunAkumPenurunanNilai;
    delete cat.akunLabaPelepasan;
    delete cat.akunRugiPelepasan;
    delete cat.akunRugiPenghapusan;
    clone.category = cat;
  }
  return clone;
}
