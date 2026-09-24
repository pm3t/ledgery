# Dokumen Skenario Pengujian (Test Scenarios) — Modul Master Data Ledgery

Dokumen ini berisi panduan pengujian komprehensif (*Step-by-Step Test Scenarios*) untuk **Modul Master Data Ledgery SaaS**. Pengujian dapat dilakukan melalui **Dashboard Frontend (UI)** (`http://localhost:3000`) maupun **API Backend (cURL/Postman)** (`http://localhost:3001`).

---

## 📋 Prasyarat Pengujian (Prerequisites)

1. Database PostgreSQL `ledgery_db` sudah berjalan.
2. Backend NestJS aktif di `http://localhost:3001`.
3. Frontend React aktif di `http://localhost:3000`.
4. Seeding data awal sudah dilakukan (`npx prisma db seed` pada folder `backend/`).

---

## 1. Modul Tenant Management (Super Admin ABP)

### 🧪 Test Case 1.1: Menampilkan Daftar Tenant
- **Tujuan**: Memastikan Super Admin dapat melihat daftar semua entitas bisnis / tenant yang terdaftar.
- **Langkah UI**:
  1. Buka dashboard di `http://localhost:3000`.
  2. Klik menu **"Manajemen Tenant (Super Admin)"** pada sidebar.
- **Ekspektasi**:
  - Muncul daftar kartu tenant, di antaranya **PT. Anugerah Bakti Prima** dan **Kedai Kopi Nusantara**.
  - Setiap kartu menampilkan ID tenant, status langganan (`ACTIVE`), jumlah statistik COA, dan jumlah API key aktif.
- **Pengujian API (cURL)**:
  ```bash
  curl -X GET http://localhost:3001/tenants
  ```
  *Status Code*: `200 OK`.

---

### 🧪 Test Case 1.2: Onboard / Pendaftaran Tenant Baru
- **Tujuan**: Memastikan pendaftaran tenant baru berhasil membuat entitas tenant sekaligus inisialisasi default *Posting Policy Setting* (`AUTO_POST`).
- **Langkah UI**:
  1. Pada halaman Manajemen Tenant, klik tombol **"Onboard Tenant Baru"**.
  2. Isi form:
     - Nama Perusahaan: `CV. Agro Makmur Sejahtera`
     - Tahun Buku Mulai: `2026`
     - Mata Uang: `IDR`
  3. Klik **"Daftarkan Tenant"**.
- **Ekspektasi**:
  - Modal tertutup dan tenant baru `CV. Agro Makmur Sejahtera` langsung muncul di daftar tenant.
  - Dropdown **"Tenant Aktif"** di sidebar kiri memperbarui daftar tenant.
- **Pengujian API (cURL)**:
  ```bash
  curl -X POST http://localhost:3001/tenants \
    -H "Content-Type: application/json" \
    -d '{
      "nama_perusahaan": "CV. Agro Makmur Sejahtera",
      "tahun_buku_mulai": 2026,
      "mata_uang": "IDR"
    }'
  ```
  *Status Code*: `201 Created`.

---

## 2. Modul Chart of Accounts (COA)

### 🧪 Test Case 2.1: Filter & Pencarian Kode Akun
- **Tujuan**: Memastikan data COA dapat difilter berdasarkan kategori dan dicari berdasarkan kata kunci.
- **Langkah UI**:
  1. Pilih tenant **"PT. Anugerah Bakti Prima"** pada dropdown Tenant Aktif.
  2. Klik menu **"Chart of Accounts (COA)"**.
  3. Klik tombol filter **"BEBAN"**.
  4. Ketik `Payroll` pada kolom pencarian.
- **Ekspektasi**:
  - Tabel hanya menampilkan akun dengan kategori BEBAN yang mengandung kata "Payroll" (`600001 - Beban Gaji Karyawan (Rekan)`).
- **Pengujian API (cURL)**:
  ```bash
  curl -X GET "http://localhost:3001/chart-of-accounts/tenant/00000000-0000-0000-0000-000000000001?kategori=BEBAN&search=Payroll"
  ```
  *Status Code*: `200 OK`.

---

### 🧪 Test Case 2.2: Tambah Kode Akun Baru & Hirarki Induk-Anak
- **Tujuan**: Memastikan penambahan kode akun baru berfungsi dan mendukung penentuan akun induk (*parent-child relationship*).
- **Langkah UI**:
  1. Klik tombol **"Tambah Kode Akun"**.
  2. Isi form:
     - Kode Akun: `100005`
     - Kategori: `ASET`
     - Nama Akun: `Kas Kecil Petty Cash`
     - Akun Induk: Pilih `100000 - ASET LANCAR`
     - Akun Aktif: Centang `[x]`
  3. Klik **"Simpan Kode Akun"**.
- **Ekspektasi**:
  - Akun `100005 - Kas Kecil Petty Cash` berhasil tersimpan.
  - Pada tabel, akun tersebut muncul dengan tanda panah sub-induk (`↳ 100005`) di bawah `ASET LANCAR`.
- **Pengujian API (cURL)**:
  ```bash
  curl -X POST http://localhost:3001/chart-of-accounts \
    -H "Content-Type: application/json" \
    -d '{
      "tenantId": "00000000-0000-0000-0000-000000000001",
      "kode_akun": "100005",
      "nama_akun": "Kas Kecil Petty Cash",
      "kategori": "ASET",
      "parentId": null
    }'
  ```

---

### 🧪 Test Case 2.3: Validasi Kode Akun Duplikat (Negative Test)
- **Tujuan**: Memastikan sistem menolak pendaftaran kode akun yang sudah ada pada tenant yang sama.
- **Langkah UI / API**:
  1. Coba tambahkan kode akun `100001` (Kas Utama) yang sudah ada pada *PT. Anugerah Bakti Prima*.
- **Ekspektasi**:
  - Sistem menampilkan error: `Kode akun '100001' sudah digunakan pada tenant ini`.
  - HTTP Response Status Code: `409 Conflict`.

---

## 3. Modul API Key Management & ApiKeyGuard

### 🧪 Test Case 3.1: Generate API Key Baru (Tampil Plaintext Sekali)
- **Tujuan**: Memastikan API Key baru dapat dibuat, hash SHA-256 disimpan di database, dan plaintext key ditampilkan HANYA SEKALI ke pengguna.
- **Langkah UI**:
  1. Pilih menu **"API Key Management"**.
  2. Klik **"Generate Key Baru"**.
  3. Isi Label Aplikasi: `Integrasi DigiSale POS Baru`.
  4. Klik **"Buat API Key"**.
- **Ekspektasi**:
  - Modal berubah menampilkan kotak peringatan **"Simpan API Key Ini Sekarang!"**.
  - Muncul string plaintext API key bertuliskan format `ldg_live_<hex_string>`.
  - Terdapat tombol **"Salin API Key"** yang menyalin teks ke clipboard.
  - Setelah modal ditutup dan dibuka kembali, plaintext key tidak dapat dilihat lagi (hanya menampilkan label dan tanggal).
- **Pengujian API (cURL)**:
  ```bash
  curl -X POST http://localhost:3001/api-keys/generate \
    -H "Content-Type: application/json" \
    -d '{
      "tenantId": "00000000-0000-0000-0000-000000000001",
      "nama_label": "Integrasi DigiSale POS Baru"
    }'
  ```
  *Response menyertakan field `rawApiKey`*.

---

### 🧪 Test Case 3.2: Pengujian Endpoint Publik `/v1/coa` dengan API Key Guard
- **Tujuan**: Memastikan middleware `ApiKeyGuard` membaca header `X-API-Key`, memvalidasi hash, dan memberikan akses data COA read-only.
- **Pengujian API Valid (cURL)**:
  ```bash
  curl -X GET http://localhost:3001/v1/coa \
    -H "X-API-Key: ldg_live_rekan_payroll_secret_key_12345"
  ```
  - **Ekspektasi**: Status `200 OK`, mengembalikan data COA tenant *PT. Anugerah Bakti Prima*.

- **Pengujian API Tanpa Header / Key Salah (Negative Test)**:
  ```bash
  curl -X GET http://localhost:3001/v1/coa \
    -H "X-API-Key: ldg_live_key_palsu_12345"
  ```
  - **Ekspektasi**: Status `401 Unauthorized`, pesan error: `API Key tidak valid atau telah ditarik (revoked)`.

---

### 🧪 Test Case 3.3: Revoke (Penarikan) API Key
- **Tujuan**: Memastikan API key yang ditarik/direvoke langsung kehilangan hak akses integrasi API secara seketika.
- **Langkah UI**:
  1. Pada tabel API Key, cari key dengan label `Integrasi Cultiva (Agri)`.
  2. Klik tombol **"Revoke Key"** dan konfirmasi alert.
- **Ekspektasi**:
  - Badge status berubah dari **Aktif** (hijau) menjadi **Ditarik (Revoked)** (merah).
  - Jika key tersebut digunakan kembali untuk request ke `/v1/coa`, server mengembalikan error `401 Unauthorized`.

---

## 4. Modul Setting Kebijakan Posting (Posting Policy)

### 🧪 Test Case 4.1: Mengubah Kebijakan Posting dari Auto-Post ke Approval Manual
- **Tujuan**: Memastikan tenant dapat mengubah konfigurasi alur penerimaan jurnal dari API.
- **Langkah UI**:
  1. Pilih tenant **"PT. Anugerah Bakti Prima"** (Default mode: `AUTO_POST`).
  2. Klik menu **"Kebijakan Posting"**.
  3. Pilih opsi **"Approval Manual"** (Kontrol & Review).
  4. Klik tombol **"Simpan Perubahan Kebijakan"**.
- **Ekspektasi**:
  - Muncul banner hijau: `Kebijakan posting jurnal berhasil diperbarui!`.
  - Kartu opsi **Approval Manual** menjadi aktif ter-highlight.
  - Status kebijakan menampilkan: `Mode Aktif: 🛡️ Approval Manual`.
- **Pengujian API (cURL)**:
  ```bash
  curl -X PUT http://localhost:3001/settings/posting-policy/00000000-0000-0000-0000-000000000001 \
    -H "Content-Type: application/json" \
    -d '{
      "mode": "APPROVAL_MANUAL",
      "updatedBy": "Tester QA"
    }'
  ```
  *Status Code*: `200 OK`.

---

## 📊 Matriks Ringkasan Eksekusi Pengujian

| No | Modul | Skenario Uji | Metode Test | Status Ekspektasi |
|---|---|---|---|---|
| 1 | Tenant | Lihat Semua Tenant | UI / API GET `/tenants` | ✅ PASS |
| 2 | Tenant | Onboard Tenant Baru | UI / API POST `/tenants` | ✅ PASS |
| 3 | COA | Filter Kategori & Search | UI / API GET `/chart-of-accounts/...` | ✅ PASS |
| 4 | COA | Tambah Akun + Parent ID | UI / API POST `/chart-of-accounts` | ✅ PASS |
| 5 | COA | Reject Duplicate Kode Akun | UI / API POST (Duplikat) | 🛑 409 Conflict |
| 6 | API Key | Generate Key (Plaintext 1x) | UI / API POST `/api-keys/generate` | ✅ PASS |
| 7 | API Key | Access `/v1/coa` Valid Key | cURL `X-API-Key: <key>` | ✅ PASS (200 OK) |
| 8 | API Key | Access `/v1/coa` Invalid Key| cURL `X-API-Key: <fake>` | 🛑 401 Unauthorized |
| 9 | API Key | Revoke Key | UI / API PATCH `/api-keys/:id/revoke` | ✅ PASS |
| 10 | Setting | Toggle Posting Policy | UI / API PUT `/settings/posting-policy/...` | ✅ PASS |

---

## 5. Modul Jurnal & General Ledger

### 🧪 Test Case 5.1: Input Jurnal Valid (API Publik)
- **Tujuan**: Memastikan aplikasi eksternal dapat mengirimkan jurnal *balance* ke `/v1/journals`.
- **Pengujian API (cURL)**:
  ```bash
  curl -X POST http://localhost:3001/v1/journals \
    -H "Content-Type: application/json" \
    -H "x-api-key: ldg_live_rekan_payroll_secret_key_12345" \
    -d '{
      "tanggal": "2026-09-01T00:00:00Z",
      "deskripsi": "Pembayaran sewa gedung",
      "sumber_aplikasi": "DigiSale",
      "idempotency_key": "trx-001",
      "entries": [
        { "kode_akun": "600002", "tipe": "DEBIT", "jumlah": 5000000 },
        { "kode_akun": "100001", "tipe": "KREDIT", "jumlah": 5000000 }
      ]
    }'
  ```
- **Ekspektasi**: Status `201 Created`. Jurnal tersimpan dengan status `POSTED` (jika kebijakan *auto-post*) dan `no_voucher` terbentuk (misal `JNL-2026-0001`).

### 🧪 Test Case 5.2: Validasi Balance (Negative Test)
- **Tujuan**: Memastikan API menolak jurnal dengan total Debit != Kredit.
- **Pengujian API (cURL)**:
  Ubah payload pada Test Case 5.1 menjadi debit 5000000 dan kredit 4000000.
- **Ekspektasi**: Status `400 Bad Request`. Pesan: "Jurnal tidak balance!".

### 🧪 Test Case 5.3: Pengecekan Idempotency
- **Tujuan**: Memastikan pengiriman ulang *request* yang sama (dengan `idempotency_key` yang sama) tidak membuat jurnal duplikat.
- **Pengujian API (cURL)**:
  Jalankan kembali cURL pada Test Case 5.1 tanpa perubahan.
- **Ekspektasi**: Status `201 Created` tetapi data yang dikembalikan adalah data asli (*existing*) dan ID jurnal sama dengan sebelumnya, tidak ada *record* baru di database.

### 🧪 Test Case 5.4: UI Input Jurnal Manual
- **Tujuan**: Memastikan pengguna dapat memasukkan jurnal secara manual melalui dashboard.
- **Langkah UI**:
  1. Klik menu **"Input Jurnal Manual"**.
  2. Isi Tanggal dan Deskripsi ("Setoran Modal").
  3. Pilih Akun Debit "100001" (Kas) dan isi Rp 10.000.000.
  4. Pilih Akun Kredit "300000" (Ekuitas) dan isi Rp 8.000.000.
- **Ekspektasi**: Terdapat teks indikasi selisih Rp 2.000.000 dan tombol "Simpan" mati (*disabled*).
- **Langkah UI**:
  5. Ubah nominal kredit menjadi Rp 10.000.000. Klik **Simpan Jurnal**.
- **Ekspektasi**: Jurnal berhasil disimpan dan muncul *alert success*.

### 🧪 Test Case 5.5: UI Daftar Jurnal & Filter
- **Tujuan**: Memastikan jurnal yang telah masuk dapat dilihat dan difilter di dashboard.
- **Langkah UI**:
  1. Klik menu **"Daftar Jurnal"**.
- **Ekspektasi**: Tabel menampilkan "Pembayaran sewa gedung" dan "Setoran Modal". Total nominal sesuai dengan total debit masing-masing jurnal.
- **Langkah UI**:
  2. Pilih Filter Status "POSTED".
- **Ekspektasi**: Tabel ter-*filter* dengan benar.

### 🧪 Test Case 5.6: UI Laporan Buku Besar (General Ledger)
- **Tujuan**: Memastikan mutasi dan kalkulasi *running balance* dihitung dengan benar pada Buku Besar.
- **Langkah UI**:
  1. Klik menu **"Buku Besar"**.
  2. Pilih Akun **"100001 - Kas Utama"**.
- **Ekspektasi**:
  - Tabel memuat histori transaksi akun Kas Utama.
  - Kolom **Saldo Berjalan** menunjukkan kalkulasi yang akurat.

---

## 6. Modul Approval Jurnal & Notifikasi

### 🧪 Test Case 6.1: Notifikasi Jurnal Baru (PENDING)
- **Tujuan**: Memastikan jurnal yang masuk untuk tenant dengan kebijakan *Approval Manual* mendapatkan status PENDING dan men-trigger notifikasi.
- **Langkah Persiapan**:
  - Pastikan Kebijakan Posting Tenant diset ke **"Approval Manual"**.
- **Pengujian API (cURL)**:
  Kirim jurnal melalui `POST /v1/journals` (Gunakan payload dari Test Case 5.1 dengan `idempotency_key` baru).
- **Ekspektasi**:
  - Jurnal tersimpan dengan status `PENDING`.
  - Pada UI Frontend, muncul badge notifikasi (titik merah berkedip) di atas icon lonceng (kanan atas header).
  - Saat icon lonceng diklik, terdapat item notifikasi berisi *"Jurnal baru dengan No Voucher... membutuhkan persetujuan Anda"*.

### 🧪 Test Case 6.2: Menyetujui Jurnal (Approve)
- **Tujuan**: Memastikan jurnal PENDING dapat disetujui, masuk ke Buku Besar, dan tercatat di Log Approval.
- **Langkah UI**:
  1. Klik menu **"Persetujuan Jurnal"** di sidebar.
  2. Klik tombol **"Setujui"** pada jurnal yang baru masuk.
  3. Konfirmasi alert dialog.
- **Ekspektasi**:
  - Jurnal menghilang dari daftar PENDING.
  - Cek di **Daftar Jurnal**, status jurnal tersebut berubah menjadi `APPROVED`.
  - Cek **Buku Besar**, jurnal tersebut telah masuk ke dalam perhitungan mutasi.
  - Cek **Riwayat Approval**, terdapat entri log baru untuk jurnal tersebut dengan status `APPROVED`.

### 🧪 Test Case 6.3: Menolak Jurnal (Reject)
- **Tujuan**: Memastikan jurnal PENDING dapat ditolak (dengan wajib menyertakan alasan) dan tidak masuk ke Buku Besar.
- **Langkah Persiapan**: Buat jurnal baru via `/v1/journals` sehingga ada jurnal PENDING di daftar.
- **Langkah UI**:
  1. Klik menu **"Persetujuan Jurnal"**.
  2. Klik tombol **"Tolak"** pada jurnal tersebut.
  3. Muncul *Modal Reject*. Biarkan alasan kosong, lalu coba klik **"Konfirmasi Tolak"**.
- **Ekspektasi**: Tombol tidak bisa di-klik / sistem meminta input wajib.
- **Langkah UI Lanjutan**:
  4. Isi alasan: "Salah pilih akun beban operasional".
  5. Klik **"Konfirmasi Tolak"**.
- **Ekspektasi**:
  - Jurnal menghilang dari daftar PENDING.
  - Di **Daftar Jurnal**, status jurnal berubah menjadi `REJECTED`.
  - Di **Buku Besar**, jurnal ini **TIDAK** muncul.
  - Di **Riwayat Approval**, log penolakan tercatat lengkap dengan alasannya.

---

## 7. Modul Laporan Keuangan

### 🧪 Test Case 7.1: UI Laporan Neraca Saldo (Trial Balance)
- **Tujuan**: Memastikan pengguna dapat melihat rekapitulasi total Debit & Kredit seluruh akun aktif dalam suatu rentang waktu, serta memverifikasi bahwa total Debit = total Kredit.
- **Langkah UI**:
  1. Klik menu **"Laporan Keuangan"**.
  2. Klik tab **"Neraca Saldo"**.
  3. Atur filter Periode Awal & Akhir.
  4. Klik tombol **"Terapkan Filter"**.
- **Ekspektasi**:
  - Muncul tabel Neraca Saldo dengan kolom Kode, Nama Akun, Debit, dan Kredit.
  - Terdapat indikator hijau "Balanced" atau merah "Unbalanced" di header tabel.
  - Total di bagian bawah tabel menunjukkan nilai Debit yang persis sama dengan nilai Kredit.

### 🧪 Test Case 7.2: UI Laporan Neraca (Balance Sheet)
- **Tujuan**: Memastikan persamaan dasar akuntansi terpenuhi pada *Balance Sheet*: `Aset = Liabilitas + Ekuitas`.
- **Langkah UI**:
  1. Masih di halaman Laporan Keuangan, pindah ke tab **"Neraca (Balance Sheet)"**.
  2. Atur "Tanggal As Of".
  3. Klik **"Terapkan Filter"**.
- **Ekspektasi**:
  - Tabel terbagi dua/tiga blok: ASET, LIABILITAS, dan EKUITAS.
  - Terdapat penambahan baris "Laba/Rugi Tahun Berjalan" di dalam kelompok Ekuitas.
  - Indikator hijau "Aset = Liabilitas + Ekuitas" tampil di atas halaman jika kalkulasi seimbang.
  - Total Pasiva (Liabilitas + Ekuitas) secara matematis sama dengan Total Aset.

### 🧪 Test Case 7.3: UI Laba Rugi dengan Mode Komparasi
- **Tujuan**: Memastikan Laba Rugi dapat menampilkan pendapatan, beban, laba/rugi, serta berfungsi jika dibandingkan dengan periode lain.
- **Langkah UI**:
  1. Pindah ke tab **"Laba Rugi"**.
  2. Set periode awal dan akhir.
  3. Centang **"Bandingkan?"**.
  4. Atur "Periode Pembanding Awal" dan "Periode Pembanding Akhir" ke bulan sebelumnya.
  5. Klik **"Terapkan Filter"**.
- **Ekspektasi**:
  - Muncul 3 kolom angka (selain label akun): "Periode Lalu", "Periode Terpilih", dan "Selisih".
  - Ada indikator naik (hijau) atau turun (merah) pada kolom selisih bergantung pada tren Laba/Rugi.

### 🧪 Test Case 7.4: UI Laporan Arus Kas
- **Tujuan**: Memastikan aktivitas kas yang disederhanakan melalui metode tidak langsung tampil dengan laba bersih yang disesuaikan.
- **Langkah UI**:
  1. Pindah ke tab **"Arus Kas"**.
  2. Klik **"Terapkan Filter"**.
- **Ekspektasi**:
  - Nilai "Laba (Rugi) Bersih" diambil dari kalkulasi Laba Rugi di periode yang sama.
  - Penyesuaian non-kas dimuat pada kolom "Aktivitas Operasi" (misalnya penurunan hutang atau kenaikan aset di luar kas).
  - Terlihat rangkuman "Kenaikan (Penurunan) Bersih Kas".

---

## 8. Modul Perpajakan Indonesia

### 🧪 Test Case 8.1: Setting Pajak
- **Tujuan**: Memastikan pengguna dapat menyimpan NPWP, mengatur tarif PPN, dan mengaktifkan simulasi PPh 21.
- **Langkah UI**:
  1. Klik menu **"Perpajakan (Rekap)"**.
  2. Berada di tab **"Setting Pajak"**.
  3. Masukkan NPWP, ubah PPN menjadi 12%, centang "Aktifkan Perhitungan PPh 21".
  4. Klik **"Simpan Pengaturan"**.
- **Ekspektasi**: Muncul alert berhasil. Saat tab dipindah dan dikembalikan, setting tetap tersimpan.

### 🧪 Test Case 8.2: Hitung Rekap PPN
- **Tujuan**: Memastikan kalkulasi PPN mengambil data dari akun Pendapatan pada periode tersebut.
- **Langkah UI**:
  1. Pindah ke tab **"Rekap Pajak Periodik"**.
  2. Pilih periode bulan ini.
  3. Klik **"Hitung PPN"**.
- **Ekspektasi**: 
  - Muncul row baru di tabel histori dengan Jenis Pajak `PPN`.
  - Jika ada saldo kredit di akun Pendapatan sebesar Rp1.000.000 (contoh), maka Total Pajak (12%) adalah Rp120.000.

### 🧪 Test Case 8.3: Hitung Rekap PPh 21
- **Tujuan**: Memastikan PPh 21 dihitung berdasarkan tarif progresif Pasal 17 (MVP: berdasarkan beban dari aplikasi "Rekan").
- **Langkah UI**:
  1. Pastikan PPh 21 sudah diaktifkan di tab Setting.
  2. Di tab Rekap, klik **"Hitung PPh 21"**.
- **Ekspektasi**:
  - Muncul row baru di tabel histori dengan Jenis Pajak `PPH21`.
  - Jika tidak ada beban dari aplikasi "Rekan", total Dasar Pengenaan dan Pajak adalah 0.

---

## 9. Modul Dashboard Super Admin ABP

### 🧪 Test Case 9.1: Login / Switch ke Portal Super Admin
- **Tujuan**: Memastikan landing page bisa mengarahkan ke dashboard Super Admin dengan role `SUPER_ADMIN`.
- **Langkah UI**:
  1. Klik "Ganti Role (Logout)" di ujung kanan atas (jika sedang login sebagai tenant).
  2. Pada halaman awal, pilih **Portal Super Admin**.
- **Ekspektasi**: Masuk ke rute UI `/admin/*` (ditandai dengan Sidebar merah/gelap "ABP Admin") tanpa error.

### 🧪 Test Case 9.2: Onboard Tenant Baru
- **Tujuan**: Memastikan form onboarding memanggil endpoint Admin dan menginisialisasi CoA.
- **Langkah UI**:
  1. Di tab "Daftar Tenant", klik tombol **"Onboard Tenant Baru"**.
  2. Isi Nama Perusahaan, Tahun Buku, dan Mata Uang.
  3. Klik **"Simpan & Buat Database"**.
- **Ekspektasi**: Alert berhasil muncul, tabel daftar tenant ter-refresh dengan data tenant baru.

### 🧪 Test Case 9.3: Manajemen Status Tagihan (Billing)
- **Tujuan**: Mengubah status langganan tenant dari UNPAID menjadi PAID.
- **Langkah UI**:
  1. Pindah ke menu **"Status Langganan"**.
  2. Klik tombol **"Tandai Lunas (+30 Hari)"** di baris tenant tertentu.
  3. Konfirmasi alert browser.
- **Ekspektasi**: Status berubah menjadi PAID (hijau) dan tanggal Jatuh Tempo bertambah 30 hari dari sebelumnya (atau hari ini).

### 🧪 Test Case 9.4: Audit Log saat Mengakses Data Sensitif Tenant
- **Tujuan**: Super Admin harus tercatat dalam log audit ketika memantau data detail (jurnal) tenant.
- **Langkah UI**:
  1. Kembali ke **"Daftar Tenant"**, lalu klik **"Buka Profil"** pada tenant tertentu.
  2. Klik tombol **"Lihat Data Transaksi (Audit Log)"**.
  3. Masukkan alasan di alert prompt (contoh: "Pengecekan integrasi API yang macet").
  4. Klik OK.
- **Ekspektasi**: Request ke backend berjalan, log tersimpan di tabel `AuditLog`, dan notifikasi alert berhasil tercatat. (Di masa depan bisa dicek di tab Audit Logs Privasi).

## 10. Modul Dimensions (PRD V2 Delta)

### 🧪 Test Case 10.1: Membuat Jenis Dimension & Value Baru
- **Tujuan**: Memastikan staf akuntansi tenant dapat membuat jenis Dimension baru (misal "Cost Center") beserta nilai-nilainya secara mandiri.
- **Langkah UI**:
  1. Klik menu **"Manajemen Dimensi"**.
  2. Klik tombol **"Tambah Dimensi Baru"**, isi form dengan nama "Cost Center", lalu klik Simpan.
  3. Pada tabel Dimensi, klik baris "Cost Center" untuk melihat detail.
  4. Klik tombol **"Tambah Nilai (Value)"**, isi kode "CC01" dan nama "Divisi HRD", lalu klik Simpan.
- **Ekspektasi**: Dimensi "Cost Center" beserta nilai "CC01 - Divisi HRD" berhasil disimpan dan muncul pada tabel.

### 🧪 Test Case 10.2: Input Jurnal Manual dengan Dimension
- **Tujuan**: Memastikan pengguna dapat menyematkan Dimension pada baris entri jurnal.
- **Langkah UI**:
  1. Klik menu **"Input Jurnal Manual"**.
  2. Isi Tanggal dan Deskripsi jurnal.
  3. Pilih Akun Beban Gaji (Debit). Pada dropdown "Dimensi (Opsional)", pilih "Cost Center: CC01 - Divisi HRD".
  4. Pilih Akun Kas Utama (Kredit) tanpa memilih dimensi apa pun.
  5. Pastikan total debit = kredit, lalu klik **"Simpan Jurnal"**.
- **Ekspektasi**: Jurnal berhasil disimpan. Baris Beban Gaji memiliki keterikatan dengan Dimensi "Cost Center" nilai "CC01".

### 🧪 Test Case 10.3: Filter Laporan Laba Rugi berdasarkan Dimension
- **Tujuan**: Memastikan Laba Rugi dapat disaring (filter) spesifik pada nilai Dimension tertentu.
- **Langkah UI**:
  1. Klik menu **"Laporan Keuangan"**, lalu tab **"Laba Rugi"**.
  2. Atur "Periode Awal" dan "Periode Akhir".
  3. Pada opsi filter **"Dimensi (Opsional)"**, pilih "Cost Center: CC01 - Divisi HRD".
  4. Klik tombol **"Terapkan Filter"**.
- **Ekspektasi**: Laporan Laba Rugi hanya menghitung nominal saldo dari baris-baris jurnal yang secara spesifik memiliki Dimension "Cost Center: CC01 - Divisi HRD". Beban dari baris jurnal tanpa dimensi tersebut tidak akan ikut dihitung.

---

## 11. Modul Multicurrency (PRD V2 Delta)

### 🧪 Test Case 11.1: Setup Kurs Harian (Exchange Rate)
- **Tujuan**: Memastikan tenant dapat mengatur kurs nilai tukar terhadap mata uang asing.
- **Langkah UI**:
  1. Klik menu **"Setting Perusahaan"**.
  2. Masuk ke tab **"Kurs Mata Uang"**.
  3. Tambahkan kurs baru untuk mata uang "USD" pada tanggal hari ini, misal dengan nilai kurs `15600`.
  4. Klik **"Simpan"**.
- **Ekspektasi**: Data kurs USD untuk tanggal bersangkutan tersimpan dengan sukses di sistem.

### 🧪 Test Case 11.2: Penerimaan Jurnal Valas (API)
- **Tujuan**: Memastikan endpoint API `/v1/journals` otomatis mengambil kurs harian jika jurnal dikirim dalam mata uang asing.
- **Pengujian API (cURL)**:
  Kirim payload jurnal dengan tambahan `"mata_uang": "USD"` untuk tanggal di mana kurs sudah diset.
- **Ekspektasi**: Status `201 Created`. Pada database `JournalEntry`, kolom jumlah asli tersimpan dalam USD, dan jumlah setara (IDR) otomatis terhitung berdasarkan kurs harian (misal `$1,000` = `Rp 15.600.000`).

---

## 12. Modul Accounting Period Management (PRD V2 Delta)

### 🧪 Test Case 12.1: Auto-generate Periode Akuntansi
- **Tujuan**: Memastikan tenant dapat men-generate 12 bulan periode pembukuan untuk satu tahun buku tertentu secara otomatis.
- **Langkah UI**:
  1. Klik menu **"Manajemen Periode"**.
  2. Klik tombol **"Generate Tahun Buku"**, isi tahun "2026", lalu submit.
- **Ekspektasi**: Tabel memuat 12 baris periode baru (Januari hingga Desember 2026) dengan status semuanya `OPEN`.

### 🧪 Test Case 12.2: Closing Periode
- **Tujuan**: Memastikan staf akuntansi dapat menutup (close) periode yang pembukuannya sudah selesai.
- **Langkah UI**:
  1. Di tabel "Manajemen Periode", pilih periode "Januari 2026".
  2. Klik tombol aksi **"Tutup Periode (Close)"**.
- **Ekspektasi**: Status periode Januari 2026 berubah dari `OPEN` menjadi `CLOSED`. Kolom histori (Closed By) tercatat.

### 🧪 Test Case 12.3: Validasi Jurnal pada Periode yang Telah Ditutup (Negative Test)
- **Tujuan**: Memastikan sistem menolak pencatatan jurnal yang tanggalnya jatuh pada periode `CLOSED`.
- **Langkah UI / API**:
  1. Lakukan "Input Jurnal Manual" dengan memilih "Tanggal" di bulan Januari 2026.
  2. Pastikan akun balance, klik "Simpan Jurnal".
- **Ekspektasi**: Sistem menolak dengan pesan error *"Periode Januari 2026 sudah ditutup, tidak dapat menambahkan jurnal baru"*.

---
*End of Document*
