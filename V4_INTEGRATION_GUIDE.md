# Panduan Integrasi Lintas-Modul V4 & Dokumentasi API Publik V1

Dokumen ini berisi spesifikasi teknis dan panduan integrasi sistem eksternal (Rekan HRIS, DigiSale POS/E-Commerce, Cultiva SCM, Servio ERP/Service) ke modul **V4 Ledgery: Kas & Bank dan Aktiva Tetap (Fixed Assets)**.

---

## 1. Panduan Migrasi: Dari Jurnal Mentah ke Dokumen Kas Resmi

### 1.1 Pemetaan Akun Kas/Bank ke Rekening Subledger
Pada Ledgery V4, berlaku prinsip integritas **1 Rekening Kas/Bank : 1 Akun GL bertipe `CASH_BANK`**.
- Sebelum transaksi kas diproses, buat master rekening kas/bank melalui dashboard (`/cash-bank/accounts`) atau seeding database.
- Tentukan mata uang rekening (misal `IDR`, `USD`, `SGD`).
- Akun GL yang dipetakan **TIDAK DIKUNCI** untuk jurnal manual, tetapi setiap mutasi kredit/debit pada akun tersebut akan diaudit oleh mesin rekonsiliasi.

### 1.2 Perilaku Auto-Capture Jurnal Mentah
Untuk integrasi aplikasi lama yang masih memposting langsung ke `/v1/journals` (jurnal umum / raw journal):
- Jika jurnal menyentuh akun GL bertipe `CASH_BANK`, Ledgery secara otomatis melakukan **auto-capture**:
  1. Menemukan rekening `CashBankAccount` yang terikat pada akun GL tersebut.
  2. Menerbitkan entri buku kas `CashBankEntry` (arah `MASUK` untuk Debit, `KELUAR` untuk Kredit) dengan `sourceType = "JOURNAL_CAPTURE"`.
  3. Mengikat `journalEntryId` agar tidak terjadi duplikasi mutasi.
- **Backward Compatibility:** Endpoint `/v1/journals` tetap berfungsi normal tanpa mengubah kode aplikasi lama Anda.

### 1.3 Cara Beralih Menggunakan Dokumen Kas Resmi
Disarankan agar aplikasi eksternal (misal: sistem penggajian Rekan atau POS penjualan tunai) beralih menggunakan endpoint dokumen resmi (`/v1/cash-bank/*`):
- Memiliki validasi nomor rekening, kurs multi-mata uang, dan plafon kas kecil.
- Menghasilkan bukti pengeluaran/penerimaan kas bernomor unik otomatis (`BKK-xxxx`, `BKM-xxxx`, `TRF-xxxx`).
- Menghasilkan jurnal GL dua sisi yang seimbang secara otomatis melalui `SubledgerPostingService`.

---

## 2. Spesifikasi Endpoint & Contoh Payload API V1

Semua request ke `/v1/*` dilindungi oleh header `X-API-Key` dan dicatat secara atomik ke tabel audit `IntegrationLog`.

### 2.1 Pengeluaran Bank untuk Pembayaran Gaji (dari Rekan HRIS)
**Endpoint:** `POST /v1/cash-bank/disbursements`  
**Header:**
```http
Content-Type: application/json
X-API-Key: ledgery_ak_live_xxxxxxxxxxxx
```
**Body:**
```json
{
  "cashBankAccountId": "cba-bca-operasional-id",
  "tanggal": "2026-10-31",
  "penerima": "Seluruh Karyawan (Payroll Rekan HRIS)",
  "keterangan": "Pembayaran Gaji dan Tunjangan Karyawan Periode Oktober 2026",
  "mata_uang": "IDR",
  "lines": [
    {
      "chartOfAccountId": "coa-beban-gaji-id",
      "jumlah": 85000000,
      "keterangan": "Gaji Pokok & Tunjangan Tetap",
      "dimensions": {
        "Cost Center": "DEPT-01"
      }
    },
    {
      "chartOfAccountId": "coa-beban-bpjs-id",
      "jumlah": 7500000,
      "keterangan": "Iuran BPJS Ketenagakerjaan & Kesehatan Pemberi Kerja",
      "dimensions": {
        "Cost Center": "DEPT-01"
      }
    }
  ]
}
```
**Response (201 Created):**
```json
{
  "statusCode": 201,
  "message": "Pengeluaran kas/bank berhasil diposting",
  "data": {
    "id": "cd-2026-0089",
    "noDokumen": "BKK-2026-0042",
    "tanggal": "2026-10-31T00:00:00.000Z",
    "total": 92500000,
    "status": "POSTED",
    "journalId": "jour-2026-0156",
    "noVoucher": "CD-2026-0042"
  }
}
```

---

### 2.2 Transfer Antar Rekening (Pemindahan Dana Bank ke Kas Kecil)
**Endpoint:** `POST /v1/cash-bank/transfers`  
**Body:**
```json
{
  "fromAccountId": "cba-mandiri-giro-id",
  "toAccountId": "cba-kas-kecil-id",
  "tanggal": "2026-11-01",
  "jumlah": 5000000,
  "keterangan": "Pengisian kembali saldo petty cash kantor pusat",
  "biayaTransfer": 2500,
  "akunBiayaTransferId": "coa-beban-adm-bank-id"
}
```
**Response (201 Created):**
```json
{
  "statusCode": 201,
  "message": "Transfer kas berhasil diposting",
  "data": {
    "id": "ct-2026-0012",
    "noDokumen": "TRF-2026-0012",
    "status": "POSTED",
    "journalId": "jour-2026-0157"
  }
}
```

---

### 2.3 Kirim Baris Rekening Koran dari Bank Gateway (Idempoten & Dedupe)
**Endpoint:** `POST /v1/bank-statements/sync`  
**Body:**
```json
{
  "cashBankAccountId": "cba-bca-operasional-id",
  "namaFile": "E-Statement-BCA-20261031.csv",
  "lines": [
    {
      "tanggal": "2026-10-31",
      "keterangan": "TRSF E-BANKING CR DARI DIGISALE",
      "referensi": "REF-9928172",
      "debit": 15000000,
      "kredit": 0,
      "saldo": 325400000
    },
    {
      "tanggal": "2026-10-31",
      "keterangan": "BIAYA ADM REK BULANAN",
      "referensi": "ADM-OKT26",
      "debit": 0,
      "kredit": 25000,
      "saldo": 325375000
    }
  ]
}
```
**Response (200 OK):**
```json
{
  "statusCode": 200,
  "message": "Baris rekening koran berhasil disinkronkan",
  "data": {
    "importedCount": 2,
    "duplicateCount": 0,
    "autoMatchedCount": 1
  }
}
```

---

### 2.4 Registrasi & Pembaruan Aset Tetap (EAM Operasional / Vigilo)
**Endpoint:** `PUT /v1/fixed-assets/:external_ref`  
**Body:**
```json
{
  "categoryId": "cat-kendaraan-id",
  "nama": "Truk Operasional Isuzu Giga (Armada 08)",
  "tagCode": "TAG-TRK-008",
  "tanggalPerolehan": "2026-11-01",
  "hargaPerolehanAsli": 450000000,
  "mata_uang": "IDR",
  "kurs": 1,
  "umurManfaatBulan": 96,
  "nilaiResidu": 50000000,
  "dimensions": {
    "Cost Center": "LOGISTIK",
    "Lokasi": "POOL-BEKASI"
  }
}
```
**Response (200 OK / Idempoten):**
```json
{
  "statusCode": 200,
  "message": "Aset tetap berhasil didaftarkan / diperbarui",
  "data": {
    "id": "fa-2026-0045",
    "noAset": "AST-2026-0045",
    "tagCode": "TAG-TRK-008",
    "status": "AKTIF",
    "statusLabel": "BELUM_DILABEL",
    "hargaPerolehan": 450000000
  }
}
```

---

### 2.5 Pencarian Aset Berdasarkan Tag Barcode / QR
**Endpoint:** `GET /v1/fixed-assets/by-tag/:tag_code`  
**Response (200 OK):**
```json
{
  "statusCode": 200,
  "data": {
    "id": "fa-2026-0045",
    "noAset": "AST-2026-0045",
    "tagCode": "TAG-TRK-008",
    "nama": "Truk Operasional Isuzu Giga (Armada 08)",
    "kategori": "Kendaraan Angkutan",
    "status": "AKTIF",
    "statusLabel": "TERPASANG",
    "dimensions": {
      "Cost Center": "LOGISTIK",
      "Lokasi": "POOL-BEKASI"
    }
  }
}
```
*Catatan Keamanan:* Jika request dipanggil oleh peran `PETUGAS_ASET`, seluruh field finansial (`hargaPerolehan`, `akumulasiKomersial`, `nilaiTercatat`, `journalId`) secara otomatis dihapus dari respon JSON di sisi server.

---

### 2.6 Sesi Verifikasi Fisik & Pemindaian Massal
**Pembuatan Sesi:** `POST /v1/fixed-assets/verification-sessions`  
**Body:**
```json
{
  "nama": "Verifikasi Fisik Aset Lapangan Q4 2026",
  "tanggal": "2026-11-01",
  "cakupan": {
    "lokasi": "POOL-BEKASI"
  }
}
```

**Pemindaian Massal (Batch Scans):** `POST /v1/fixed-assets/verification-sessions/:sessionId/batch-scans`  
**Body:**
```json
{
  "scans": [
    {
      "tagCode": "TAG-TRK-008",
      "lokasiSesi": { "lokasi": "POOL-BEKASI" },
      "device": "Zebra-TC26"
    },
    {
      "tagCode": "TAG-GENSET-01",
      "lokasiSesi": { "lokasi": "POOL-BEKASI" },
      "device": "Zebra-TC26"
    }
  ]
}
```
**Response (200 OK):**
```json
{
  "statusCode": 200,
  "message": "Pemindaian massal berhasil disimpan",
  "data": {
    "totalScanned": 2,
    "ditemukan": 1,
    "lokasiBerbeda": 0,
    "tidakTerdaftar": 1
  }
}
```

---

### 2.7 Pengecekan Status Periode Akuntansi
**Endpoint:** `GET /v1/periods/check?tanggal=2026-11-01`  
**Response (200 OK):**
```json
{
  "statusCode": 200,
  "data": {
    "periodId": "per-2026-11",
    "nomorPeriode": 11,
    "tahunBuku": "2026",
    "status": "OPEN",
    "isLocked": false,
    "tanggalMulai": "2026-11-01T00:00:00.000Z",
    "tanggalSelesai": "2026-11-30T23:59:59.999Z"
  }
}
```

---

## 3. Kebijakan Integritas dan Penutupan Periode (Closing)

Saat penutupan periode akuntansi (`POST /accounting-periods/:id/close`), Ledgery V4 menjalankan 3 lapis validasi audit:
1. **Rekonsiliasi Sub Ledger vs GL:** Memeriksa selisih pada akun AR, AP, Inventory, GR/IR, Kas & Bank, dan Aktiva Tetap.
2. **Rekonsiliasi Bank:** Memeriksa apakah seluruh rekening bank aktif memiliki sesi rekonsiliasi berstatus `SELESAI` per akhir periode.
3. **Proses Penyusutan Aset Tetap:** Memastikan `AssetDepreciationRun` telah diposting untuk periode yang akan ditutup.

*Pemblokiran penutupan periode hanya terjadi apabila setting tenant yang bersangkutan diaktifkan (`blockPeriodCloseOnRecon = true`, `blockPeriodCloseOnBankRecon = true`, atau `blockPeriodCloseOnDepreciation = true`).*

