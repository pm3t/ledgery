# PRD V3 (Delta) — Ledgery
### Penambahan Fitur: Sub Ledger Piutang (AR), Hutang (AP), Persediaan (Inventory) & Order Management

---

## 1. Latar Belakang & Tujuan

Sampai V2, Ledgery bekerja di level **General Ledger**: jurnal masuk (dari aplikasi sumber maupun input manual), lalu diolah menjadi Buku Besar dan laporan keuangan. Akun seperti "Piutang Usaha", "Hutang Usaha", dan "Persediaan" hanya berupa saldo total — **tidak diketahui siapa yang berhutang, faktur mana yang belum lunas, atau barang apa yang tersisa di gudang mana**.

V3 menambahkan **sub ledger** (buku pembantu) agar Ledgery menjadi solusi akuntansi yang lengkap:

| Sub Ledger | Menjawab pertanyaan |
|---|---|
| **AR (Piutang)** | Siapa pelanggan yang belum bayar, faktur mana, berapa umur piutangnya? |
| **AP (Hutang)** | Ke vendor mana kita berhutang, faktur mana yang jatuh tempo, kapan harus dibayar? |
| **Inventory (Persediaan)** | Barang apa, di gudang mana, berapa qty dan nilainya, berapa HPP saat terjual? |
| **Order Management** | Pesanan apa yang masih terbuka (PO ke vendor, SO dari pelanggan), sudah diterima/dikirim berapa, sudah ditagih berapa? |

Tujuan utama:
1. Mencatat transaksi di level dokumen (faktur, pembayaran, pergerakan stok) yang **otomatis menghasilkan jurnal GL**.
2. Menjaga **saldo akun kontrol GL = total saldo sub ledger** (bisa direkonsiliasi kapan saja).
3. Memungkinkan aplikasi sumber (DigiSale, Cultiva, Servio, dan aplikasi pihak ketiga) mengirim **dokumen bisnis** (faktur penjualan, penerimaan barang, dll), bukan sekadar jurnal mentah.

---

## 2. Prinsip Desain

### 2.1 Akun Kontrol (Control Account)
- Akun di Chart of Accounts dapat ditandai sebagai **akun kontrol** dengan tipe `AR`, `AP`, atau `INVENTORY`.
- Saldo akun kontrol di GL harus selalu sama dengan jumlah saldo seluruh sub ledger terkait.
- Ledgery **sudah memiliki pengaturan direct posting per akun**; V3 memakai pengaturan itu (bukan mekanisme baru). Akun kontrol harus berstatus **non-direct-posting** agar GL dan sub ledger tidak pernah selisih — satu-satunya jalur posting ke akun tersebut adalah lewat dokumen sub ledger (yang dikecualikan dari pembatasan direct posting).
- Saat tenant menandai akun sebagai akun kontrol, sistem menampilkan konfirmasi dampak lalu menonaktifkan direct posting pada akun tersebut. Akun yang tidak ditandai tidak berubah perilakunya (menjaga kompatibilitas integrasi V1/V2 yang sudah berjalan).

### 2.2 Dokumen → Jurnal Otomatis
- Setiap dokumen sub ledger (faktur, pembayaran, pergerakan stok) saat di-**Post** menghasilkan jurnal GL otomatis, tertaut dua arah (dokumen ↔ jurnal) dan tercatat sumbernya (`sumber_aplikasi` = "SUBLEDGER-AR" / "SUBLEDGER-AP" / "SUBLEDGER-INV").
- Jurnal yang dihasilkan tunduk pada aturan yang sudah ada: validasi periode (OPEN/CLOSED), multicurrency, Dimensions.

### 2.3 Posting Setup
- Tenant mengatur pemetaan akun default di Setting (akun piutang, pendapatan, PPN keluaran, hutang, PPN masukan, persediaan, HPP, selisih persediaan, dll). Pemetaan dapat di-override per kelompok pelanggan/vendor atau per kategori barang.

### 2.4 Aktivasi per Tenant (Opt-in)
- Ketiga sub ledger dapat diaktifkan **terpisah** per tenant di halaman Setting (AR saja, AR+AP, atau ketiganya). Tenant yang tidak mengaktifkan tetap berjalan persis seperti V2.
- Saat aktivasi, sistem memeriksa saldo GL akun kontrol yang sudah ada dan mewajibkan **saldo awal sub ledger** (lihat 3.6) agar rekonsiliasi langsung cocok.

---

## 3. Fitur A: Sub Ledger AR (Piutang)

### 3.1 Master Pelanggan
Kode, nama, NPWP, alamat, kontak, term pembayaran (hari), limit kredit, mata uang default, kelompok pelanggan, status aktif, `external_ref` (ID di aplikasi sumber). Satu mitra bisa berstatus pelanggan **dan** vendor.

### 3.2 Dokumen AR
| Dokumen | Fungsi |
|---|---|
| **Faktur Penjualan** | Tagihan ke pelanggan; baris bisa berupa barang (stok) atau non-stok/jasa; ada diskon dan PPN |
| **Nota Kredit** | Koreksi/retur penjualan; dapat tertaut ke faktur asal; opsi mengembalikan stok |
| **Penerimaan Pembayaran** | Uang masuk dari pelanggan ke akun Kas/Bank; dialokasikan ke satu/banyak faktur |

Status faktur: `DRAFT` → `POSTED` → `PARTIAL` → `PAID`, atau `VOID`.

### 3.3 Pola Jurnal
- **Faktur Penjualan (baris non-stok)**: Dr Piutang Usaha / Cr Pendapatan, Cr PPN Keluaran
- **Faktur Penjualan (baris barang stok)**: tambahan Dr HPP / Cr Persediaan (nilai HPP dari Inventory, lihat Fitur C)
- **Penerimaan Pembayaran**: Dr Kas/Bank / Cr Piutang Usaha
- **Nota Kredit**: kebalikan faktur (termasuk pengembalian stok & HPP bila retur barang)

### 3.4 Alokasi Pembayaran
- Satu pembayaran bisa dialokasikan ke banyak faktur; satu faktur bisa dilunasi bertahap (parsial).
- Kelebihan bayar disimpan sebagai **saldo belum dialokasikan** (uang muka/unapplied) dan bisa dialokasikan nanti.
- Untuk mata uang asing: selisih kurs **realisasi** saat alokasi dihitung & dijurnal otomatis memakai mekanisme selisih kurs V2.

### 3.5 Limit Kredit & Jatuh Tempo
- Jatuh tempo = tanggal faktur + term pembayaran.
- Limit kredit: peringatan (default) atau blokir saat faktur baru melebihi limit — dapat diatur di Setting.

### 3.6 Saldo Awal
- Impor faktur outstanding per tanggal go-live (nomor faktur, tanggal, jatuh tempo, pelanggan, sisa tagihan) sehingga total = saldo GL akun piutang pada tanggal tersebut.

### 3.7 Void / Pembatalan
- Faktur/pembayaran dapat di-void selama periodenya masih OPEN dan tidak punya alokasi aktif (alokasi harus dilepas dulu). Void menghasilkan **jurnal pembalik** tertaut ke jurnal asal.

---

## 4. Fitur B: Sub Ledger AP (Hutang)

### 4.1 Master Vendor
Sama seperti pelanggan: kode, nama, NPWP, alamat, term pembayaran, mata uang, rekening bank vendor, status, `external_ref`.

### 4.2 Dokumen AP
| Dokumen | Fungsi |
|---|---|
| **Faktur Pembelian (Bill)** | Tagihan dari vendor; baris barang stok atau biaya/non-stok; PPN masukan |
| **Nota Debit** | Retur/koreksi pembelian; opsi mengeluarkan stok |
| **Pembayaran Vendor** | Uang keluar dari Kas/Bank; dialokasikan ke satu/banyak bill |

### 4.3 Pola Jurnal
- **Bill (baris biaya)**: Dr Biaya, Dr PPN Masukan / Cr Hutang Usaha
- **Bill (baris barang stok)**: Dr Persediaan, Dr PPN Masukan / Cr Hutang Usaha (sekaligus menambah stok di Inventory)
- **Pembayaran Vendor**: Dr Hutang Usaha / Cr Kas/Bank
- **Nota Debit**: kebalikan bill

### 4.4 Fitur Pendukung
- Alokasi parsial & uang muka vendor, selisih kurs realisasi, saldo awal, void dengan jurnal pembalik — **sama polanya dengan AR**.
- **Daftar Jatuh Tempo / Jadwal Bayar**: daftar bill yang jatuh tempo dalam N hari ke depan, untuk perencanaan pembayaran.
- Nomor faktur pajak masukan dicatat per bill (dasar rekap PPN masukan).

---

## 5. Fitur C: Sub Ledger Inventory (Persediaan)

### 5.1 Master Data
- **Barang**: kode, nama, kategori, satuan, tipe (`STOK` / `NON_STOK` / `JASA`), akun persediaan/HPP (override opsional), **metode valuasi** (`MOVING_AVERAGE` / `FIFO`, default mengikuti Setting tenant), status aktif.
- **Gudang**: kode, nama, alamat, status aktif.
- Satu satuan per barang di V3 (konversi multi-satuan masuk roadmap berikutnya).

### 5.2 Transaksi Stok
| Transaksi | Sumber | Dampak GL |
|---|---|---|
| **Penerimaan dari Pembelian** | Goods Receipt (dari PO), atau Bill AP langsung dengan baris barang | Via Goods Receipt: Dr Persediaan / Cr Barang Diterima Belum Ditagih (GR/IR). Via Bill langsung: Dr Persediaan / Cr Hutang |
| **Pengeluaran karena Penjualan** | Delivery Order (dari SO), atau Faktur AR langsung dengan baris barang | Dr HPP / Cr Persediaan (saat DO diposting; atau saat faktur bila tanpa DO) |
| **Penerimaan Lainnya** | Manual/API, mis. hasil panen Cultiva; user menentukan nilai satuan & akun lawan | Dr Persediaan / Cr akun lawan |
| **Penyesuaian Stok (Opname)** | Manual | Selisih lebih/kurang ke akun Selisih Persediaan |
| **Transfer Antar Gudang** | Manual | Tidak ada dampak GL bila akun persediaan sama |
| **Retur Penjualan / Pembelian** | Nota Kredit / Nota Debit | Mengembalikan stok & nilai sesuai biaya aslinya |

### 5.3 Metode Valuasi
Metode valuasi ditetapkan **per barang** (default mengikuti Setting tenant), dengan dua pilihan:

- **Rata-rata Bergerak (Moving Average)**: setiap penerimaan menghitung ulang biaya rata-rata; setiap pengeluaran memakai biaya rata-rata saat itu sebagai HPP.
- **FIFO**: setiap penerimaan membentuk *lapisan biaya* (tanggal, qty sisa, biaya satuan) per barang per gudang; setiap pengeluaran menghabiskan lapisan tertua lebih dulu dan HPP = jumlah biaya lapisan yang dikonsumsi. Transfer antar gudang membawa biaya lapisan ke gudang tujuan; retur penjualan membentuk lapisan baru dengan biaya aslinya.
- Metode barang hanya dapat diubah bila belum ada pergerakan stok atau stok = 0.
- Batch/lot, nomor seri, dan tanggal kedaluwarsa tidak termasuk V3.

### 5.4 Kebijakan Stok Negatif
- Default: **ditolak** (pengeluaran tidak boleh melebihi stok tersedia). Dapat diubah di Setting menjadi diizinkan dengan peringatan untuk barang Moving Average; **barang FIFO selalu menolak stok negatif**.

### 5.5 Laporan Inventory
- **Kartu Stok**: mutasi masuk/keluar/saldo per barang per gudang (qty & nilai); untuk barang FIFO juga menampilkan lapisan biaya yang dikonsumsi serta laporan lapisan tersisa (umur persediaan).
- **Laporan Nilai Persediaan** per tanggal, per gudang/kategori.
- **Stok Saat Ini** per gudang.

### 5.6 Saldo Awal Stok
- Impor qty & nilai satuan per barang per gudang pada tanggal go-live, total nilai = saldo GL akun persediaan.

---

## 6. Fitur D: Order Management (PO, Goods Receipt, SO, Delivery Order)

### 6.1 Konsep
Alur dokumen bertingkat yang menyambung ke AR, AP, dan Inventory:

- **Pembelian**: Purchase Order (PO) → Goods Receipt (GR) → Faktur Pembelian
- **Penjualan**: Sales Order (SO) → Delivery Order (DO) → Faktur Penjualan

PO/SO adalah **komitmen** (tidak membuat jurnal maupun pergerakan stok). Stok bergerak saat **GR/DO** diposting; piutang/hutang/pendapatan/biaya tercatat saat **faktur**. Setiap dokumen turunan dapat dibuat dari dokumen sebelumnya (salin baris, qty dapat diubah), mendukung penerimaan/pengiriman/penagihan **parsial** dan banyak dokumen turunan per order. Alur langsung tanpa order (faktur berdiri sendiri seperti 3.2 dan 4.2) **tetap didukung**.

> Catatan: Goods Receipt ditambahkan sebagai pasangan Delivery Order di sisi pembelian, karena alur PO → penerimaan barang → faktur memerlukannya.

### 6.2 Dokumen
| Dokumen | Fungsi | Dampak GL |
|---|---|---|
| **Purchase Order** | Pesanan ke vendor (qty, harga, tanggal diharapkan) | Tidak ada |
| **Goods Receipt** | Penerimaan barang dari vendor (acuan PO atau berdiri sendiri) | Dr Persediaan / Cr GR/IR |
| **Sales Order** | Pesanan dari pelanggan | Tidak ada |
| **Delivery Order** | Pengiriman barang ke pelanggan (acuan SO atau berdiri sendiri) | Dr HPP / Cr Persediaan |

### 6.3 Status & Pelacakan
- Status order: `DRAFT` → `OPEN` → `PARTIAL` → `COMPLETED`, serta `CLOSED` (sisa qty ditutup manual) dan `CANCELLED` (hanya bila belum ada dokumen turunan).
- Setiap baris order melacak qty **dipesan / diterima atau dikirim / ditagih**.
- Kelebihan terima/kirim terhadap qty order ditolak, dengan toleransi persentase yang dapat diatur di Setting (default 0%).

### 6.4 Pola Jurnal
- **Goods Receipt**: Dr Persediaan / Cr Barang Diterima Belum Ditagih (GR/IR), bernilai harga PO (setelah diskon).
- **Faktur Pembelian tertaut GR**: Dr GR/IR (nilai GR) ± Selisih Harga Pembelian (bila harga faktur ≠ harga GR) + Dr PPN Masukan / Cr Hutang. Biaya persediaan tidak diubah; selisih masuk akun *Selisih Harga Pembelian*.
- **Delivery Order**: Dr HPP / Cr Persediaan (nilai sesuai metode valuasi barang).
- **Faktur Penjualan tertaut DO**: Dr Piutang / Cr Pendapatan, Cr PPN — **tanpa HPP dan tanpa pergerakan stok lagi** (sudah dicatat di DO).
- **Faktur tanpa GR/DO**: stok dan HPP/persediaan tetap dicatat saat faktur diposting (alur langsung 3.3 / 4.3).
- Baris non-stok/jasa tidak melalui GR/DO.
- Selisih akibat perbedaan kurs antara tanggal GR dan tanggal faktur ikut dicatat ke Selisih Harga Pembelian pada V3.

### 6.5 Stok & Reservasi
- SO **tidak mereservasi stok** di V3. Form SO menampilkan stok tersedia dan jumlah yang sudah terpesan (informatif).

### 6.6 Pembatalan & Retur
- Order dapat dibatalkan bila belum ada dokumen turunan; sisa qty dapat ditutup manual (*force close*).
- GR/DO dapat di-void selama periode OPEN dan belum ditagih; sistem membuat jurnal & pergerakan stok pembalik.
- Retur memakai Nota Kredit / Nota Debit yang merujuk DO/GR sebagai sumber biaya asli.

### 6.7 Batasan V3
- Tidak ada approval berjenjang untuk PO/SO (cukup perubahan status oleh staf).
- Tidak ada penawaran (quotation), backorder otomatis, maupun reservasi stok keras.

---

## 7. Integrasi dengan Aplikasi Sumber (API v1)

Endpoint baru berada di bawah prefix `/v1` (aditif, tidak mengubah endpoint lama), memakai API key tenant yang sama, mendukung `idempotency_key` dan `external_ref`:

| Endpoint | Fungsi |
|---|---|
| `POST /v1/ar/invoices` | Kirim faktur penjualan (mis. dari DigiSale) |
| `POST /v1/ar/receipts` | Kirim penerimaan pembayaran + alokasi |
| `POST /v1/ap/bills` | Kirim faktur pembelian |
| `POST /v1/ap/payments` | Kirim pembayaran vendor + alokasi |
| `POST /v1/inventory/receipts` | Penerimaan barang lainnya (mis. hasil panen Cultiva) |
| `PUT /v1/partners/:external_ref`, `PUT /v1/items/:external_ref` | Upsert master pelanggan/vendor/barang agar sinkron dengan aplikasi sumber |
| `GET /v1/ar/invoices?status=`, `GET /v1/ap/bills?status=` | Cek status faktur/saldo outstanding |
| `POST /v1/ap/purchase-orders`, `POST /v1/ap/goods-receipts` | Kirim PO dan penerimaan barang (GR merujuk PO via `po_ref`) |
| `POST /v1/ar/sales-orders`, `POST /v1/ar/delivery-orders` | Kirim SO dan pengiriman barang (DO merujuk SO via `so_ref`) |
| `GET /v1/ap/purchase-orders?status=`, `GET /v1/ar/sales-orders?status=` | Cek status order dan sisa qty |

Contoh pemakaian: DigiSale tidak lagi mengirim jurnal "Dr Piutang / Cr Penjualan" mentah, melainkan **faktur penjualan lengkap** — Ledgery yang membentuk jurnal piutang, pendapatan, PPN, HPP, dan pengurangan stok sekaligus. Integrasi lama berbasis jurnal mentah tetap berjalan untuk akun yang bukan akun kontrol (masih direct posting). Faktur boleh menyertakan `delivery_ref` / `goods_receipt_ref` per baris agar tertaut ke DO/GR.

---

## 8. Laporan & Rekonsiliasi

| Laporan | Isi |
|---|---|
| **Umur Piutang (AR Aging)** | Saldo outstanding per pelanggan dalam bucket (default 0–30, 31–60, 61–90, >90 hari; bucket dapat diatur) |
| **Umur Hutang (AP Aging)** | Sama, per vendor |
| **Kartu Piutang / Kartu Hutang** | Mutasi per pelanggan/vendor + saldo berjalan (dasar *statement* ke pelanggan) |
| **Faktur Outstanding** | Daftar faktur belum lunas + jatuh tempo |
| **Kartu Stok & Nilai Persediaan** | Lihat 5.5 |
| **Outstanding PO / SO** | Order terbuka dengan sisa qty belum diterima/dikirim dan belum ditagih, beserta umur order |
| **Pemenuhan Order** | Perbandingan qty dipesan vs diterima/dikirim vs ditagih per order dan per mitra |
| **Barang Diterima Belum Ditagih (GR/IR)** | Saldo akun GR/IR per PO/GR yang belum ada fakturnya; ikut diperiksa dalam rekonsiliasi |
| **Rekonsiliasi Sub Ledger vs GL** | Per akun kontrol: saldo GL, saldo sub ledger, selisih. Selisih harus 0; jika ≠ 0 ditandai dan dapat ditelusuri |

---

## 9. Interaksi dengan Fitur yang Sudah Ada

| Fitur | Perilaku |
|---|---|
| **Accounting Period** | Dokumen bertanggal di periode CLOSED ditolak. Saat closing periode, sistem menjalankan **pemeriksaan rekonsiliasi** (sub ledger vs GL) dan menampilkan peringatan jika ada selisih |
| **Multicurrency** | Dokumen AR/AP dapat dalam mata uang asing; kurs diambil dari tabel kurs harian; selisih kurs realisasi dijurnal saat alokasi pembayaran |
| **Dimensions** | Baris dokumen dapat membawa Dimension; diteruskan ke baris jurnal yang dihasilkan |
| **Perpajakan** | Rekap PPN keluaran bersumber dari faktur penjualan, PPN masukan dari faktur pembelian (lebih akurat dibanding penandaan jurnal manual) |
| **Kebijakan Posting** | Dokumen sub ledger memiliki alur sendiri (Draft → Post); aksi Post pada dokumen adalah bentuk persetujuan, sehingga jurnal yang dihasilkan langsung berstatus POSTED (lihat keputusan #2 pada bagian 12.1) |
| **Log Integrasi** | Seluruh request ke endpoint baru tercatat di IntegrationLog seperti endpoint v1 lainnya |

---

## 10. Kompatibilitas & Strategi Peluncuran

- Aditif dan **backward compatible**: tidak ada perubahan pada `/v1/journals`; modul sub ledger non-aktif secara default.
- Pembatasan akun kontrol memakai pengaturan direct posting per akun yang sudah ada dan hanya berlaku untuk akun yang ditandai tenant sebagai akun kontrol, sehingga integrasi yang memposting jurnal mentah ke akun lain tidak terpengaruh.
- Order Management bersifat opt-in terpisah; faktur tanpa order tetap berjalan seperti biasa.
- Urutan rilis yang disarankan: **Fondasi → AR → AP → Inventory (Moving Average & FIFO) → Order Management (PO, GR, SO, DO) → Laporan & Rekonsiliasi**, karena AR/AP bergantung pada fondasi, Inventory terhubung ke baris faktur, dan Order Management menambah tautan ke ketiganya.

---

## 11. Di Luar Lingkup V3

- Batch/lot, nomor seri, tanggal kedaluwarsa, multi-satuan dengan konversi
- Reservasi stok keras untuk SO, penawaran (quotation), approval berjenjang PO/SO, backorder otomatis
- Metode valuasi lain (LIFO, biaya standar)
- Landed cost (biaya angkut/bea masuk ke HPP), BOM/produksi
- PPh pemotongan/pemungutan (PPh 23, dsb.) pada AP/AR
- Integrasi e-Faktur / Coretax
- Revaluasi kurs *unrealized* akhir periode
- Rekonsiliasi bank otomatis

---

## 12. Keputusan

### 12.1 Keputusan Utama
| # | Topik | Keputusan |
|---|---|---|
| 1 | Valuasi stok | **Moving Average dan FIFO**, dipilih per barang |
| 2 | Alur posting dokumen sub ledger | Alur Draft → Post sendiri; aksi Post = persetujuan, jurnal langsung POSTED |
| 3 | Stok negatif | Ditolak secara default (dapat diubah untuk barang Moving Average; FIFO selalu ditolak) |
| 4 | Akun kontrol | Memakai **pengaturan direct posting per akun yang sudah ada** |
| 5 | Order management | **SO, PO, DO termasuk V3** (ditambah Goods Receipt sebagai pasangan DO) |
| 6 | PPh pemotongan pada AP/AR | Ditunda; PPN saja di V3 |
| 7 | Revaluasi kurs unrealized | Ditunda |
| 8 | Skema harga sub ledger | Dibahas terpisah |
| 9 | Rekonsiliasi ≠ 0 saat closing periode | Peringatan (dapat diubah menjadi blokir di Setting) |

### 12.2 Keputusan Order Management & FIFO
| # | Topik | Keputusan |
|---|---|---|
| A | Goods Receipt | Ditambahkan sebagai pasangan DO di sisi pembelian (alur PO → penerimaan → faktur) |
| B | Selisih harga PO/GR vs faktur pembelian | Dicatat ke akun Selisih Harga Pembelian; biaya persediaan tidak diubah |
| C | Reservasi stok oleh SO | Tidak ada; hanya informasi stok tersedia & terpesan |
| D | Mengubah metode valuasi barang | Hanya bila belum ada pergerakan stok atau stok = 0 |
| E | Transaksi stok bertanggal mundur | Ditolak di periode CLOSED; di periode OPEN dihitung ulang lewat job rekalkulasi dari riwayat pergerakan (kedua metode) |
| F | Toleransi kelebihan terima/kirim terhadap qty order | 0% (dapat diatur di Setting) |
| G | Approval berjenjang untuk PO/SO | Tidak di V3 |

### 12.3 Yang Masih Dibahas Terpisah
- Skema harga: apakah sub ledger termasuk flat fee yang sama atau add-on berbayar per modul.

---

*Dokumen ini adalah PRD V3 (delta) Ledgery — melengkapi PRD V1 dan V2 tanpa mengubah struktur inti yang sudah berjalan. Seluruh keputusan pada bagian 12 sudah dikonfirmasi dan menjadi dasar Prompt AI Coding Modul 12–17.*
