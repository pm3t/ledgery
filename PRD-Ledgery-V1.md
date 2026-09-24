# PRD V1 — Ledgery
### Accounting Engine SaaS (Multi-Tenant, API-First)

---

## 1. Latar Belakang & Tujuan

Bayu (melalui PT. Anugerah Bakti Prima) telah membangun beberapa produk SaaS vertikal — **Cultiva** (agrikultur), **Rekan** (HR/Payroll), **Servio**, dan **DigiSale** (penjualan) — yang masing-masing menghasilkan transaksi bisnis (gaji, penjualan, biaya operasional, dll) namun belum memiliki backend pencatatan akuntansi yang terintegrasi.

**Ledgery** dibangun sebagai **produk accounting SaaS yang berdiri sendiri**, berfungsi sebagai *accounting engine* yang bisa:
1. Menjadi backend akuntansi bagi Cultiva, Rekan, Servio, DigiSale (via integrasi API).
2. Dijual langsung ke UMKM/perusahaan lain sebagai produk pembukuan mandiri, terlepas dari produk ABP lainnya.
3. Menerima integrasi dari aplikasi pihak ketiga mana pun (di luar ekosistem ABP) selama memiliki API key tenant yang valid.

### Tujuan Utama
- Menyediakan pencatatan jurnal, buku besar, dan laporan keuangan standar untuk satu entitas bisnis (tenant).
- Memungkinkan satu tenant menerima input jurnal dari banyak aplikasi sumber sekaligus.
- Menjadi produk yang bisa dijual berdiri sendiri, bukan hanya modul internal.

---

## 2. Target Pengguna

| Segmen | Deskripsi |
|---|---|
| Pelanggan eksisting Cultiva/Rekan/Servio/DigiSale | Perusahaan yang sudah pakai 1+ produk ABP dan ingin pembukuan otomatis dari transaksi yang sudah tercatat di produk tersebut |
| UMKM & perusahaan umum | Pengguna baru yang butuh software akuntansi standalone, tidak harus pakai produk ABP lain |
| Integrator pihak ketiga | Developer/perusahaan lain yang ingin mengintegrasikan sistem mereka ke Ledgery sebagai accounting backend |

---

## 3. Model Tenant & Integrasi

### 3.1 Konsep Tenant
- **1 tenant Ledgery = 1 entitas bisnis (UMKM/perusahaan)**.
- Satu tenant dapat terhubung ke **banyak aplikasi sumber sekaligus** (contoh: perusahaan X berlangganan Rekan *dan* DigiSale → keduanya mengirim jurnal ke tenant Ledgery yang sama).
- Tenant dikelola secara terpusat: setup akun, kode ledger (chart of accounts), dan pengaturan integrasi dilakukan dari dashboard Ledgery.

### 3.2 Model Integrasi API
- **Autentikasi**: 1 API key per tenant. Siapa pun (produk ABP atau aplikasi pihak ketiga) yang memegang API key tenant tersebut dapat mengirim jurnal atas nama tenant itu.
- **Alur pengiriman jurnal**:
  1. Aplikasi sumber (misal Rekan) memiliki pemetaan akun (debit/credit) yang dikonfigurasi sendiri di sisi mereka.
  2. Aplikasi sumber mengirim payload jurnal ke Ledgery via API, menyertakan API key tenant.
  3. Ledgery memvalidasi API key, membuat entri jurnal, dan **auto-generate nomor voucher**.
  4. Jurnal langsung terposting ke buku besar tenant terkait.

**Contoh payload jurnal:**
```json
{
  "tanggal": "2026-09-21",
  "deskripsi": "Gaji September 2026",
  "sumber_aplikasi": "Rekan",
  "entries": [
    { "akun": "600001", "tipe": "debit", "jumlah": 50000000 },
    { "akun": "100001", "tipe": "credit", "jumlah": 50000000 }
  ]
}
```
Response akan menyertakan `no_voucher` yang di-generate otomatis oleh Ledgery.

### 3.3 Batasan V1
- Validasi utama: total debit harus sama dengan total credit (balance check).
- Kode akun (chart of accounts) disiapkan per tenant saat onboarding; aplikasi sumber wajib memakai kode yang sudah terdaftar di tenant tersebut.
- Belum ada validasi semantik lintas-aplikasi (misal deteksi duplikat jurnal dari 2 sumber) — masuk roadmap V2.

### 3.4 Kebijakan Posting (Configurable)
Kebijakan posting jurnal dapat diatur per tenant melalui halaman **Setting**, dengan dua opsi:

1. **Auto-Post** — jurnal yang masuk via API langsung terposting final ke buku besar tenant tanpa tahap approval. Cocok untuk tenant yang mengutamakan kecepatan dan sudah percaya penuh pada validasi otomatis (balance check, akun terdaftar).
2. **Approval/Review Manual** — jurnal yang masuk via API ditampung dulu dalam status **Pending**, menunggu staf akuntansi tenant meninjau dan menyetujui (approve) sebelum resmi terposting ke buku besar. Cocok untuk tenant yang ingin ada kontrol/cek manual sebelum data final tercatat.

**Default value**: Auto-Post (bisa diubah tenant kapan saja dari halaman Setting).

**Implikasi desain**:
- Perlu status jurnal: `Posted` (untuk Auto-Post) dan `Pending` / `Approved` / `Rejected` (untuk Approval Manual).
- Notifikasi ke staf akuntansi tenant saat ada jurnal berstatus Pending yang menunggu approval.
- Riwayat approval (siapa yang approve/reject, kapan, dan alasan jika reject) harus tercatat sebagai audit trail.

### 3.5 Kebijakan Versioning API
- Setiap perubahan besar pada struktur payload jurnal (misal penambahan field baru atau perubahan format) **wajib tetap mendukung versi API sebelumnya untuk sementara waktu**, sehingga integrasi yang sudah berjalan (Rekan, DigiSale, dll) tidak tiba-tiba berhenti berfungsi saat Ledgery diperbarui.
- Pendekatan: endpoint API diberi penanda versi (misal `/v1/journals`, `/v2/journals`), sehingga aplikasi sumber lama dan baru bisa berjalan berdampingan sampai semua integrasi dipindahkan ke versi terbaru.

---

## 4. Ruang Lingkup Fitur V1

### 4.1 Modul Inti (Wajib Ada)

**A. Master Data**
- Chart of Accounts (kode ledger, kategori: Aset, Liabilitas, Ekuitas, Pendapatan, Beban)
- Data tenant/perusahaan (profil, tahun buku, mata uang — default IDR)
- Manajemen API key per tenant (generate, revoke, lihat log penggunaan)

**B. Jurnal & General Ledger**
- Input jurnal manual (dari dashboard, untuk kebutuhan penyesuaian/manual entry)
- Penerimaan jurnal via API dari aplikasi sumber
- Auto-generate nomor voucher (format bisa dikonfigurasi per tenant)
- Buku besar (ledger) per akun — histori mutasi debit/kredit
- Jurnal penyesuaian & jurnal penutup (tutup buku akhir periode)

**C. Laporan Keuangan**
- **Neraca** (Balance Sheet) — per tanggal/periode
- **Laba Rugi** (Income Statement) — per periode (bulanan/tahunan, komparasi antar-periode)
- **Arus Kas** (Cash Flow Statement) — metode langsung/tidak langsung
- **Buku Besar** & **Neraca Saldo** (Trial Balance) sebagai laporan pendukung

**D. Perpajakan Indonesia**
- Perhitungan dasar PPN (Pajak Pertambahan Nilai) atas transaksi penjualan/pembelian
- Perhitungan dasar PPh (terutama PPh 21 untuk payroll, karena terhubung dengan Rekan)
- Rekap pajak periodik sebagai dasar pelaporan (bukan e-filing langsung ke DJP di V1)

**E. Manajemen Multi-Produk**
- Dashboard yang menampilkan aplikasi sumber mana saja yang terhubung ke satu tenant
- Log jurnal masuk per aplikasi sumber (audit trail: jurnal ini dari Rekan, itu dari DigiSale, dst)

**F. Dua Dashboard Terpisah**
- **Dashboard Staf Akuntansi Tenant**: berfokus pada transaksi ledger — input jurnal manual, lihat buku besar, generate laporan keuangan (Neraca, Laba Rugi, Arus Kas), rekap pajak.
- **Dashboard Super Admin ABP**: berfokus pada manajemen tenant — onboarding tenant baru, generate/revoke API key, monitoring aplikasi sumber yang terhubung ke tiap tenant, dan status langganan (flat fee bulanan).

### 4.2 Di Luar Lingkup V1 (Roadmap Berikutnya)
- E-filing pajak otomatis ke sistem DJP (Coretax/e-Faktur integration)
- Rekonsiliasi bank otomatis
- Multi-currency & multi-cabang (multi-branch consolidation)
- Approval workflow berjenjang untuk jurnal manual
- Deteksi anomali/duplikasi jurnal lintas-aplikasi

---

## 5. Arsitektur Teknis (Ringkasan)

| Komponen | Pilihan |
|---|---|
| Backend | NestJS |
| ORM/Database | Prisma (PostgreSQL direkomendasikan untuk konsistensi data keuangan) |
| Frontend Dashboard | React 18 + shadcn/ui |
| Autentikasi API eksternal | API Key per tenant |
| Autentikasi dashboard internal | Session/JWT standar untuk user Ledgery |

**Prinsip integrasi:**
- Setiap endpoint API publik (untuk kirim jurnal) divalidasi terhadap API key tenant.
- Idempotency key direkomendasikan pada payload jurnal untuk mencegah duplikasi pengiriman akibat retry jaringan.
- Chart of Accounts per tenant harus bisa diakses via API (read-only) agar aplikasi sumber bisa menampilkan pilihan akun ke usernya sebelum mapping.

---

## 6. Model Bisnis (Awal)

- **Skema harga**: flat fee bulanan per tenant, tidak bergantung pada jumlah transaksi/jurnal yang dikirim.
- **Bundling**: pelanggan Cultiva/Rekan/Servio/DigiSale bisa mengaktifkan Ledgery sebagai add-on terintegrasi.
- **Standalone**: dijual terpisah ke UMKM/perusahaan yang tidak memakai produk ABP lain, dengan skema flat fee yang sama.
- Detail nominal harga belum difinalisasi — masuk pembahasan terpisah setelah PRD ini disepakati.

---

## 7. Metrik Keberhasilan (Draft)

- Jumlah tenant aktif (baik dari produk ABP maupun UMKM langsung)
- Jumlah jurnal masuk per hari/bulan via API
- Waktu rata-rata generate laporan keuangan (Neraca/Laba Rugi/Arus Kas)
- Tingkat error/validasi gagal pada penerimaan jurnal (balance mismatch, akun tidak terdaftar, dll)

---

## 8. Pertanyaan Terbuka untuk V2

1. Nominal harga flat fee bulanan — akan dibahas terpisah setelah PRD ini difinalisasi.
2. Detail permission di dalam Dashboard Staf Akuntansi Tenant (apakah semua staf punya akses sama, atau ada level admin vs staf biasa di dalam tenant itu sendiri, termasuk siapa yang berhak approve jurnal pada mode Approval Manual)?

---

*Dokumen ini adalah PRD V1 — akan diperbarui seiring diskusi lanjutan mengenai detail modul, skema harga, dan kebutuhan teknis integrasi masing-masing produk.*
