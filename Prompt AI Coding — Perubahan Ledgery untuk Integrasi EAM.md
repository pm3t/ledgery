# Prompt AI Coding — Perubahan Ledgery v1 untuk Integrasi EAM

**Idempotency · Cek Periode · Kode Galat Terstruktur · Kontrak OpenAPI** · 29 Oktober 2026

Dokumen ini berisi satu prompt utama (**Prompt A**, salin dari judul *Peran dan konteks* sampai *Format laporan akhir*) dan satu lampiran kontrak OpenAPI yang dirujuk prompt. Nama file, enum, dan perilaku kode di bawah berasal dari status kode Ledgery yang Anda bagikan; Prompt A mewajibkan AI memverifikasinya lebih dulu (Fase 0), bukan mengasumsikannya.

---

## Prompt A — Implementasi di repo Ledgery (NestJS + Prisma + PostgreSQL)

### Peran dan konteks

Anda adalah senior backend engineer yang mengerjakan **Ledgery**, SaaS akuntansi multi-tenant (NestJS, Prisma, PostgreSQL). Sistem EAM (Enterprise Asset Management) akan mengirim jurnal ke Ledgery lewat **API publik v1** dengan **API Key per tenant**. Agar integrasi aman, Ledgery perlu tiga hal: (1) *idempotency* yang benar-benar aktif di API v1 supaya retry tidak membuat jurnal ganda, (2) endpoint **cek status periode** via API Key, dan (3) **kode galat terstruktur** supaya klien tidak mengenali galat dari teks pesan.

**Fakta kode saat ini (WAJIB diverifikasi di repo, jangan diasumsikan):**

- `schema.prisma`: model `Journal` sudah punya kolom `idempotency_key String?` dengan `@@unique([tenantId, idempotency_key])`.
- `journal.service.ts`: jika `idempotency_key` yang sama dikirim ulang, service tidak membuat data baru dan mengembalikan jurnal yang sudah ada. Service juga memanggil `accountingPeriodService.validateJournalDate()`; periode berstatus `CLOSED` ditolak dengan 400 dan pesan *Periode akuntansi untuk tanggal tersebut telah ditutup*.
- `journals-v1.dto.ts` dan `journals-v1.controller.ts`: field `idempotency_key` **belum diteruskan** ke service (baru ada referensi dan deskripsi).
- `accounting-period.controller.ts`: `GET /periods` dijaga `JwtAuthGuard` (khusus dashboard web). Belum ada endpoint periode via API Key.
- `coa-v1.controller.ts`: `GET /v1/chart-of-accounts` sudah memakai guard API Key dan mengembalikan `kode_akun`, `nama_akun`, `kategori`, `isActive`. **Jadikan ini acuan** untuk guard dan gaya controller v1.
- Konsumen v1 yang sudah ada (Cultiva, Rekan, Servio, DigiSale) **tidak boleh rusak**.

### Aturan kerja (wajib)

1. **Fase 0 — eksplorasi.** Sebelum mengubah kode, baca file di atas dan tuliskan ringkasan temuan: nama guard API Key, bentuk DTO dan response jurnal saat ini, format body galat saat ini, nama enum status periode dan status jurnal, perilaku `validateJournalDate()` bila **tidak ada periode** untuk tanggal tersebut, cara `IntegrationLog` dipakai, dan konvensi penamaan field v1. Jika temuan bertentangan dengan asumsi di prompt ini, **ikuti kode yang ada** dan catat penyimpangannya di laporan akhir.
2. **Kompatibilitas mundur.** Semua perubahan bersifat *additive*: tidak mengubah nama field, tipe, status HTTP, atau teks pesan yang sudah ada. Permintaan tanpa `idempotency_key` harus berperilaku persis seperti sekarang.
3. **Perilaku dashboard (JWT) tidak boleh berubah.** Bila `journal.service` dipakai bersama, perubahan di service hanya boleh menambah field `code` pada galat, bukan mengubah status atau pesan.
4. **Tenant selalu berasal dari API Key**, tidak pernah dari body, query, atau header lain. Tidak boleh ada data lintas tenant.
5. **Diff minimal.** Jangan refactor di luar kebutuhan tugas. Ikuti gaya kode, struktur modul, dan pola pengujian yang sudah ada.
6. Identifier dalam bahasa Inggris, pesan galat yang tampil ke pengguna dalam bahasa Indonesia (mengikuti pesan yang sudah ada).
7. Jangan menyimpan atau mencatat API Key di log.

### Tugas 1 (Prioritas 1) — Idempotency pada `POST /v1/journals`

**Spesifikasi**

- Terima `idempotency_key` di **body** dan header **`Idempotency-Key`**. Bila keduanya ada dan berbeda, balas 400 dengan kode `VALIDATION_ERROR`. Bila hanya salah satu, pakai itu. Validasi: string 1–128 karakter, pola `^[A-Za-z0-9:_.-]+$`.
- Teruskan key ke `journal.service` (jangan membuat jalur baru; pakai logika replay yang sudah ada dan perkuat).
- Tambah kolom Prisma `idempotency_payload_hash String?` pada `Journal` (nullable, migration aman) berisi SHA-256 hex dari payload kanonik.
- **Perilaku:**
  - Key baru: buat jurnal seperti biasa, simpan key dan hash, balas **201**.
  - Key sama + hash sama: **jangan membuat jurnal baru**, kembalikan jurnal yang ada dengan status **200** dan `idempotent_replay: true`. Replay **tidak menjalankan ulang validasi** periode/akun (jurnal sudah sah dibuat). Respons mencerminkan status jurnal **saat ini** (mis. dari menunggu approval menjadi posted).
  - Key sama + hash berbeda: **409** dengan kode `IDEMPOTENCY_CONFLICT`; `details` memuat `journal_id` yang sudah ada.
  - Permintaan serentak dengan key sama: tangkap pelanggaran unique (Prisma `P2002`), baca jurnal yang menang, lalu perlakukan sebagai replay atau konflik.
  - Tanpa key: perilaku lama tidak berubah; respons tetap memuat bentuk lama (boleh menambah `idempotent_replay: false`).
- Jurnal lama yang `idempotency_payload_hash`-nya null dan punya key: perlakukan sebagai replay tanpa membandingkan hash.
- Catat kejadian replay dan konflik pada mekanisme log integrasi yang sudah ada (`IntegrationLog`) bila polanya cocok.

**Payload kanonik dan hash** (sesuaikan nama field dengan DTO):

```ts
import { createHash } from 'crypto';

function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);          // urutan array dipertahankan (urutan baris jurnal bermakna)
  if (v && typeof v === 'object') {
    return Object.keys(v as object).sort().reduce((acc, k) => {
      const val = (v as any)[k];
      if (val !== undefined) acc[k] = canonicalize(val);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return v;
}

export function payloadHash(dto: Record<string, unknown>): string {
  const { idempotency_key, ...rest } = dto;               // key sendiri tidak ikut di-hash
  return createHash('sha256').update(JSON.stringify(canonicalize(rest))).digest('hex');
}
```

**Pseudocode alur:**

```ts
async createJournalV1(tenantId: string, dto: CreateJournalV1Dto, headerKey?: string) {
  const key = resolveKey(dto.idempotency_key, headerKey);      // 400 bila berbeda
  if (!key) return this.createAsToday(tenantId, dto);
  const hash = payloadHash(dto);
  const existing = await this.findByTenantAndKey(tenantId, key);
  if (existing) return this.replayOrConflict(existing, hash);
  try {
    return await this.createWithKey(tenantId, dto, key, hash);   // validasi periode/akun/seimbang tetap berjalan
  } catch (e) {
    if (isUniqueViolation(e, ['tenantId', 'idempotency_key'])) {
      const winner = await this.findByTenantAndKey(tenantId, key);
      return this.replayOrConflict(winner, hash);
    }
    throw e;
  }
}
```

### Tugas 2 (Prioritas 1) — Endpoint cek periode via API Key

Buat controller baru (mis. `accounting-period-v1.controller.ts`) dengan **guard API Key yang sama** seperti `coa-v1.controller.ts`. Jangan mengubah `GET /periods` milik dashboard.

**`GET /v1/periods/check?date=YYYY-MM-DD`**

- Validasi `date`: format ISO `YYYY-MM-DD` dan tanggal kalender yang valid (tolak `2026-02-30`); selain itu 400 `VALIDATION_ERROR`.
- **Gunakan logika yang sama dengan `validateJournalDate()`**: refaktor minimal menjadi method yang mengembalikan hasil (tanpa melempar), lalu `validateJournalDate()` memanggil method itu dan tetap melempar seperti sekarang. Tujuan: `can_post` **selalu konsisten** dengan keputusan saat posting.
- Respons 200:

```json
{
  "date": "2026-09-15",
  "status": "CLOSED",
  "can_post": false,
  "period": {
    "id": "per_01",
    "name": "September 2026",
    "start_date": "2026-09-01",
    "end_date": "2026-09-30"
  }
}
```

- `status`: `OPEN`, `CLOSED`, atau `NOT_DEFINED` (belum ada periode yang mencakup tanggal). Petakan dari enum Prisma yang ada. `can_post` untuk `NOT_DEFINED` **mengikuti perilaku `validateJournalDate()` saat ini** (laporkan perilakunya di laporan akhir). `period` bernilai `null` bila `NOT_DEFINED`.
- Hanya membaca; tidak ada efek samping.

**`GET /v1/periods?from=YYYY-MM-DD&to=YYYY-MM-DD&status=OPEN|CLOSED`**

- Daftar periode tenant untuk cermin kalender di EAM. Respons: `{ "data": [ { "id", "name", "start_date", "end_date", "status" } ] }`, urut `start_date` naik. Filter opsional; batasi maksimal 200 baris (paginasi sederhana bila pola v1 sudah ada).

### Tugas 3 (Prioritas 1) — Kode galat terstruktur untuk API v1

**Bentuk body galat v1** (additive; field lama dipertahankan):

```json
{
  "statusCode": 400,
  "code": "PERIOD_CLOSED",
  "message": "Periode akuntansi untuk tanggal tersebut telah ditutup",
  "error": "Bad Request",
  "details": { "date": "2026-09-15" },
  "request_id": "3f2b9c1e"
}
```

**Daftar kode** (status HTTP mengikuti yang sudah ada, kecuali dicatat):

| Kode | Dilempar saat | Status |
| --- | --- | --- |
| `VALIDATION_ERROR` | Validasi DTO/query gagal, format tanggal salah, key idempotency tidak valid | 400 |
| `PERIOD_CLOSED` | Tanggal jurnal jatuh di periode `CLOSED` | **400 (tetap)** |
| `ACCOUNT_NOT_FOUND` | Kode akun tidak ada di COA tenant | mengikuti yang ada |
| `ACCOUNT_INACTIVE` | Akun tidak aktif atau akun induk | mengikuti yang ada |
| `UNBALANCED_JOURNAL` | Total debit ≠ kredit | mengikuti yang ada |
| `DIMENSION_VALUE_NOT_FOUND` | Nilai dimensi tidak ada (hanya jika dimensi didukung di v1) | mengikuti yang ada |
| `IDEMPOTENCY_CONFLICT` | Key sama, payload berbeda | 409 |
| `INVALID_API_KEY` | API Key tidak valid | 401 |
| `FORBIDDEN` | Key valid tapi tidak berhak | 403 |
| `RATE_LIMITED` | Melebihi batas laju (jika mekanismenya ada) | 429 |
| `INTERNAL_ERROR` | Galat tak terduga | 500 |

**Implementasi**

- Buat enum `ApiErrorCode` dan kelas galat domain (mis. `LedgeryApiException extends HttpException`) yang memuat `code`, `message`, `details`. Respons memuat `statusCode`, `message`, dan `error` seperti bentuk NestJS yang sekarang, **ditambah** `code`, `details`, `request_id`.
- Ganti titik-titik di `journal.service` yang saat ini melempar `BadRequestException` untuk kasus di atas dengan galat domain **berstatus dan berpesan identik**. Jangan mengubah teks pesan.
- Pasang *exception filter* yang **hanya berlaku untuk controller `/v1/*`** untuk menormalkan bentuk galat (termasuk galat validasi `class-validator` menjadi `VALIDATION_ERROR` dengan `details` berisi daftar field).
- `request_id`: pakai header `X-Request-Id` bila ada, jika tidak buat UUID pendek; kembalikan di body dan di header respons `X-Request-Id`, serta sertakan di log.

### Tugas 4 (Prioritas 2) — Baca status jurnal

- `GET /v1/journals/:id` dan `GET /v1/journals?idempotency_key=...` (guard API Key, hanya jurnal milik tenant; tidak ditemukan = 404 `NOT_FOUND`).
- Respons memuat minimal: `id`, `voucher_no` (nomor voucher yang sudah ada), `status`, `tanggal`/tanggal jurnal, total debit dan kredit, `idempotency_key`. `status` dinormalkan ke **`POSTED` | `PENDING_REVIEW` | `REJECTED`**; petakan dari status internal yang ada dan **laporkan tabel pemetaannya**.
- Tujuan: EAM dapat *polling* status jurnal yang menunggu approval (Ledgery belum punya webhook).

### Tugas 5 (Prioritas 2) — Audit kapasitas DTO jurnal (jangan langsung mengubah)

Periksa `journals-v1.dto.ts` dan laporkan: (a) apakah setiap baris jurnal menerima **dimensi** (Cost Center, Lokasi, Project) dan bagaimana bentuknya, (b) apakah ada field untuk **metadata sumber** (jenis event, referensi, id run), (c) **batas jumlah baris** per jurnal. Kebutuhan EAM: dimensi per baris, `source` opsional `{ system, module, event_type, reference_type, reference_id, run_id }` yang disimpan sebagai JSON (kolom nullable `source_meta Json?`), dan minimal **500 baris** per jurnal. Implementasikan **hanya** bagian yang sudah punya model pendukung (mis. Dimensions V2 sudah ada di database); sisanya cukup dilaporkan sebagai rekomendasi.

### Tugas 6 — Dokumentasi OpenAPI

- Bila `@nestjs/swagger` sudah dipakai, tambahkan dekorator (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiHeader`) untuk endpoint di atas. Bila belum, **jangan menambah dependensi**; cukup simpan file kontrak.
- Simpan kontrak final di `docs/openapi/ledgery-v1-eam.yaml` berdasarkan **Lampiran** di bawah, disesuaikan dengan nama field dan skema jurnal yang sebenarnya. Pastikan YAML valid (jalankan linter OpenAPI bila tersedia).

### Pengujian (wajib lulus)

Tambahkan pengujian unit dan e2e mengikuti pola yang ada:

1. Key baru membuat jurnal (201) dan menyimpan hash.
2. Key sama + payload sama mengembalikan jurnal yang sama (200, `idempotent_replay: true`), jumlah jurnal di database tetap 1.
3. Key sama + payload beda menghasilkan 409 `IDEMPOTENCY_CONFLICT`.
4. Dua request serentak dengan key sama menghasilkan tepat satu jurnal.
5. Key di header dan di body yang berbeda menghasilkan 400.
6. Replay setelah periode ditutup tetap 200 (tidak divalidasi ulang); key **baru** pada periode closed menghasilkan 400 `PERIOD_CLOSED`.
7. Key yang sama dipakai tenant berbeda tidak saling bertabrakan.
8. Tanpa key: perilaku lama (regresi).
9. `GET /v1/periods/check`: status OPEN, CLOSED, NOT\_DEFINED; tanggal tidak valid; **konsistensi**: untuk setiap kasus, `can_post` sama dengan hasil posting jurnal pada tanggal itu.
10. Galat v1 memuat `code`, `message` lama tidak berubah, dan `X-Request-Id` dikembalikan; galat dashboard (JWT) tidak berubah bentuk.
11. Endpoint periode dan jurnal menolak API Key tenant lain (tidak ada kebocoran lintas tenant).

### Kriteria penerimaan

- [ ] Seluruh pengujian di atas lulus; pengujian lama tidak ada yang gagal.
- [ ] `prisma validate` dan migration berjalan mulus pada database kosong dan database berisi; kolom baru nullable.
- [ ] Konsumen v1 yang ada (permintaan tanpa `idempotency_key`) tidak berubah perilaku.
- [ ] `can_post` pada cek periode selalu sama dengan keputusan posting.
- [ ] Tidak ada API Key di log.
- [ ] Lint dan build bersih; file `docs/openapi/ledgery-v1-eam.yaml` valid.

### Format laporan akhir

Sajikan: (1) ringkasan temuan Fase 0 dan penyimpangan dari asumsi, (2) daftar file yang diubah/ditambah, (3) migration beserta SQL-nya, (4) tabel pemetaan status jurnal internal ke `POSTED/PENDING_REVIEW/REJECTED`, (5) perilaku `can_post` untuk `NOT_DEFINED`, (6) hasil audit Tugas 5, (7) cara menjalankan pengujian, dan (8) hal yang sengaja tidak dikerjakan beserta alasannya.

---

## Lampiran — Kontrak OpenAPI (bagian baru/diubah untuk integrasi EAM)

Skema jurnal yang sudah ada (`journals-v1.dto.ts`) **dipertahankan**; di bawah hanya bagian yang ditambah atau diubah. Nama header API Key harus disesuaikan dengan guard yang sudah ada.

```yaml
openapi: 3.0.3
info:
  title: Ledgery Public API v1 - Tambahan untuk integrasi EAM
  version: 1.1.0
servers:
  - url: https://{host}
    variables:
      host: { default: api.ledgery.example }
security:
  - ApiKeyAuth: []
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key   # sesuaikan dengan guard API Key yang ada
  schemas:
    ApiError:
      type: object
      required: [statusCode, code, message]
      properties:
        statusCode: { type: integer }
        code:
          type: string
          enum: [VALIDATION_ERROR, PERIOD_CLOSED, ACCOUNT_NOT_FOUND, ACCOUNT_INACTIVE, UNBALANCED_JOURNAL, DIMENSION_VALUE_NOT_FOUND, IDEMPOTENCY_CONFLICT, INVALID_API_KEY, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR]
        message: { type: string }
        error: { type: string }
        details: { type: object, additionalProperties: true }
        request_id: { type: string }
    JournalCreateRequest:
      description: Skema existing journals-v1.dto.ts, ditambah field di bawah
      type: object
      properties:
        idempotency_key:
          type: string
          minLength: 1
          maxLength: 128
          pattern: '^[A-Za-z0-9:_.-]+$'
        source:
          type: object
          description: Opsional; metadata sumber (Tugas 5)
          properties:
            system: { type: string }
            module: { type: string }
            event_type: { type: string }
            reference_type: { type: string }
            reference_id: { type: string }
            run_id: { type: string, nullable: true }
    JournalResponse:
      description: Skema response existing, ditambah field di bawah
      type: object
      properties:
        id: { type: string }
        voucher_no: { type: string }
        status: { type: string, enum: [POSTED, PENDING_REVIEW, REJECTED] }
        idempotency_key: { type: string, nullable: true }
        idempotent_replay: { type: boolean }
    PeriodInfo:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        start_date: { type: string, format: date }
        end_date: { type: string, format: date }
    PeriodCheck:
      type: object
      required: [date, status, can_post]
      properties:
        date: { type: string, format: date }
        status: { type: string, enum: [OPEN, CLOSED, NOT_DEFINED] }
        can_post: { type: boolean }
        period: { allOf: [{ $ref: '#/components/schemas/PeriodInfo' }], nullable: true }
  responses:
    Error:
      description: Galat
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ApiError' }
paths:
  /v1/journals:
    post:
      summary: Buat jurnal (idempotent bila idempotency_key dikirim)
      parameters:
        - in: header
          name: Idempotency-Key
          required: false
          schema: { type: string, minLength: 1, maxLength: 128 }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/JournalCreateRequest' }
      responses:
        '201': { description: Jurnal baru dibuat, content: { application/json: { schema: { $ref: '#/components/schemas/JournalResponse' } } } }
        '200': { description: Replay - key sama dan payload sama, content: { application/json: { schema: { $ref: '#/components/schemas/JournalResponse' } } } }
        '400': { $ref: '#/components/responses/Error' }
        '401': { $ref: '#/components/responses/Error' }
        '409': { description: Key sama dengan payload berbeda (IDEMPOTENCY_CONFLICT), content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
    get:
      summary: Cari jurnal by idempotency_key
      parameters:
        - { in: query, name: idempotency_key, required: true, schema: { type: string } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/JournalResponse' } } } }
        '404': { $ref: '#/components/responses/Error' }
  /v1/journals/{id}:
    get:
      summary: Baca jurnal dan statusnya
      parameters:
        - { in: path, name: id, required: true, schema: { type: string } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/JournalResponse' } } } }
        '404': { $ref: '#/components/responses/Error' }
  /v1/periods/check:
    get:
      summary: Cek apakah tanggal dapat diposting
      parameters:
        - { in: query, name: date, required: true, schema: { type: string, format: date } }
      responses:
        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/PeriodCheck' } } } }
        '400': { $ref: '#/components/responses/Error' }
  /v1/periods:
    get:
      summary: Daftar periode akuntansi tenant
      parameters:
        - { in: query, name: from, schema: { type: string, format: date } }
        - { in: query, name: to, schema: { type: string, format: date } }
        - { in: query, name: status, schema: { type: string, enum: [OPEN, CLOSED] } }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      allOf:
                        - { $ref: '#/components/schemas/PeriodInfo' }
                        - type: object
                          properties:
                            status: { type: string, enum: [OPEN, CLOSED] }
```

### Cara EAM memakai kontrak ini

| Situasi | Perilaku EAM |
| --- | --- |
| Mengirim jurnal | Selalu menyertakan `idempotency_key` (format `tenant:event_type:reference_id:version`) |
| Timeout atau 5xx | Kirim ulang dengan key yang sama; respons 200 dengan `idempotent_replay: true` dianggap sukses |
| 409 `IDEMPOTENCY_CONFLICT` | Tahan jurnal dan beri alert engineer (payload berubah untuk key yang sama) |
| 400 `PERIOD_CLOSED` | Status jurnal `BLOCKED_PERIOD_LOCKED`; tidak dikirim ulang otomatis |
| Sebelum posting run | Panggil `GET /v1/periods/check?date=` untuk pra-validasi |
| Status `PENDING_REVIEW` | *Polling* `GET /v1/journals/{id}` sampai `POSTED` atau `REJECTED` |
