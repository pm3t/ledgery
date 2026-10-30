# Prompt AI Coding Tool — Ledgery V3 (Sub Ledger AR, AP, Inventory & Order Management)
### Untuk digunakan di Cursor / GitHub Copilot / Claude Code

**Stack**: NestJS (backend) + Prisma (ORM) + React 18 + shadcn/ui (frontend)
**Konteks**: Ledgery Modul 1–11 sudah ada (Master Data, Jurnal & GL, Approval, Laporan, Pajak, Super Admin, API Versioning, Auth, Dimensions, Multicurrency, Accounting Period). Prompt di bawah adalah **penambahan di atas codebase yang sudah ada**, mengacu pada PRD V3 (Sub Ledger).

**Catatan umum**
- Setiap modul **fullstack** (backend + frontend dalam satu prompt). Semua komentar kode **Bahasa Indonesia**.
- Jalankan **berurutan**: Modul 12 → 17. Modul 13/14/15 bergantung pada Modul 12; Modul 16 (Order Management) bergantung pada Modul 13–15.
- Di awal setiap sesi, minta AI coding tool **membaca kode yang ada terlebih dulu** (JournalService, validasi periode, SelisihKursModule, mekanisme idempotency_key pada Journal, IntegrationLog, ApiKeyGuard, penomoran voucher) dan **me-reuse**-nya — jangan menduplikasi logika.
- Semua perubahan harus **aditif & backward compatible**: unit test lama harus tetap lulus, endpoint `/v1/journals` tidak berubah perilakunya untuk akun yang tidak dikunci.
- Keputusan PRD V3 yang sudah dikonfirmasi: valuasi **Moving Average dan FIFO** (dipilih per barang); **Order Management (PO, Goods Receipt, SO, Delivery Order)** termasuk V3; akun kontrol memakai **pengaturan direct posting per akun yang sudah ada**; stok negatif ditolak; dokumen sub ledger memakai alur Draft → Post sendiri; PPh pemotongan dan revaluasi unrealized ditunda.

---

## Modul 12 — Fondasi Sub Ledger

```
Lanjutkan project Ledgery (Modul 1-11 sudah ada). Bangun FONDASI sub ledger yang akan dipakai modul AR, AP, dan Inventory. Periksa dulu kode yang ada (JournalService, validasi AccountingPeriod, Dimension, multicurrency, penomoran voucher, idempotency_key) lalu reuse.

1. Model Prisma tambahan / perubahan:
   - ChartOfAccount: tambah `controlType` enum["NONE","AR","AP","INVENTORY"] default NONE. JANGAN membuat flag pengunci baru: Ledgery SUDAH punya pengaturan direct posting per akun — cari di kode yang ada dan reuse. Akun kontrol = akun dengan controlType ≠ NONE dan direct posting nonaktif.
   - SubledgerSetting (tenantId unik, arEnabled, apEnabled, inventoryEnabled, orderManagementEnabled — semua default false; defaultValuationMethod enum["MOVING_AVERAGE","FIFO"] default MOVING_AVERAGE; overDeliveryTolerancePct default 0; allowNegativeStock default false; creditLimitMode enum["WARN","BLOCK"] default WARN; agingBuckets JSON default [30,60,90]; blockPeriodCloseOnRecon boolean default false).
   - PostingSetup (id, tenantId, key enum, accountId, optional groupCode untuk override per kelompok pelanggan/vendor/kategori barang). Key minimal: AR_CONTROL, SALES_REVENUE, SALES_DISCOUNT, PPN_KELUARAN, AP_CONTROL, PURCHASE_EXPENSE, PURCHASE_DISCOUNT, PPN_MASUKAN, INVENTORY, COGS, INVENTORY_ADJUSTMENT, GR_IR_CLEARING (Barang Diterima Belum Ditagih), PURCHASE_PRICE_VARIANCE (Selisih Harga Pembelian), FX_GAIN_LOSS (pakai yang sudah ada dari Modul 10), CASH_DEFAULT.
   - BusinessPartner (id, tenantId, kode unik per tenant, nama, npwp, alamat, kontak, termPembayaranHari, creditLimit nullable, mata_uang default (default ke Tenant.mata_uang, JANGAN hardcode IDR), isCustomer, isVendor, groupCode, externalRef nullable (unik per tenant jika terisi), isActive).
   - DocumentNumbering (tenantId, docType, prefix, formatPattern misal "{PREFIX}-{YYYY}-{SEQ:5}", lastSeq per tahun) + service generator nomor yang aman dari race condition (gunakan transaksi/row lock).
   - Journal: tambah field nullable `sourceDocType` dan `sourceDocId` untuk tautan dua arah dokumen ↔ jurnal.

2. Backend (NestJS):
   - Module SubledgerSettingModule: get/update SubledgerSetting dan PostingSetup per tenant. Validasi: akun yang dipilih harus ada di COA tenant dan kategorinya masuk akal (mis. AR_CONTROL harus ASET).
   - Module BusinessPartnerModule: CRUD + pencarian + endpoint impor CSV; kode unik per tenant; partner yang sudah dipakai di dokumen tidak boleh dihapus (hanya dinonaktifkan).
   - SubledgerPostingService (service internal yang dipakai modul AR/AP/Inventory): menerima daftar baris debit/kredit + metadata dokumen, lalu membuat Journal lewat JournalService yang sudah ada dengan: sumber_aplikasi "SUBLEDGER-AR"/"SUBLEDGER-AP"/"SUBLEDGER-INV", sourceDocType/sourceDocId terisi, status POSTED langsung (keputusan: aksi Post pada dokumen = persetujuan), tetap melewati validasi periode CLOSED, balance check, multicurrency, dan Dimensions. Sediakan juga fungsi `reverseJournal(journalId, tanggal, alasan)` yang membuat jurnal pembalik tertaut ke jurnal asal.
   - Akun kontrol: gunakan pemeriksaan direct posting yang sudah ada pada penerimaan jurnal mentah (POST /v1/journals dan input manual dashboard); pastikan pesan error untuk akun kontrol jelas ("Akun {kode} adalah akun kontrol {tipe}; posting hanya melalui dokumen sub ledger"). SubledgerPostingService HARUS dikecualikan dari pemeriksaan ini. Saat user menetapkan controlType ≠ NONE pada sebuah akun, tampilkan konfirmasi dampak (integrasi yang memposting jurnal mentah ke akun itu akan ditolak) lalu nonaktifkan direct posting akun tersebut; akun yang tidak ditandai tidak berubah perilakunya.
   - Endpoint aktivasi: saat tenant mengaktifkan salah satu sub ledger atau menetapkan akun kontrol, hitung saldo GL akun kontrol saat ini dan kembalikan peringatan bila saldo ≠ 0 dan saldo awal sub ledger belum diimpor (aktivasi tetap boleh, tetapi tampilkan status "Belum rekonsiliasi").
   - Tambahkan feature flag per tenant yang bisa dilihat di Dashboard Super Admin (kolom: modul sub ledger yang aktif).

3. Frontend (React + shadcn/ui):
   - Halaman "Setting > Sub Ledger": toggle aktivasi AR / AP / Inventory, opsi (stok negatif, mode limit kredit, bucket umur piutang, blokir closing bila rekonsiliasi selisih), serta form Posting Setup (pemetaan akun per key).
   - Halaman "Chart of Accounts" (existing): tambah kolom/field tipe akun kontrol; toggle direct posting yang sudah ada otomatis nonaktif dan terkunci untuk akun kontrol.
   - Halaman "Mitra Bisnis": tabel pelanggan/vendor dengan filter (pelanggan/vendor/keduanya), form tambah/edit, impor CSV.
   - Dashboard Super Admin (existing): tampilkan modul sub ledger aktif per tenant.

4. Semua komentar kode dalam Bahasa Indonesia. Unit test: (a) jurnal mentah ke akun kontrol (non-direct-posting) ditolak, ke akun direct-posting biasa tetap diterima; (b) SubledgerPostingService menghormati periode CLOSED; (c) generator nomor dokumen tidak menghasilkan duplikat pada request paralel.
```

---

## Modul 13 — Sub Ledger AR (Piutang)

```
Lanjutkan project Ledgery (Modul 1-12 sudah ada). Bangun sub ledger AR (Piutang) dengan memakai SubledgerPostingService, BusinessPartner, PostingSetup, dan DocumentNumbering dari Modul 12. Modul Inventory (Modul 15) belum tentu ada: baris barang stok diintegrasikan lewat interface/stub yang dapat disambung nanti (lihat poin 3).

1. Model Prisma:
   - SalesInvoice (id, tenantId, noDokumen, tanggal, jatuhTempo, partnerId, mata_uang (default Tenant.mata_uang), kurs, status enum["DRAFT","POSTED","PARTIAL","PAID","VOID"], subtotal, totalDiskon, totalPpn, total, totalDialokasikan, saldo, journalId nullable, voidJournalId nullable, externalRef nullable, sumberAplikasi, idempotencyKey nullable — unik per tenant, catatan, createdBy, postedAt). Semua nilai moneter dalam mata uang dokumen DAN ekuivalen mata uang fungsional.
   - SalesInvoiceLine (id, invoiceId, itemId nullable, deskripsi, qty, hargaSatuan, diskon, ppnRate, akunPendapatanId nullable (default dari PostingSetup), dimensions (reuse struktur Dimensions Modul 9), sourceLineType nullable enum["SO_LINE","DO_LINE"], sourceLineId nullable — kolom ini diisi oleh Modul 16 (Order Management); siapkan sekarang).
   - CreditNote (struktur serupa faktur; invoiceId nullable; flag returnStock) + CreditNoteLine.
   - CustomerReceipt (id, tenantId, noDokumen, tanggal, partnerId, akunKasBankId, jumlah, mata_uang, kurs, status enum["DRAFT","POSTED","VOID"], totalDialokasikan, belumDialokasikan, journalId, externalRef, idempotencyKey).
   - ReceiptAllocation (id, receiptId, invoiceId/creditNoteId, jumlahAlokasi, kursAlokasi, selisihKurs, tanggalAlokasi).

2. Aturan posting (via SubledgerPostingService):
   - Post Faktur: Dr Piutang (AR_CONTROL) = total; Cr Pendapatan per baris (akunPendapatan atau PostingSetup); Cr PPN Keluaran = total PPN; diskon sesuai PostingSetup. Dimensions baris diteruskan ke baris jurnal.
   - Untuk baris barang bertipe STOK: panggil InventoryIssueService (interface; di Modul 15 diimplementasikan) yang mengembalikan nilai HPP, lalu tambahkan Dr HPP / Cr Persediaan. Jika Inventory belum aktif untuk tenant, tolak baris bertipe STOK dengan pesan jelas. Jika baris tertaut ke baris Delivery Order (sourceLineType = DO_LINE), JANGAN mengeluarkan stok/HPP lagi karena sudah dicatat saat DO diposting (diimplementasikan di Modul 16).
   - Post Penerimaan: Dr Kas/Bank / Cr Piutang. Alokasi ke faktur mengurangi saldo faktur; ubah status faktur (POSTED→PARTIAL→PAID). Kelebihan bayar masuk "belumDialokasikan" dan bisa dialokasikan kemudian.
   - Mata uang asing: saat alokasi, hitung selisih kurs REALISASI dengan SelisihKursModule yang sudah ada (jangan menulis ulang logikanya) dan jurnalkan ke akun FX_GAIN_LOSS.
   - Nota Kredit: jurnal kebalikan faktur; bila returnStock = true, kembalikan stok memakai biaya asli (via interface Inventory) dan balik HPP.
   - Void: hanya jika periode OPEN dan tidak ada alokasi aktif; gunakan reverseJournal dan set status VOID.
   - Semua posting tunduk pada validasi periode CLOSED. Limit kredit: bandingkan (saldo piutang pelanggan + faktur baru) dengan creditLimit sesuai creditLimitMode (WARN/BLOCK).

3. Backend (NestJS) — AccountsReceivableModule:
   - Endpoint internal (JWT dashboard): CRUD faktur DRAFT, POST /ar/invoices/:id/post, /void, CRUD nota kredit, penerimaan + alokasi, daftar faktur outstanding.
   - Endpoint publik (ApiKeyGuard, prefix /v1): `POST /v1/ar/invoices` (buat + langsung post, dukung idempotency_key dan external_ref; replay dengan key sama mengembalikan dokumen lama, reuse mekanisme idempotency yang sudah ada di core Journal), `POST /v1/ar/receipts` (dengan alokasi ke faktur via noDokumen/external_ref), `GET /v1/ar/invoices?status=&external_ref=`, `PUT /v1/partners/:external_ref` (upsert pelanggan). Catat ke IntegrationLog.
   - Saldo awal: endpoint impor faktur outstanding per tanggal go-live (CSV/JSON) yang membuat faktur berstatus POSTED tanpa jurnal GL baru (karena saldo GL sudah ada), dan memvalidasi total = saldo GL akun AR_CONTROL pada tanggal tsb (tampilkan selisih bila ada).
   - Laporan: umur piutang (bucket dari SubledgerSetting.agingBuckets, per pelanggan dan detail faktur), kartu piutang per pelanggan (mutasi + saldo berjalan), faktur outstanding.

4. Frontend (React + shadcn/ui):
   - Halaman "Faktur Penjualan": daftar (filter status/pelanggan/tanggal), form faktur dengan baris dinamis (barang/jasa, qty, harga, diskon, PPN, Dimension), total terhitung realtime, tombol Simpan Draft / Post / Void.
   - Halaman "Penerimaan Pembayaran": form pilih pelanggan → tampilkan faktur outstanding → alokasi otomatis (terlama dulu) atau manual; tampilkan sisa belum dialokasikan.
   - Halaman "Nota Kredit".
   - Halaman "Umur Piutang" dan "Kartu Piutang" (export PDF/Excel mengikuti pola Modul 4), plus tombol cetak "Statement Pelanggan".
   - Halaman "Impor Saldo Awal Piutang" dengan pratinjau dan indikator selisih terhadap GL.

5. Semua komentar kode dalam Bahasa Indonesia. Unit test: jurnal faktur seimbang; alokasi parsial & lunas mengubah status benar; void ditolak bila ada alokasi/periode CLOSED; idempotency_key ganda tidak membuat faktur kedua; selisih kurs realisasi terjurnal saat alokasi mata uang asing.
```

---

## Modul 14 — Sub Ledger AP (Hutang)

```
Lanjutkan project Ledgery (Modul 1-13 sudah ada). Bangun sub ledger AP (Hutang) dengan POLA YANG SAMA seperti Modul 13 (AR) — reuse komponen, service, dan pola kode dari Modul 12 dan 13 sebanyak mungkin (mis. logika alokasi, aging, saldo awal, void). Jangan menduplikasi logika yang bisa dijadikan abstraksi bersama.

1. Model Prisma:
   - PurchaseBill (struktur setara SalesInvoice: noDokumen internal, noFakturVendor, tanggal, jatuhTempo, partnerId vendor, mata_uang, kurs, status DRAFT/POSTED/PARTIAL/PAID/VOID, subtotal, diskon, ppnMasukan, total, saldo, journalId, externalRef, idempotencyKey, nomorFakturPajakMasukan nullable) + PurchaseBillLine (itemId nullable, deskripsi, qty, harga, diskon, ppnRate, akunBiayaId nullable, dimensions, sourceLineType nullable enum["PO_LINE","GR_LINE"], sourceLineId nullable — diisi oleh Modul 16).
   - DebitNote + DebitNoteLine (retur/koreksi pembelian; flag returnStock).
   - VendorPayment (akunKasBankId, jumlah, mata_uang, kurs, status) + PaymentAllocation (ke bill/debit note, dengan selisih kurs).

2. Aturan posting:
   - Post Bill: Dr Biaya per baris (non-stok) ATAU Dr Persediaan (baris barang STOK) + Dr PPN Masukan / Cr Hutang (AP_CONTROL). Untuk baris STOK, panggil InventoryReceiptService (interface; implementasi di Modul 15) agar stok & biaya (rata-rata bergerak atau lapisan FIFO sesuai metode barang) bertambah dengan nilai baris (setelah diskon, sebelum PPN). Jika baris tertaut ke Goods Receipt (GR_LINE), stok dan Dr Persediaan sudah dicatat saat GR; posting Bill memakai Dr GR_IR_CLEARING (bukan Dr Persediaan) — diimplementasikan di Modul 16.
   - Post Pembayaran: Dr Hutang / Cr Kas/Bank; alokasi parsial/penuh; kelebihan bayar = uang muka vendor (belumDialokasikan); selisih kurs realisasi lewat SelisihKursModule yang ada.
   - Debit Note: kebalikan bill; returnStock mengeluarkan stok memakai biaya yang berlaku.
   - Void dengan reverseJournal; validasi periode CLOSED di semua posting.

3. Backend (NestJS) — AccountsPayableModule:
   - Endpoint internal: CRUD bill DRAFT, post, void, debit note, pembayaran + alokasi.
   - Endpoint publik /v1 (ApiKeyGuard, idempotency_key, external_ref, IntegrationLog): `POST /v1/ap/bills`, `POST /v1/ap/payments`, `GET /v1/ap/bills?status=`.
   - Impor saldo awal hutang (pola sama dengan AR, validasi terhadap saldo GL AP_CONTROL).
   - Laporan: umur hutang, kartu hutang per vendor, faktur outstanding, dan **Jadwal Pembayaran** (bill jatuh tempo dalam N hari, filter N dan vendor).

4. Frontend (React + shadcn/ui): halaman Faktur Pembelian, Pembayaran Vendor (alokasi), Nota Debit, Umur Hutang, Kartu Hutang, Jadwal Pembayaran, Impor Saldo Awal Hutang — mengikuti pola dan komponen UI Modul 13. Tambahkan field nomor faktur vendor dan nomor faktur pajak masukan pada form bill.

5. Semua komentar kode dalam Bahasa Indonesia. Unit test setara Modul 13 (jurnal seimbang, alokasi parsial/lunas, void, idempotency, selisih kurs realisasi) ditambah: bill dengan baris STOK menambah stok lewat interface Inventory.
```

---

## Modul 15 — Sub Ledger Inventory (Persediaan)

```
Lanjutkan project Ledgery (Modul 1-14 sudah ada). Bangun sub ledger Inventory dan implementasikan interface InventoryIssueService / InventoryReceiptService yang dipakai Modul 13 (AR) dan Modul 14 (AP), serta nantinya Modul 16 (Delivery Order & Goods Receipt).

1. Model Prisma:
   - Item (id, tenantId, kode unik per tenant, nama, kategori/groupCode, satuan, tipe enum["STOK","NON_STOK","JASA"], akunPersediaanId/akunHppId/akunPendapatanId nullable (override PostingSetup), valuationMethod enum["MOVING_AVERAGE","FIFO"] (default dari SubledgerSetting.defaultValuationMethod; hanya boleh diubah bila belum ada pergerakan stok atau stok = 0), externalRef nullable, isActive).
   - Warehouse (id, tenantId, kode, nama, alamat, isActive).
   - StockBalance (tenantId, itemId, warehouseId, qty, nilai, biayaRataRata) — unik (tenantId,itemId,warehouseId); diisi sebagai agregat untuk SEMUA metode valuasi.
   - StockCostLayer (khusus barang FIFO: id, tenantId, itemId, warehouseId, movementMasukId, tanggalMasuk, qtyAwal, qtySisa, biayaSatuan) dan StockLayerConsumption (movementKeluarId, layerId, qty, biayaSatuan) agar setiap HPP FIFO dapat ditelusuri ke lapisan asalnya.
   - StockMovement (id, tenantId, tanggal, itemId, warehouseId, tipe enum["RECEIPT_PURCHASE","ISSUE_SALE","RECEIPT_OTHER","ADJUSTMENT_IN","ADJUSTMENT_OUT","TRANSFER_IN","TRANSFER_OUT","RETURN_SALE","RETURN_PURCHASE","OPENING"], qty (+/-), biayaSatuan, nilai, sourceDocType, sourceDocId, journalId nullable, createdBy). Append-only: koreksi dilakukan dengan movement pembalik, bukan edit/hapus.
   - StockAdjustment (opname: header + baris berisi qty sistem, qty fisik, selisih, biaya satuan untuk selisih lebih) dan StockTransfer (gudang asal/tujuan).

2. Valuasi — dua metode, dipilih per barang (Item.valuationMethod). Implementasikan dengan strategy pattern (interface ValuationStrategy dengan MovingAverageStrategy dan FifoStrategy) sehingga InventoryReceiptService/InventoryIssueService tidak bercabang if-else:
   - MOVING_AVERAGE: penerimaan → biayaRataRataBaru = (nilaiLama + nilaiMasuk) / (qtyLama + qtyMasuk); pengeluaran → biaya satuan = biayaRataRata saat itu, HPP = qty × biaya.
   - FIFO: penerimaan → buat StockCostLayer baru; pengeluaran → konsumsi lapisan tertua lebih dulu (urut tanggalMasuk lalu id), catat StockLayerConsumption per lapisan, HPP = jumlah (qty konsumsi × biaya lapisan). Transfer antar gudang membawa lapisan (biaya asli) ke gudang tujuan; retur penjualan membuat lapisan baru dengan biaya asli dari konsumsi dokumen sumber; penyesuaian kurang mengonsumsi lapisan tertua; penyesuaian lebih membuat lapisan dengan biaya satuan yang diinput user.
   - Pembulatan konsisten (mis. 4 desimal untuk biaya satuan, 2 untuk nilai); sisa pembulatan dibebankan ke pergerakan terakhir sehingga total nilai stok tidak drift.
   - Stok negatif: ditolak bila SubledgerSetting.allowNegativeStock = false (default). Barang FIFO TIDAK pernah mengizinkan stok negatif, apa pun settingnya.
   - Backdated movement: StockMovement bersifat append-only dan menjadi sumber kebenaran. Tolak bila periode CLOSED. Bila periode OPEN tetapi sudah ada movement sesudah tanggal tersebut, jalankan job rekalkulasi yang membangun ulang StockBalance/StockCostLayer/HPP dari riwayat movement secara berurutan (untuk kedua metode); bila nilai HPP berubah, buat jurnal penyesuaian HPP, catat di log, dan beri peringatan ke user.
   - Gunakan transaksi database + row lock pada StockBalance (dan lapisan FIFO terkait) untuk mencegah race condition saat dua dokumen mengeluarkan barang yang sama bersamaan.
   - Perubahan valuationMethod ditolak bila sudah ada pergerakan stok dan stok ≠ 0.

3. Integrasi GL (via SubledgerPostingService):
   - InventoryReceiptService (dipanggil saat Bill AP langsung dipost, dan oleh Goods Receipt di Modul 16): tambah stok; jurnal persediaan sudah ditangani oleh posting Bill (Dr Persediaan) — service ini hanya mencatat StockMovement & memperbarui biaya rata-rata, dan mengembalikan nilai.
   - InventoryIssueService (dipanggil saat Faktur AR langsung dipost, dan oleh Delivery Order di Modul 16): kurangi stok, kembalikan nilai HPP agar posting faktur menambahkan Dr HPP / Cr Persediaan.
   - Penerimaan Lainnya (manual/API, mis. hasil panen): user menentukan qty, biaya satuan, dan akun lawan; jurnal Dr Persediaan / Cr akun lawan.
   - Penyesuaian stok: selisih lebih → Dr Persediaan / Cr INVENTORY_ADJUSTMENT; selisih kurang → kebalikannya (pada biaya rata-rata).
   - Transfer antar gudang: tidak ada jurnal bila akun persediaan sama; bila akun berbeda, buat jurnal pemindahan.
   - Retur penjualan/pembelian: gunakan biaya asli dokumen sumber bila ada.
   - Semua jurnal tunduk pada validasi periode CLOSED dan Dimensions.

4. Backend (NestJS) — InventoryModule:
   - CRUD Item & Warehouse (+ impor CSV), endpoint penerimaan lainnya, penyesuaian/opname, transfer, impor saldo awal stok (qty & biaya per item per gudang; untuk barang FIFO boleh beberapa lapisan dengan tanggal & biaya berbeda; total nilai divalidasi terhadap saldo GL akun INVENTORY — selisih ditampilkan).
   - Endpoint publik /v1: `POST /v1/inventory/receipts` (penerimaan lainnya, idempotency_key + external_ref + IntegrationLog), `PUT /v1/items/:external_ref` (upsert barang), `GET /v1/inventory/stock?item=&warehouse=`.
   - Laporan: kartu stok (qty & nilai, per item/gudang/rentang tanggal; untuk barang FIFO tampilkan lapisan yang dikonsumsi pada tiap pengeluaran), laporan lapisan FIFO tersisa (umur persediaan), stok saat ini, nilai persediaan per tanggal (per gudang/kategori).

5. Frontend (React + shadcn/ui):
   - Halaman Master Barang, Master Gudang (CRUD + impor CSV).
   - Halaman Penerimaan Lainnya, Penyesuaian Stok (opname: unduh daftar stok, isi qty fisik, pratinjau selisih & nilai, posting), Transfer Antar Gudang.
   - Halaman Kartu Stok, Stok Saat Ini, Nilai Persediaan (export PDF/Excel).
   - Pada form Faktur Penjualan/Pembelian (Modul 13/14): pencarian barang, tampilkan stok tersedia per gudang, dan pilih gudang per baris barang STOK.

6. Semua komentar kode dalam Bahasa Indonesia, sertakan penjelasan langkah per langkah pada logika rata-rata bergerak dan konsumsi lapisan FIFO agar mudah diaudit. Unit test: biaya rata-rata benar pada urutan penerimaan/pengeluaran campuran; FIFO mengonsumsi lapisan tertua dan HPP sesuai (termasuk pengeluaran yang melintasi beberapa lapisan); transfer & retur pada FIFO membawa biaya asli; stok negatif selalu ditolak untuk FIFO; rekalkulasi backdated menghasilkan nilai yang sama dengan urutan input berurutan; stok negatif ditolak/diizinkan sesuai setting; total nilai StockBalance = jumlah StockMovement; dua pengeluaran paralel tidak melampaui stok; faktur penjualan dengan baris STOK menghasilkan jurnal HPP yang benar.
```

---

## Modul 16 — Order Management (PO, Goods Receipt, SO, Delivery Order)

```
Lanjutkan project Ledgery (Modul 1-15 sudah ada). Bangun Order Management yang menyambung ke AR (Modul 13), AP (Modul 14), dan Inventory (Modul 15). Periksa dulu kode yang ada dan reuse: SubledgerPostingService, DocumentNumbering, BusinessPartner, InventoryIssueService/InventoryReceiptService, ValuationStrategy, SubledgerSetting.

1. Aktivasi: dikendalikan SubledgerSetting.orderManagementEnabled (default false). Prasyarat: Inventory aktif; AR untuk SO/DO, AP untuk PO/GR. Alur langsung (faktur tanpa order) TETAP didukung dan tidak berubah.

2. Model Prisma:
   - PurchaseOrder (id, tenantId, noDokumen, tanggal, tanggalDiharapkan, partnerId vendor, mata_uang, kurs, status enum["DRAFT","OPEN","PARTIAL","COMPLETED","CANCELLED","CLOSED"], subtotal, diskon, ppn, total, externalRef, idempotencyKey, catatan) + PurchaseOrderLine (id, poId, itemId, deskripsi, qty, harga, diskon, ppnRate, warehouseId nullable, qtyDiterima, qtyDitagih, dimensions).
   - GoodsReceipt (id, tenantId, noDokumen, tanggal, poId nullable, partnerId, warehouseId, status enum["DRAFT","POSTED","VOID"], journalId, externalRef, idempotencyKey) + GoodsReceiptLine (poLineId nullable, itemId, qty, biayaSatuan — default dari harga PO line setelah diskon, WAJIB diisi bila GR tanpa PO —, qtyDitagih).
   - SalesOrder + SalesOrderLine (qtyDikirim, qtyDitagih) dan DeliveryOrder + DeliveryOrderLine (soLineId nullable, itemId, qty, warehouseId, biayaTotal — diisi sistem saat posting dari ValuationStrategy —, qtyDitagih), struktur setara sisi pembelian.
   - Status header dihitung dari qty baris: OPEN (belum ada penerimaan/pengiriman), PARTIAL, COMPLETED (semua baris terpenuhi), CLOSED (sisa qty ditutup manual), CANCELLED (hanya bila belum ada dokumen turunan).

3. Aturan posting (via SubledgerPostingService):
   - PO/SO: TIDAK membuat jurnal maupun pergerakan stok (hanya komitmen). SO tidak mereservasi stok; hanya tampilkan informasi stok tersedia dan jumlah terpesan.
   - Goods Receipt POST: panggil InventoryReceiptService (stok + lapisan/biaya sesuai metode barang) dengan biaya satuan baris GR; jurnal: Dr Persediaan / Cr GR_IR_CLEARING. Perbarui qtyDiterima pada PO. Tolak qty yang melebihi sisa order di luar overDeliveryTolerancePct.
   - Delivery Order POST: panggil InventoryIssueService (cek stok, HPP sesuai metode barang); jurnal: Dr HPP / Cr Persediaan. Perbarui qtyDikirim pada SO. Tolak kirim melebihi sisa order di luar toleransi, dan tolak stok negatif sesuai aturan Modul 15.
   - Faktur Pembelian tertaut GR (baris sourceLineType = GR_LINE): jurnal Dr GR_IR_CLEARING sebesar nilai GR yang ditagih; selisih antara nilai faktur (qty × harga faktur setelah diskon) dan nilai GR → Dr/Cr PURCHASE_PRICE_VARIANCE (biaya persediaan TIDAK diubah); Dr PPN Masukan / Cr Hutang seperti biasa. Baris faktur tanpa GR tetap memakai alur Modul 14 (Dr Persediaan langsung + stok masuk).
   - Faktur Penjualan tertaut DO (baris sourceLineType = DO_LINE): hanya Dr Piutang / Cr Pendapatan / Cr PPN — TANPA HPP dan tanpa pergerakan stok (sudah dicatat di DO). Baris tanpa DO tetap mengeluarkan stok & HPP sendiri (Modul 13).
   - Mata uang asing: kurs tiap dokumen mengikuti tanggal dokumennya; selisih nilai GR (kurs tanggal GR) vs faktur (kurs tanggal faktur) ikut masuk ke PURCHASE_PRICE_VARIANCE pada V3.
   - Semua posting tunduk pada validasi periode CLOSED, DocumentNumbering, dan Dimensions (diturunkan dari baris order ke baris dokumen berikutnya).
   - Void GR/DO: hanya bila periode OPEN dan qtyDitagih = 0; gunakan reverseJournal dan movement pembalik (untuk FIFO, kembalikan lapisan yang dikonsumsi sesuai StockLayerConsumption).
   - Retur: Nota Kredit/Debit (Modul 13/14) dapat merujuk ke DO/GR sebagai sumber biaya asli.

4. Backend (NestJS) — OrderManagementModule:
   - Endpoint internal: CRUD PO/SO (DRAFT → OPEN), cancel, force-close sisa qty, dan "buat dokumen turunan dari order": PO→GR, PO→Bill, SO→DO, SO→Faktur, GR→Bill, DO→Faktur (menyalin baris dengan qty sisa yang dapat diubah; mendukung parsial dan banyak dokumen turunan per order).
   - Endpoint publik /v1 (ApiKeyGuard, idempotency_key, external_ref, IntegrationLog): POST /v1/ap/purchase-orders, POST /v1/ap/goods-receipts (rujuk PO via po_ref), POST /v1/ar/sales-orders, POST /v1/ar/delivery-orders (rujuk SO via so_ref), GET status order & sisa qty. Perluas POST /v1/ar/invoices dan /v1/ap/bills agar menerima delivery_ref / goods_receipt_ref per baris.
   - Laporan: outstanding PO/SO (sisa qty, umur order), pemenuhan order (dipesan vs diterima/dikirim vs ditagih), Barang Diterima Belum Ditagih (GR/IR) per PO/GR dengan saldo, tautan ke dokumen turunan.

5. Frontend (React + shadcn/ui):
   - Halaman PO, Goods Receipt, SO, Delivery Order: daftar dengan filter status, form baris dinamis, progress pemenuhan per baris, tombol "Buat GR/Bill dari PO" dan "Buat DO/Faktur dari SO" (dialog pilih qty), serta Post/Void/Cancel/Close.
   - Form SO menampilkan stok tersedia & terpesan per gudang (informatif).
   - Halaman laporan: Outstanding Order, Pemenuhan Order, GR/IR.
   - Pada form Faktur (Modul 13/14): indikator baris tertaut GR/DO beserta pesan bahwa stok & HPP tidak dicatat ulang.

6. Semua komentar kode dalam Bahasa Indonesia. Unit test: alur PO→GR→Bill menghasilkan Dr Persediaan/Cr GR_IR lalu Dr GR_IR/Cr Hutang tanpa mengubah biaya persediaan, selisih harga masuk PURCHASE_PRICE_VARIANCE; SO→DO→Faktur menghasilkan HPP hanya sekali (di DO); penerimaan/pengiriman parsial dan banyak dokumen turunan memperbarui status order dengan benar; kelebihan qty ditolak sesuai toleransi; saldo GR/IR = jumlah GR yang belum ditagih; FIFO dan Moving Average sama-sama benar pada alur order; cancel ditolak bila sudah ada dokumen turunan; void DO pada barang FIFO mengembalikan lapisan dengan benar.
```

---

## Modul 17 — Laporan Terpadu, Rekonsiliasi & Integrasi Periode/Pajak

```
Lanjutkan project Ledgery (Modul 1-16 sudah ada). Rapikan integrasi lintas-modul sub ledger.

1. Rekonsiliasi Sub Ledger vs GL (Backend + Frontend):
   - Endpoint `GET /subledger/reconciliation?tanggal=` — untuk tiap akun kontrol (AR, AP, INVENTORY) dan akun GR_IR_CLEARING (dibandingkan dengan total GR yang belum ditagih): saldo GL (dari general-ledger.service yang ada), saldo sub ledger (jumlah saldo faktur outstanding / nilai StockBalance), selisih, dan status OK / SELISIH.
   - Bila selisih ≠ 0, sediakan drill-down: daftar dokumen sub ledger tanpa jurnal / jurnal ke akun kontrol tanpa dokumen (mis. jurnal mentah yang masuk sebelum akun dikunci) untuk membantu penelusuran.
   - Halaman "Rekonsiliasi Sub Ledger": kartu per akun kontrol (hijau/merah), tabel selisih, tautan ke dokumen/jurnal terkait.

2. Integrasi Accounting Period:
   - Saat user menekan Close pada periode (Modul 11), jalankan pemeriksaan rekonsiliasi untuk periode tsb. Bila ada selisih: tampilkan peringatan dengan rincian; bila SubledgerSetting.blockPeriodCloseOnRecon = true, batalkan closing dengan pesan jelas. Closing tetap bisa dilakukan tenant yang tidak mengaktifkan sub ledger (perilaku V2 tidak berubah).

3. Integrasi Perpajakan:
   - Ubah sumber rekap PPN: PPN keluaran dari SalesInvoice/CreditNote berstatus POSTED, PPN masukan dari PurchaseBill/DebitNote berstatus POSTED (termasuk nomor faktur pajak masukan). Tenant tanpa sub ledger tetap memakai mekanisme penandaan jurnal yang lama — pertahankan keduanya, jangan menghapus logika lama.

4. Laporan keuangan existing:
   - Pastikan Neraca, Laba Rugi, Buku Besar, dan filter Dimension tetap benar karena semua dokumen sub ledger menghasilkan jurnal GL biasa; tambahkan tautan "lihat dokumen sumber" pada baris Buku Besar yang memiliki sourceDocType/sourceDocId.
   - Tambahkan ringkasan pada Dashboard Staf Akuntansi: total piutang, total hutang, nilai persediaan, jumlah faktur jatuh tempo, jumlah PO/SO terbuka, status rekonsiliasi.

5. Log & audit:
   - Pastikan semua endpoint /v1 baru (AR, AP, Inventory, partners, items) tercatat di IntegrationLog dengan versi API dan status code; tambahkan filter modul pada halaman Log Integrasi.
   - Audit trail dokumen: siapa yang membuat, memposting, dan memvoid dokumen beserta waktunya.

6. Dokumentasi:
   - Buat dokumen ringkas (README/OpenAPI) untuk endpoint publik baru beserta contoh payload faktur penjualan (dengan baris barang + PPN + dimensions + mata uang asing), pembayaran dengan alokasi, dan penerimaan barang lainnya — untuk dipakai tim integrasi DigiSale/Cultiva/Servio.

7. Semua komentar kode dalam Bahasa Indonesia. Unit test: rekonsiliasi cocok setelah rangkaian faktur+pembayaran+stok; rekonsiliasi mendeteksi selisih saat jurnal mentah masuk ke akun kontrol yang belum dikunci; closing diblokir/ditegur sesuai setting; rekap PPN dari dokumen sama dengan total PPN pada jurnal terkait.
```

---

*Dokumen ini adalah lanjutan Prompt AI Coding Tool Ledgery V1 (Modul 1–8) dan V2 (Modul 9–11), berdasarkan PRD V3 (Sub Ledger AR, AP, Inventory). Jalankan Modul 12 → 17 secara berurutan di atas codebase yang sudah ada.*
