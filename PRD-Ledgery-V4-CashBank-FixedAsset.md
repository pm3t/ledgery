# PRD V4 (Delta) — Ledgery
### Penambahan Fitur: Cash & Bank Management (Sub Ledger Kas/Bank) dan Asset Management (Sub Ledger Aset Tetap)

---

## 1. Latar Belakang & Tujuan

Setelah V3 (AR, AP, Inventory, Order Management), dua area besar masih berstatus "saldo total saja" di General Ledger:

| Sub Ledger | Kondisi saat ini | Yang ditambahkan V4 |
|---|---|---|
| **Kas & Bank** | Akun kas/bank hanya berupa saldo GL. Penerimaan AR dan pembayaran AP memilih akun GL biasa; tidak ada buku kas per rekening, tidak ada rekonsiliasi dengan rekening koran | Master rekening kas/bank, dokumen kas (terima, keluar, transfer), kas kecil, **rekonsiliasi bank**, buku kas per rekening |
| **Aset Tetap** | Perolehan, penyusutan, dan pelepasan aset harus dijurnal manual atau dikirim sebagai jurnal mentah; tidak ada daftar aset, jadwal penyusutan, maupun pemisahan buku komersial vs fiskal | Daftar aset (*fixed asset register*), kapitalisasi dari AP/kas, **penyusutan otomatis bulanan**, penyusutan fiskal paralel, mutasi, penurunan nilai, pelepasan, laporan mutasi aset tetap, serta **label barcode/QR dan pembacaan (scan)** |

Tujuan utama V4:
1. Setiap pergerakan kas/bank tercatat per rekening dan dapat direkonsiliasi dengan rekening koran.
2. Setiap aset tetap tercatat per aset dengan nilai perolehan, akumulasi penyusutan, dan nilai tercatat yang selalu cocok dengan akun kontrol di GL.
3. Dokumen sub ledger menghasilkan jurnal GL otomatis, tunduk pada validasi periode, multicurrency, dan Dimensions yang sudah ada.

---

## 2. Prinsip Desain (Melanjutkan V3)

### 2.1 Akun Kontrol Baru
Tipe akun kontrol (`controlType`) bertambah dua nilai: **`CASH_BANK`** dan **`FIXED_ASSET`** (mencakup akun harga perolehan, akumulasi penyusutan, dan akun aset dalam penyelesaian). Saldo GL akun kontrol harus selalu sama dengan saldo sub ledger-nya.

### 2.2 Perlakuan Berbeda untuk Akun Kas/Bank
Akun kas/bank berbeda dari akun piutang/hutang/persediaan: banyak integrasi lama (mis. Rekan mengirim jurnal gaji dengan sisi kredit ke akun kas/bank) memposting langsung ke akun ini. Agar integrasi tersebut tidak putus:

- Akun `CASH_BANK` **boleh tetap direct posting**. Setiap baris jurnal yang mengenai akun tersebut **otomatis ditangkap (*auto-capture*)** sebagai entri di buku kas/bank dengan sumber "Jurnal", sehingga sub ledger tidak pernah selisih dengan GL.
- Jalur yang direkomendasikan tetap dokumen kas (lihat 3.2); tenant dapat mematikan direct posting akun kas/bank kapan saja memakai pengaturan direct posting per akun yang sudah ada.

Akun `FIXED_ASSET` mengikuti aturan V3: **non-direct-posting**. Posting hanya lewat dokumen aset tetap (yang dikecualikan dari pembatasan).

### 2.3 Alur Dokumen
Sama seperti V3: dokumen berstatus `DRAFT` → `POSTED` (aksi Post = persetujuan, jurnal langsung berstatus POSTED), dapat di-void dengan jurnal pembalik selama periodenya OPEN, bernomor otomatis, mendukung Dimensions, `idempotency_key`, dan `external_ref`.

### 2.4 Aktivasi Opt-in per Tenant
Dua toggle baru di Setting Sub Ledger: **Kas & Bank** dan **Aset Tetap**, nonaktif secara default. Tenant yang tidak mengaktifkan berjalan persis seperti V3. Aktivasi menampilkan status kecocokan saldo GL vs saldo awal sub ledger (lihat 3.8 dan 4.11).

---

## 3. Fitur A: Cash & Bank Management

### 3.1 Master Rekening Kas/Bank
| Atribut | Keterangan |
|---|---|
| Kode, nama | Identitas rekening |
| Jenis | `KAS_TUNAI`, `KAS_KECIL`, `BANK`, `DOMPET_DIGITAL` |
| Akun GL | Satu rekening terhubung ke satu akun GL bertipe `CASH_BANK` |
| Mata uang | Mata uang rekening (default mata uang fungsional tenant) |
| Data bank | Nama bank, nomor rekening, nama pemilik (untuk jenis BANK) |
| Kas kecil | Plafon/imprest (untuk jenis KAS_KECIL) |
| Status | Aktif/nonaktif |

### 3.2 Dokumen Kas & Bank
| Dokumen | Fungsi |
|---|---|
| **Penerimaan Kas/Bank** | Uang masuk di luar AR (pendapatan lain, setoran modal, pinjaman, bunga bank) — banyak baris akun lawan, mendukung Dimensions |
| **Pengeluaran Kas/Bank** | Uang keluar di luar AP (biaya langsung, pembelian aset tunai, biaya admin bank) |
| **Transfer Antar Rekening** | Pindah dana antar kas/bank (termasuk lintas mata uang), dengan opsi biaya transfer |
| **Pengisian Kas Kecil** | Mengisi kembali kas kecil dari bank (lihat 3.5) |
| **Voucher Kas Kecil** | Pengeluaran dari kas kecil |

### 3.3 Pola Jurnal
- **Penerimaan**: Dr Kas/Bank / Cr akun lawan
- **Pengeluaran**: Dr akun lawan / Cr Kas/Bank
- **Transfer**: Dr Kas/Bank tujuan / Cr Kas/Bank asal; biaya transfer: Dr Biaya Bank / Cr Kas/Bank asal
- **Transfer lintas mata uang**: nilai ekuivalen dari kurs harian; selisih kurs dijurnal otomatis memakai mekanisme selisih kurs V2 (tanpa menulis ulang logikanya)
- **Pengisian kas kecil**: Dr Kas Kecil / Cr Bank
- **Voucher kas kecil**: Dr Biaya (atau akun lawan) / Cr Kas Kecil

> PPN pada transaksi kas langsung tidak ditangani di V4; transaksi ber-PPN dicatat lewat faktur AR/AP.

### 3.4 Integrasi dengan AR dan AP (V3)
- Penerimaan Pembayaran (AR) dan Pembayaran Vendor (AP) memilih **rekening kas/bank dari master**, bukan akun GL mentah, sehingga otomatis tercatat di buku kas/bank dan ikut direkonsiliasi.
- **Migrasi**: saat fitur diaktifkan, sistem membuat master rekening untuk akun kas/bank yang pernah dipakai dokumen V3 (tenant melengkapi data bank). Dokumen lama tetap valid dan tertaut ke rekening hasil migrasi.

### 3.5 Kas Kecil (Imprest)
- Kas kecil memiliki plafon. Setiap pengeluaran dicatat sebagai voucher kas kecil; saldo kas kecil menurun sampai pengisian kembali.
- **Pengisian** dilakukan sebesar total voucher yang belum diganti (menjaga saldo kembali ke plafon), lewat dokumen Pengisian Kas Kecil dari rekening bank.
- Peringatan saat voucher melebihi saldo kas kecil (konfigurasi: peringatan atau blokir).

### 3.6 Rekonsiliasi Bank
Alur untuk satu rekening bank per periode:
1. **Impor rekening koran** (CSV/Excel dengan pemetaan kolom; format MT940 ditunda): tanggal, keterangan, debit/kredit, saldo, referensi.
2. **Pencocokan otomatis**: aturan nominal sama + selisih tanggal dalam N hari + kemiripan referensi/keterangan; mendukung satu-ke-banyak dan banyak-ke-satu (mis. setoran gabungan).
3. **Pencocokan manual** untuk sisanya.
4. **Baris tanpa pasangan** (biaya admin, bunga, setoran belum tercatat) dapat langsung dibuatkan dokumen kas dari baris rekening koran.
5. **Selesai**: rekonsiliasi dinyatakan selesai bila saldo rekening koran = saldo buku + item beredar (cek/transfer belum cair, setoran dalam perjalanan). Entri yang sudah direkonsiliasi ditandai *cleared* dan tidak dapat di-void sebelum rekonsiliasi dibuka kembali.
6. Laporan rekonsiliasi per rekening per tanggal (saldo bank, saldo buku, item beredar, selisih).

### 3.7 Mata Uang Asing
- Rekening dapat berdenominasi mata uang asing; saldo ditampilkan dalam mata uang rekening dan ekuivalen mata uang fungsional.
- Revaluasi *unrealized* saldo valas akhir periode **ditunda** (konsisten dengan keputusan V3).

### 3.8 Saldo Awal
- Saldo awal per rekening pada tanggal go-live; total per akun GL divalidasi terhadap saldo GL akun `CASH_BANK` (selisih ditampilkan sebagai status "belum rekonsiliasi").

### 3.9 Laporan
| Laporan | Isi |
|---|---|
| **Buku Kas/Bank** | Mutasi per rekening dengan saldo berjalan, filter tanggal, tautan ke dokumen/jurnal sumber |
| **Posisi Kas & Bank** | Saldo seluruh rekening per tanggal (per mata uang dan ekuivalen) |
| **Rekonsiliasi Bank** | Lihat 3.6 |
| **Proyeksi Arus Kas** | Proyeksi saldo kas berdasarkan jatuh tempo piutang (AR) dan hutang (AP) yang masih outstanding |
| **Arus Kas Metode Langsung** | Melengkapi laporan arus kas metode tidak langsung (V1): penerimaan/pengeluaran kas dikelompokkan Operasi/Investasi/Pendanaan berdasarkan **kategori arus kas pada akun lawan** (atribut baru pada Chart of Accounts) |

---

## 4. Fitur B: Asset Management (Sub Ledger Aset Tetap)

### 4.1 Pembagian Peran dengan EAM Operasional
Ledgery menangani sisi **akuntansi** aset; sistem operasional aset (mis. EAM/Vigilo: penandaan QR/barcode, mutasi fisik, *stock opname* mobile, maintenance, work order) menangani sisi **operasional**.

| Domain | Ledgery (sub ledger) | EAM operasional |
|---|---|---|
| Nilai akuntansi (perolehan, akumulasi, nilai tercatat) | **Sumber kebenaran** | Membaca via API |
| Perhitungan & jurnal penyusutan | **Ledgery** | Tidak menghitung ulang |
| Penyusutan fiskal & rekonsiliasi fiskal | **Ledgery** (buku paralel) | — |
| Identitas operasional (lokasi fisik, penanggung jawab, foto, riwayat servis, maintenance, work order) | Menyimpan referensi (`external_ref`) | **Sumber kebenaran** |
| Label barcode/QR dan pembacaan (scan) dasar, verifikasi fisik sederhana | **Ledgery** (lihat 4.13) | Dapat memakai kode tag dari Ledgery atau mengirim kode tag sendiri; menambah RFID/GPS dan alur opname lanjutan |
| Alur persetujuan berjenjang berdasarkan nilai | Alur Draft → Post sendiri | Dapat diterapkan sebelum mengirim ke Ledgery |

Tenant yang tidak memakai EAM tetap dapat mengelola daftar aset sepenuhnya di Ledgery.

### 4.2 Master Kategori Aset
Setiap kategori menyimpan nilai default yang diwariskan ke aset:

| Atribut | Keterangan |
|---|---|
| Jenis | `BERWUJUD` atau `TAK_BERWUJUD` (amortisasi memakai mesin yang sama) |
| Parameter komersial | Metode (garis lurus / saldo menurun), umur manfaat (bulan), nilai residu (% atau nominal) |
| Parameter fiskal | Kelompok fiskal (lihat 4.6), metode fiskal |
| Akun GL | Aset (harga perolehan), Akumulasi Penyusutan, Beban Penyusutan, Aset Dalam Penyelesaian (CIP), Laba/Rugi Pelepasan, Rugi Penurunan Nilai |
| Penyusutan | Dapat disusutkan atau tidak (mis. tanah tidak disusutkan) |

### 4.3 Kartu Aset
Nomor aset (otomatis), **kode tag** dan status label (lihat 4.13), nama, kategori, tanggal perolehan, **tanggal mulai digunakan**, harga perolehan, nilai residu, umur manfaat, metode, status (`CIP`, `AKTIF`, `DISUSUTKAN_PENUH`, `DIJUAL`, `DIHAPUSKAN`), Dimensions (Cost Center, Lokasi/Cabang, Project), `external_ref`, lampiran dokumen. Satu aset dapat berasal dari satu atau beberapa baris perolehan.

### 4.4 Siklus Hidup dan Pola Jurnal
| Peristiwa | Sumber dokumen | Jurnal |
|---|---|---|
| **Perolehan via pembelian** | Baris faktur pembelian (AP) bertipe *Aset* | Dr Aset Tetap (atau CIP) + Dr PPN Masukan / Cr Hutang; kartu aset dibuat otomatis berstatus draft untuk dilengkapi |
| **Perolehan tunai** | Pengeluaran Kas/Bank dengan baris bertipe *Aset* | Dr Aset Tetap (atau CIP) / Cr Kas/Bank |
| **Perolehan lain** | Pendaftaran manual / API | Dr Aset Tetap / Cr akun lawan yang dipilih |
| **Kapitalisasi CIP** | Dokumen Kapitalisasi | Dr Aset Tetap / Cr CIP |
| **Penyusutan bulanan** | Proses Penyusutan (4.7) | Dr Beban Penyusutan / Cr Akumulasi Penyusutan |
| **Pengeluaran lanjutan yang dikapitalisasi** | Dokumen Penambahan Nilai | Dr Aset Tetap / Cr Kas/Hutang; penyusutan dihitung ulang prospektif |
| **Penurunan nilai (impairment)** | Dokumen Penurunan Nilai | Dr Rugi Penurunan Nilai / Cr Akumulasi Penurunan Nilai (atau Akumulasi Penyusutan sesuai setting) |
| **Penjualan/pelepasan** | Baris faktur penjualan (AR) bertipe *Pelepasan Aset* | Dr Piutang, Dr Akumulasi Penyusutan, Dr/Cr Laba/Rugi Pelepasan / Cr Aset Tetap |
| **Penghapusan (scrap/hilang)** | Dokumen Penghapusan | Dr Akumulasi Penyusutan, Dr Rugi Penghapusan / Cr Aset Tetap |

Penyusutan sampai tanggal pelepasan/penghapusan diposting lebih dulu sebelum jurnal pelepasan.

### 4.5 Penyusutan Komersial (Buku Dijurnal ke GL)
- **Metode V4**: Garis Lurus dan Saldo Menurun (faktor dapat diatur). Metode berbasis unit produksi ditunda.
- **Dasar penyusutan**: harga perolehan − nilai residu, selama umur manfaat; nilai tercatat tidak turun di bawah residu. Pada metode saldo menurun, sisa dibebankan pada periode terakhir agar nilai tercatat tepat sama dengan residu.
- **Konvensi awal penyusutan** (pengaturan level tenant): *Bulan Penuh* (default — mulai bulan tanggal mulai digunakan) atau *Bulan Berikutnya*; tanpa prorata harian.
- **Pelepasan di tengah bulan** mengikuti konvensi yang sama (diatur di Setting).
- Aset berstatus CIP **tidak disusutkan** sampai dikapitalisasi.

### 4.6 Penyusutan Fiskal (Buku Paralel, Tidak Dijurnal)
Setiap aset memiliki **buku fiskal** yang dihitung bersamaan dengan buku komersial namun **tidak menghasilkan jurnal GL**. Fungsinya: laporan rekonsiliasi komersial vs fiskal (koreksi fiskal) dan basis perhitungan beda temporer.

Rujukan aturan: **PMK Nomor 72 Tahun 2023** tentang Penyusutan Harta Berwujud dan/atau Amortisasi Harta Tak Berwujud (menggantikan PMK-96/PMK.03/2009). Tarif disimpan sebagai **master data yang dapat diubah**, bukan hardcode, dan diverifikasi ulang saat implementasi.

| Kelompok | Masa manfaat | Tarif garis lurus | Tarif saldo menurun |
|---|---|---|---|
| Kelompok 1 (bukan bangunan) | 4 tahun | 25% | 50% |
| Kelompok 2 (bukan bangunan) | 8 tahun | 12,5% | 25% |
| Kelompok 3 (bukan bangunan) | 16 tahun | 6,25% | 12,5% |
| Kelompok 4 (bukan bangunan) | 20 tahun | 5% | 10% |
| Bangunan permanen | 20 tahun | 5% | — (hanya garis lurus) |
| Bangunan tidak permanen | 10 tahun | 10% | — (hanya garis lurus) |

Ketentuan yang diakomodasi:
- Metode fiskal bangunan hanya garis lurus; bukan bangunan boleh garis lurus atau saldo menurun, dan **konsisten per kelompok harta**.
- Harta yang tidak tercantum dalam lampiran peraturan memakai masa manfaat Kelompok 3 (kelompok default untuk kategori tanpa pemetaan).
- Bangunan permanen: opsi masa manfaat 20 tahun atau masa manfaat sebenarnya menurut pembukuan.
- **Saat mulai penyusutan fiskal** dapat diatur per kategori: bulan perolehan/pengeluaran (default), atau bulan produksi komersial untuk harta bidang usaha tertentu (kehutanan, perkebunan, peternakan; masa manfaat khusus tanaman keras dan ternak tersedia sebagai pilihan kelompok).
- **Biaya perbaikan** yang dikapitalisasi ditambahkan pada **nilai sisa buku fiskal** dan disusutkan prospektif.
- Pada pelepasan/penarikan, nilai sisa buku fiskal diakui sebagai kerugian dan harga jual/penggantian sebagai penghasilan (disajikan pada laporan rekonsiliasi fiskal).

### 4.7 Proses Penyusutan Bulanan
- Dijalankan per periode akuntansi OPEN: **pratinjau** (daftar aset, nilai penyusutan, total per akun/Dimension) → **Post**.
- Menghasilkan satu jurnal per proses, baris dikelompokkan per akun dan per kombinasi Dimension aset (beban penyusutan terdistribusi ke Cost Center masing-masing aset).
- **Idempoten per periode**: menjalankan ulang periode yang sama hanya memproses aset yang belum disusutkan; proses yang sudah diposting dapat dibatalkan (jurnal pembalik) selama periode OPEN.
- **Catch-up**: aset yang didaftarkan terlambat disusutkan sekaligus untuk bulan-bulan yang terlewat (dengan peringatan bila mencakup periode CLOSED — bagian periode CLOSED dibebankan pada periode OPEN berjalan).
- Opsi **penjadwalan otomatis** akhir bulan (default nonaktif — pratinjau manual).
- Peringatan saat closing periode bila proses penyusutan periode tersebut belum dijalankan.

### 4.8 Perubahan Estimasi, Penambahan Nilai, dan Penurunan Nilai
- **Perubahan estimasi** (umur manfaat/residu/metode): berlaku **prospektif** dari periode perubahan; riwayat perubahan dicatat.
- **Penambahan nilai** (pengeluaran lanjutan yang memenuhi kriteria kapitalisasi): menambah harga perolehan; penyusutan sisa dihitung ulang prospektif atas nilai tercatat baru dan sisa umur.
- **Penurunan nilai**: mengurangi nilai tercatat pada tanggal penurunan; penyusutan selanjutnya dihitung dari nilai tercatat baru. Model revaluasi **tidak** termasuk V4.

### 4.9 Mutasi
- Perpindahan antar Cost Center/Lokasi/Project mengubah **Dimension aset sejak tanggal mutasi** (beban penyusutan setelah tanggal tersebut ikut Dimension baru); tidak ada jurnal GL.
- Riwayat mutasi tercatat (tanggal, dari/ke, alasan, pembuat).
- Mutasi fisik, check-in/out, dan alur *stock opname* lanjutan tetap diurus sistem operasional; pembacaan barcode dan verifikasi fisik dasar tersedia di Ledgery (4.13).

### 4.10 Pelepasan dan Penghapusan
- Penjualan lewat faktur penjualan (AR) dengan baris *Pelepasan Aset* yang merujuk kartu aset; Ledgery menghitung laba/rugi pelepasan = harga jual − nilai tercatat pada tanggal pelepasan.
- Penghapusan (rusak/hilang/dimusnahkan) lewat dokumen Penghapusan dengan alasan.
- Void pelepasan/penghapusan hanya selama periode OPEN; aset kembali ke status aktif dengan penyusutan dihitung ulang.

### 4.11 Saldo Awal
- Impor daftar aset per tanggal go-live: harga perolehan, akumulasi penyusutan komersial, akumulasi penyusutan fiskal, sisa umur, kategori, Dimension.
- Total per akun (harga perolehan dan akumulasi, per kategori) divalidasi terhadap saldo GL akun `FIXED_ASSET`; selisih ditampilkan.
- Saldo awal tidak membuat jurnal GL baru (saldo GL sudah ada).

### 4.12 Laporan
| Laporan | Isi |
|---|---|
| **Daftar Aset Tetap** | Seluruh aset beserta nilai perolehan, akumulasi, nilai tercatat per tanggal; filter kategori/Dimension/status |
| **Jadwal Penyusutan** | Proyeksi penyusutan per aset dan per kategori ke depan |
| **Mutasi Aset Tetap (Roll-forward)** | Per kategori: saldo awal, penambahan, pelepasan/penghapusan, penyusutan, penurunan nilai, saldo akhir — dasar catatan atas laporan keuangan |
| **Penyusutan per Dimension** | Beban penyusutan per Cost Center/Lokasi/Project |
| **Rekonsiliasi Komersial vs Fiskal** | Per aset dan total: penyusutan komersial, penyusutan fiskal, selisih (koreksi fiskal), nilai sisa buku komersial vs fiskal |
| **Aset Disusutkan Penuh** | Aset yang masih dipakai tetapi nilai tercatat sudah = residu |
| **Laba/Rugi Pelepasan** | Rincian pelepasan per periode |
| **Rekonsiliasi Sub Ledger vs GL** | Harga perolehan dan akumulasi per kategori vs akun kontrol |
| **Status Pelabelan** | Jumlah aset belum dilabel / tercetak / terpasang / rusak-hilang per kategori dan lokasi |
| **Riwayat Cetak Label** | Siapa mencetak label apa, kapan, template, jumlah, dan alasan cetak ulang |
| **Hasil Verifikasi Fisik** | Per sesi: ringkasan (ditemukan, lokasi berbeda, belum ditemukan, tidak terdaftar) dan daftar selisih |

Acuan standar: PSAK 216 tentang Aset Tetap (penomoran baru PSAK 16) dan PSAK 238 tentang Aset Takberwujud.

### 4.13 Barcode Labelling & Reading (Pelabelan dan Pembacaan Aset)

#### 4.13.1 Kode Tag
- Setiap aset aktif memiliki **kode tag** unik per tenant yang dicetak pada label. Default = nomor aset; format (prefix, panjang) dapat diatur di Setting.
- Kode tag dapat **diisi dari luar** (mis. oleh EAM operasional) lewat API; tetap harus unik per tenant.
- Kode tag **tidak berubah** saat mutasi, perubahan kategori, atau penambahan nilai, dan tidak dipakai ulang untuk aset lain setelah aset dijual/dihapuskan.
- Isi QR/barcode **hanya kode tag** (dengan awalan tenant). Tidak ada nilai finansial atau data sensitif di dalam label; detail aset diambil dari sistem setelah scan dan hanya untuk pengguna yang berhak.

#### 4.13.2 Pelabelan (Label)
- **Simbologi**: QR Code dan Barcode Code 128; tenant memilih salah satu atau keduanya.
- **Template label**: ukuran (preset 50×25 mm, 70×30 mm, lembar A4 multi-label, atau ukuran kustom) dan isi label (logo/nama perusahaan, nama aset, nomor aset, kategori, lokasi/Cost Center, tahun perolehan, QR/barcode). Tenant dapat menyimpan beberapa template.
- **Cetak**: satu aset, aset terpilih, atau banyak aset berdasarkan filter (kategori, lokasi, Cost Center, *belum berlabel*). Hasil berupa PDF siap cetak; printer label termal memakai cetak dari browser (perintah ZPL/TSPL ditunda).
- **Cetak ulang** wajib menyertakan alasan (label rusak/hilang/tidak terbaca) dan tercatat di riwayat cetak.
- **Status label** per aset: `BELUM_DILABEL` → `TERCETAK` → `TERPASANG` (otomatis saat scan pertama atau dikonfirmasi petugas) → `RUSAK_HILANG`.
- Label hanya untuk aset berstatus aktif (aset CIP baru dilabel setelah dikapitalisasi).
- **Pendaftaran banyak unit identik** (mis. 50 kursi): fitur "Duplikasi menjadi N unit" membuat N kartu aset, masing-masing dengan kode tag sendiri.

#### 4.13.3 Pembacaan (Scan)
- **Metode**: kamera perangkat melalui aplikasi web/PWA (QR dan Code 128), scanner barcode eksternal USB/Bluetooth (mode keyboard), atau input manual kode tag.
- **Scan Cepat**: hasil scan menampilkan kartu ringkas aset (nama, nomor aset, kategori, status, lokasi/Dimension, status label; nilai tercatat hanya untuk peran yang berhak) dengan aksi cepat: lihat detail, ajukan mutasi, cetak ulang label.
- **Sesi Verifikasi Fisik**: sesi dengan cakupan (lokasi/Cost Center/kategori) dan tanggal; petugas memindai aset satu per satu. Hasil per aset:

| Hasil | Arti |
|---|---|
| Ditemukan | Terpindai dan lokasinya sesuai kartu aset |
| Ditemukan di lokasi lain | Terpindai, tetapi lokasi sesi berbeda dari lokasi kartu aset |
| Belum ditemukan | Termasuk cakupan sesi tetapi tidak terpindai |
| Tidak terdaftar | Kode tag tidak dikenal di tenant ini |

- Pemindaian ganda dalam satu sesi diabaikan; setiap scan tercatat (waktu, pengguna, perangkat, lokasi sesi).
- **Tindak lanjut** setelah sesi ditutup: usulan perbaikan lokasi (mutasi massal setelah ditinjau) atau penandaan "belum ditemukan" yang dapat diteruskan menjadi dokumen Penghapusan. Verifikasi fisik **tidak otomatis memposting jurnal**.
- Sesi yang sudah ditutup bersifat final; hanya admin yang dapat membukanya kembali.

#### 4.13.4 Hak Akses & Keamanan
- Peran baru **`PETUGAS_ASET`** untuk petugas lapangan: boleh scan, menjalankan sesi verifikasi, dan melihat informasi non-finansial; **tidak** melihat harga perolehan/akumulasi/nilai tercatat dan tidak dapat memposting dokumen.
- Kode tag hanya dipetakan di dalam tenant pengguna yang login; kode dari tenant lain atau tak dikenal dijawab "tidak terdaftar".
- Cetak label dan seluruh scan masuk ke audit trail.

#### 4.13.5 Batasan V4
- Pemindaian membutuhkan koneksi internet (mode offline ditunda).
- RFID/GPS, penugasan opname per petugas, dan persetujuan hasil opname berjenjang tetap di ranah EAM operasional.

---

## 5. Integrasi API v1

Endpoint baru bersifat aditif di bawah `/v1`, memakai API key tenant, `idempotency_key`, `external_ref`, dan tercatat di IntegrationLog.

| Endpoint | Fungsi |
|---|---|
| `GET /v1/cash/accounts`, `GET /v1/cash/accounts/:id/balance?tanggal=` | Daftar rekening dan saldo kas/bank |
| `POST /v1/cash/receipts`, `POST /v1/cash/disbursements`, `POST /v1/cash/transfers` | Kirim dokumen kas/bank dari aplikasi sumber (mis. gaji dari Rekan sebagai pengeluaran bank) |
| `POST /v1/cash/bank-statements` | Kirim baris mutasi rekening (mis. dari payment gateway/penyedia data bank) untuk rekonsiliasi |
| `GET /v1/fixed-assets?status=&external_ref=`, `GET /v1/fixed-assets/:ref` | Daftar dan detail aset beserta nilai akuntansi |
| `PUT /v1/fixed-assets/:external_ref` | Daftarkan/perbarui aset (identitas, `tag_code` opsional, kategori, tanggal perolehan, nilai, Dimension) |
| `POST /v1/fixed-assets/:ref/capitalize`, `/transfer`, `/impairment`, `/dispose` | Peristiwa siklus hidup aset |
| `GET /v1/fixed-assets/:ref/schedule` | Jadwal penyusutan aset (komersial dan fiskal) |
| `GET /v1/fixed-assets/categories` | Daftar kategori aset |
| `GET /v1/fixed-assets/by-tag/:tag_code` | Cari aset dari kode tag hasil scan |
| `POST /v1/fixed-assets/verification-sessions`, `POST /v1/fixed-assets/verification-sessions/:id/scans` | Buat sesi verifikasi dan kirim hasil scan (mis. dari aplikasi lapangan/EAM) |
| `GET /v1/fixed-assets/verification-sessions/:id` | Hasil dan selisih sesi verifikasi |
| `GET /v1/periods?tanggal=` | Cek status periode via API key (prasyarat integrasi: aplikasi sumber dapat memvalidasi tanggal sebelum mengirim dokumen) |

Integrasi lama berbasis jurnal mentah ke akun kas/bank tetap berjalan (auto-capture, lihat 2.2). Jurnal mentah ke akun `FIXED_ASSET` ditolak setelah akun ditandai sebagai akun kontrol.

---

## 6. Rekonsiliasi & Interaksi dengan Fitur Lain

| Fitur | Perilaku |
|---|---|
| **Accounting Period** | Seluruh dokumen kas/bank dan aset tetap bertanggal di periode CLOSED ditolak. Pemeriksaan saat closing diperluas: rekonsiliasi sub ledger vs GL (kas/bank, aset tetap), **proses penyusutan periode belum dijalankan**, dan rekonsiliasi bank belum selesai (peringatan; dapat diubah menjadi blokir di Setting) |
| **Multicurrency** | Rekening dan dokumen kas valas memakai kurs harian; aset diperoleh dengan kurs tanggal perolehan (nilai historis, tidak direvaluasi) |
| **Dimensions** | Baris dokumen kas dan kartu aset membawa Dimension ke jurnal; beban penyusutan mengikuti Dimension aset |
| **AR / AP (V3)** | Penerimaan/pembayaran memakai rekening master; baris faktur bertipe *Aset* / *Pelepasan Aset* menghubungkan ke sub ledger aset |
| **Perpajakan** | PPN masukan atas perolehan aset tetap melalui faktur AP dan masuk rekap PPN; laporan rekonsiliasi fiskal aset menjadi lampiran dasar koreksi fiskal |
| **Kebijakan Posting** | Alur Draft → Post sendiri; Post = persetujuan |
| **Autentikasi & Peran** | Peran baru `PETUGAS_ASET` (ekstensi Modul Autentikasi) untuk scan dan verifikasi fisik tanpa akses nilai finansial; endpoint API memakai API key tenant seperti biasa |
| **Log Integrasi** | Seluruh endpoint baru tercatat seperti endpoint v1 lainnya |

---

## 7. Kompatibilitas & Strategi Peluncuran

- Aditif dan **backward compatible**: tidak ada perubahan pada `/v1/journals`; kedua sub ledger nonaktif secara default.
- Jurnal mentah ke akun kas/bank tetap diterima (auto-capture) — integrasi lama tidak terganggu.
- Dokumen AR/AP V3 yang sudah ada tetap valid setelah migrasi rekening kas/bank.
- Urutan rilis yang disarankan: **Kas & Bank (master, dokumen, buku kas) → Rekonsiliasi Bank → Aset Tetap (kategori, kartu aset, perolehan) → Penyusutan (komersial & fiskal) → Pelepasan/Mutasi/Penurunan Nilai → Label & Pembacaan Barcode (dapat dikerjakan paralel setelah Kartu Aset) → Laporan & Rekonsiliasi terpadu**.

---

## 8. Di Luar Lingkup V4

- Giro/cek mundur dan register warkat
- Integrasi bank langsung (host-to-host, *open banking*, format MT940/BAI2), pembayaran massal ke bank
- Revaluasi kurs *unrealized* saldo valas kas/bank
- Model revaluasi aset, aset sewa (PSAK 116), properti investasi, aset biologis (PSAK 241; tanaman produktif/bearer plant masuk Aset Tetap, aset biologis lainnya dibahas terpisah)
- Penyusutan berbasis unit produksi
- Pajak tangguhan (jurnal), hanya laporan beda temporer
- Fitur operasional aset lanjutan: penandaan RFID/GPS, maintenance, work order, alur *stock opname* berbasis penugasan dan persetujuan berjenjang (ranah EAM operasional); label barcode/QR dan pembacaan dasar termasuk V4
- Cetak langsung ke printer label via perintah ZPL/TSPL dan mode offline pada pemindaian
- PPN pada dokumen kas langsung

---

## 9. Keputusan (Telah Dikonfirmasi)

| # | Topik | Keputusan |
|---|---|---|
| 1 | Pembagian peran Ledgery vs EAM operasional (Vigilo) | Ledgery = sumber kebenaran nilai akuntansi, penyusutan komersial & fiskal; EAM = data operasional dan mengirim peristiwa aset via API (tidak menghitung penyusutan sendiri) |
| 2 | Akun kas/bank tetap direct posting dengan auto-capture | Ya, agar integrasi lama (mis. jurnal gaji dari Rekan) tidak putus |
| 3 | Penyusutan fiskal sebagai buku paralel tidak dijurnal | Ya; hanya laporan rekonsiliasi fiskal |
| 4 | Metode penyusutan V4 | Garis Lurus dan Saldo Menurun; unit produksi ditunda |
| 5 | Konvensi awal penyusutan | Bulan Penuh (default), opsi Bulan Berikutnya, setting tenant, tanpa prorata harian |
| 6 | Persetujuan berjenjang berdasarkan nilai untuk kapitalisasi/pelepasan | Tidak di Ledgery (Draft → Post); diterapkan EAM bila dipakai |
| 7 | Aset tak berwujud (amortisasi) | Termasuk V4 sebagai jenis kategori dengan mesin yang sama |
| 8 | Impor rekening koran | CSV/Excel; MT940 ditunda |
| 9 | Kas kecil sistem imprest | Termasuk V4 |
| 10 | Arus kas metode langsung via kategori arus kas pada akun lawan | Termasuk V4 sebagai laporan tambahan |
| 11 | Rekonsiliasi bank belum selesai / penyusutan belum dijalankan saat closing | Peringatan (dapat diubah menjadi blokir di Setting) |
| 12 | Skema harga: sub ledger kas/bank dan aset tetap | Dibahas terpisah (sama seperti V3) |
| 13 | Simbologi label | QR Code dan Code 128, dipilih per tenant |
| 14 | Kode tag | Default = nomor aset; dapat diisi dari EAM; unik per tenant dan tidak dipakai ulang |
| 15 | Verifikasi fisik di Ledgery | Sesi verifikasi sederhana termasuk V4; alur opname lanjutan (penugasan, persetujuan, RFID) tetap di EAM |
| 16 | Peran `PETUGAS_ASET` tanpa akses nilai finansial | Ya |
| 17 | Cetak ke printer label | PDF/cetak browser; ZPL/TSPL ditunda |
| 18 | Pemindaian offline | Tidak di V4 (membutuhkan koneksi) |

---

*Dokumen ini adalah PRD V4 (delta) Ledgery — melengkapi PRD V1–V3 tanpa mengubah struktur inti yang sudah berjalan. Seluruh keputusan pada bagian 9 sudah dikonfirmasi dan menjadi dasar penyusunan Prompt AI Coding; satu-satunya yang masih dibahas terpisah adalah skema harga (nomor 12). Tarif dan ketentuan penyusutan fiskal (PMK 72/2023) disimpan sebagai master data dan perlu diverifikasi ulang saat implementasi.*
