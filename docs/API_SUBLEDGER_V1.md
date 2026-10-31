# Dokumentasi API Sub Ledger Ledgery (v1)
*Panduan Integrasi Aplikasi Eksternal: DigiSale (POS & Sales), Cultiva (Agri-ERP & Inventory), Servio (Service & Billing)*

---

## 1. Ikhtisar & Prinsip Arsitektur
API Sub Ledger Ledgery v1 dirancang untuk menerima transaksi operasional secara real-time dari aplikasi lini bisnis, menghasilkan pencatatan Buku Besar Pembantu (Piutang, Hutang, Persediaan), dan secara otomatis membukukan Jurnal Umum (General Ledger) berimbang melalui akun kontrol yang terkunci dari pencatatan manual.

### Prinsip Utama:
1. **Idempotensi Kuat:** Kirimkan `idempotencyKey` unik (UUID / No Transaksi Unik Sumber) pada payload atau header `X-Idempotency-Key` untuk mencegah duplikasi jurnal saat retry jaringan.
2. **Audit Lengkap:** Setiap request ke `/v1/...` dicatat dalam `IntegrationLog` mencakup status code, versi API, timestamp, dan payload ringkas.
3. **Resolusi External Reference:** Anda dapat menggunakan `partnerId` internal Ledgery atau `externalRef` (kode pelanggan/vendor dari DigiSale/Cultiva).
4. **Multicurrency & Dimensi:** Mendukung mata uang dokumen (misal USD, SGD) dengan kurs konversi ke mata uang fungsional tenant (misal IDR). Setiap baris mendukung tag dimensi (Departemen, Proyek, Cabang).

---

## 2. Autentikasi & Header Standar

| Header | Wajib | Keterangan |
|---|---|---|
| `X-API-Key` | Ya | API Key terdaftar pada tenant di Ledgery |
| `Content-Type` | Ya | `application/json` |
| `X-Idempotency-Key` | Opsional | UUID unik (dapat diletakkan di header atau field body) |

---

## 3. Modul AR: Piutang Usaha (DigiSale / Servio)

### 3.1 Buat Faktur Penjualan (Sales Invoice)
Mencatat faktur penjualan, mengakui piutang pada akun kontrol `AR_CONTROL`, pendapatan, dan PPN Keluaran. Jika baris berupa barang STOK, otomatis memicu issue persediaan dan pengakuan HPP.

- **Method:** `POST`
- **Endpoint:** `/v1/ar/invoices` atau `/subledger/ar/invoices/:tenantId`

#### Contoh Payload (Multicurrency, Diskon, PPN, Dimensi, & Stok):
```json
{
  "tenantId": "c4b77d61-397a-40a8-b64d-91b7d30f7821",
  "externalRef": "DIGISALE-INV-2026-10-0981",
  "idempotencyKey": "9d554a72-fdbb-4b19-9ce7-598218179471",
  "tanggal": "2026-10-31",
  "jatuhTempo": "2026-11-30",
  "partnerExternalRef": "CUST-CULTIVA-001",
  "mata_uang": "USD",
  "kurs": 15850,
  "sumberAplikasi": "DigiSale POS",
  "catatan": "Penjualan ekspor benih sawit varietas unggul",
  "lines": [
    {
      "itemId": "itm-benih-sawit-dxp",
      "deskripsi": "Benih Kelapa Sawit DxP Unggul (Batch Okt-2026)",
      "qty": 50,
      "hargaSatuan": 12.50,
      "diskon": 25.00,
      "ppnRate": 0.11,
      "dimensions": {
        "Departemen": "Perkebunan",
        "Wilayah": "Sumatera Bagian Utara"
      }
    },
    {
      "deskripsi": "Jasa Inspeksi & Sertifikasi Karantina",
      "qty": 1,
      "hargaSatuan": 100.00,
      "diskon": 0,
      "ppnRate": 0.11,
      "dimensions": {
        "Departemen": "Kepatuhan & Sertifikasi"
      }
    }
  ],
  "autoPost": true
}
```

#### Contoh Response Berhasil (HTTP 201 Created):
```json
{
  "statusCode": 201,
  "message": "Faktur Penjualan berhasil dibuat dan diposting",
  "data": {
    "id": "inv_01ha930f7b...",
    "noDokumen": "INV/2026/10/0042",
    "status": "POSTED",
    "subtotal": 700.00,
    "totalDiskon": 25.00,
    "totalPpn": 77.00,
    "total": 777.00,
    "saldo": 777.00,
    "mata_uang": "USD",
    "kurs": 15850,
    "journal": {
      "id": "jrn_01ha930f8c...",
      "no_voucher": "JU-2026-10-0115",
      "total_debit": 12315450,
      "total_kredit": 12315450
    },
    "postedAt": "2026-10-31T04:45:00.000Z",
    "postedBy": "system-api"
  }
}
```

---

### 3.2 Alokasi Penerimaan Piutang (Customer Receipt & Allocation)
Mencatat pelunasan faktur oleh pelanggan, mendebit Kas/Bank, mengkredit `AR_CONTROL`, dan otomatis menghitung selisih kurs terealisasi (*realized FX gain/loss*) jika kurs bayar berbeda dengan kurs faktur.

- **Method:** `POST`
- **Endpoint:** `/v1/ar/receipts` atau `/subledger/ar/receipts/:tenantId`

#### Contoh Payload Alokasi Multi-Faktur:
```json
{
  "tenantId": "c4b77d61-397a-40a8-b64d-91b7d30f7821",
  "externalRef": "DIGISALE-RCT-2026-10-041",
  "idempotencyKey": "rct-alloc-938210381029",
  "tanggal": "2026-10-31",
  "partnerExternalRef": "CUST-CULTIVA-001",
  "akunKasBankId": "acc-bca-giro-usd",
  "mata_uang": "USD",
  "kurs": 16000,
  "jumlah": 777.00,
  "allocations": [
    {
      "invoiceId": "inv_01ha930f7b...",
      "jumlahAlokasi": 777.00
    }
  ],
  "autoPost": true
}
```

#### Aturan Realized FX Gain/Loss:
- Nilai faktur saat dicatat: $777 \times 15.850 = \text{Rp } 12.315.450$
- Nilai penerimaan saat dicairkan: $777 \times 16.000 = \text{Rp } 12.432.000$
- Jurnal otomatis menghasilkan:
  - **Dr Kas/Bank (USD)** = Rp 12.432.000
  - **Cr Piutang Usaha (AR_CONTROL)** = Rp 12.315.450
  - **Cr Keuntungan Selisih Kurs Terealisasi (FX_GAIN_LOSS)** = Rp 116.550

---

## 4. Modul AP: Hutang Usaha (Cultiva / Servio)

### 4.1 Buat Tagihan Vendor (Purchase Bill)
- **Method:** `POST`
- **Endpoint:** `/v1/ap/bills` atau `/subledger/ap/bills/:tenantId`

#### Contoh Payload (Dengan Nomor Faktur Pajak Masukan):
```json
{
  "tenantId": "c4b77d61-397a-40a8-b64d-91b7d30f7821",
  "externalRef": "CULTIVA-PBILL-2026-889",
  "idempotencyKey": "pbill-idem-0029318",
  "noFakturVendor": "FAK-SUPP-19280",
  "nomorFakturPajakMasukan": "010.002-26.89201923",
  "tanggal": "2026-10-31",
  "jatuhTempo": "2026-11-20",
  "partnerExternalRef": "VEND-PUPUK-SRIWIJAYA",
  "mata_uang": "IDR",
  "kurs": 1,
  "lines": [
    {
      "itemId": "itm-pupuk-urea-50kg",
      "deskripsi": "Pupuk Urea Non-Subsidi 50kg",
      "qty": 100,
      "hargaSatuan": 350000,
      "diskon": 500000,
      "ppnRate": 0.11,
      "dimensions": {
        "Gudang": "Gudang Utama Medan",
        "Departemen": "Logistik & Sarana"
      }
    }
  ],
  "autoPost": true
}
```

---

## 5. Modul Order Management & Penerimaan Barang (Goods Receipt)

### 5.1 Pencatatan Goods Receipt (GR)
Pencatatan fisik barang masuk dari vendor. Jurnal mengakui:
- **Dr Persediaan (INVENTORY)** senilai barang diterima
- **Cr Barang Diterima Belum Ditagih (GR_IR_CLEARING)**

Saat Purchase Bill ditagihkan kemudian terhadap GR ini:
- **Dr Barang Diterima Belum Ditagih (GR_IR_CLEARING)**
- **Cr Hutang Usaha (AP_CONTROL)**

- **Method:** `POST`
- **Endpoint:** `/order-management/goods-receipts/:tenantId`

#### Contoh Payload GR:
```json
{
  "externalRef": "CULTIVA-GR-2026-1002",
  "idempotencyKey": "gr-cultiva-091283",
  "tanggal": "2026-10-31",
  "partnerExternalRef": "VEND-PUPUK-SRIWIJAYA",
  "warehouseId": "wh-gudang-pupuk-medan",
  "lines": [
    {
      "itemId": "itm-pupuk-urea-50kg",
      "qty": 100,
      "biayaSatuan": 345000,
      "dimensions": {
        "Departemen": "Perkebunan"
      }
    }
  ],
  "autoPost": true
}
```

---

## 6. Endpoint Audit & Rekonsiliasi Sub Ledger

### 6.1 Audit Rekonsiliasi Sub Ledger vs GL
Memeriksa saldo Buku Besar versus saldo rincian dokumen subledger untuk tanggal yang diminta. Digunakan oleh auditor dan modul penutupan buku.

- **Method:** `GET`
- **Endpoint:** `/subledger/reconciliation/:tenantId?tanggal=YYYY-MM-DD`

#### Contoh Response:
```json
{
  "tanggal": "2026-10-31",
  "isFullyReconciled": true,
  "totalSelisihAbsolut": 0,
  "setting": {
    "arEnabled": true,
    "apEnabled": true,
    "inventoryEnabled": true,
    "orderManagementEnabled": true,
    "blockPeriodCloseOnRecon": true
  },
  "accounts": {
    "ar": {
      "controlType": "AR",
      "account": { "kode": "1103.01", "nama": "Piutang Usaha IDR" },
      "glBalance": 125000000,
      "subledgerBalance": 125000000,
      "selisih": 0,
      "status": "OK",
      "drillDown": {
        "summary": { "totalOrphanDocs": 0, "totalRawJournals": 0, "totalRawJournalValue": 0 }
      }
    },
    "ap": {
      "controlType": "AP",
      "account": { "kode": "2101.01", "nama": "Hutang Usaha IDR" },
      "glBalance": 45000000,
      "subledgerBalance": 45000000,
      "selisih": 0,
      "status": "OK"
    },
    "inventory": {
      "controlType": "INVENTORY",
      "account": { "kode": "1105.01", "nama": "Persediaan Barang Dagang" },
      "glBalance": 89000000,
      "subledgerBalance": 89000000,
      "selisih": 0,
      "status": "OK"
    },
    "grIrClearing": {
      "controlType": "GR_IR_CLEARING",
      "account": { "kode": "2104.01", "nama": "Barang Diterima Belum Ditagih" },
      "glBalance": 15000000,
      "subledgerBalance": 15000000,
      "selisih": 0,
      "status": "OK"
    }
  }
}
```

### 6.2 Ringkasan Dashboard Akuntan
- **Method:** `GET`
- **Endpoint:** `/subledger/dashboard-summary/:tenantId`

---

## 7. Status Code & Penanganan Error

| Status | Kode Error | Deskripsi / Solusi |
|---|---|---|
| `201` | `CREATED` | Transaksi berhasil dibuat dan diposting ke subledger & GL |
| `400` | `PERIOD_CLOSE_BLOCKED_ON_RECONCILIATION` | Penutupan periode ditolak karena masih ada selisih saldo GL vs subledger |
| `400` | `DIRECT_POSTING_NOT_ALLOWED` | Upaya membuat jurnal manual langsung ke akun kontrol (AR/AP/Inventory) ditolak |
| `409` | `IDEMPOTENCY_CONFLICT` | `idempotencyKey` telah diproses sebelumnya dengan payload identik atau berbeda |
| `404` | `PARTNER_NOT_FOUND` | Mitra bisnis tidak ditemukan berdasarkan `partnerId` atau `externalRef` |

