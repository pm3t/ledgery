import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalDepreciationGroupService } from './services/fiscal-depreciation-group.service';
import { AssetCategoryService } from './services/asset-category.service';
import { FixedAssetService } from './services/fixed-asset.service';
import { FixedAssetV1Service } from './services/fixed-asset-v1.service';
import { AssetStorageService } from './services/storage.service';
import { AssetDepreciationService } from './services/asset-depreciation.service';
import { TagCodeService } from './services/tag-code.service';
import { DocumentNumberingService, SubledgerDocType } from '../subledger/document-numbering.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import {
  ControlAccountType,
  DepreciationMethod,
  FiscalGroupType,
  FixedAssetStatus,
  AssetEventType,
} from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('Modul 21: Sub Ledger Aset Tetap (Fixed Asset Foundation & CIP)', () => {
  let fiscalService: FiscalDepreciationGroupService;
  let categoryService: AssetCategoryService;
  let assetService: FixedAssetService;
  let assetV1Service: FixedAssetV1Service;
  let prisma: any;
  let numberingService: any;
  let subledgerPosting: any;

  const mockTenantId = 'tenant-fa-test';

  beforeEach(async () => {
    prisma = {
      fiscalDepreciationGroup: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      assetCategory: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      fixedAsset: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      assetEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      assetCapitalization: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      assetDepreciationEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      subledgerSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      chartOfAccount: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      journalEntry: {
        aggregate: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    numberingService = {
      getNextNumber: jest.fn().mockImplementation((tId, docType) => {
        return Promise.resolve(`${docType}-2026-0001`);
      }),
      generateNextNumber: jest.fn().mockImplementation((tId, docType) => {
        return Promise.resolve(`${docType}-2026-0001`);
      }),
    };

    subledgerPosting = {
      postSubledgerJournal: jest.fn().mockResolvedValue({
        id: 'journal-fa-001',
        no_voucher: 'AST-2026-0001',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalDepreciationGroupService,
        AssetCategoryService,
        FixedAssetService,
        FixedAssetV1Service,
        AssetStorageService,
        TagCodeService,
        {
          provide: AssetDepreciationService,
          useValue: {
            getAssetSchedule: jest.fn().mockResolvedValue({ komersial: [], fiskal: [] }),
            preview: jest.fn(),
            post: jest.fn(),
            reverse: jest.fn(),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: DocumentNumberingService, useValue: numberingService },
        { provide: SubledgerPostingService, useValue: subledgerPosting },
      ],
    }).compile();

    fiscalService = module.get<FiscalDepreciationGroupService>(FiscalDepreciationGroupService);
    categoryService = module.get<AssetCategoryService>(AssetCategoryService);
    assetService = module.get<FixedAssetService>(FixedAssetService);
    assetV1Service = module.get<FixedAssetV1Service>(FixedAssetV1Service);
  });

  // =========================================================================
  // 1. KELOMPOK PENYUSUTAN FISKAL (PMK 72/2023)
  // =========================================================================
  describe('1. Master Kelompok Penyusutan Fiskal', () => {
    it('Harus melakukan seeding kelompok fiskal standar mengacu PMK 72/2023 (Kelompok 1-4, Bangunan)', async () => {
      prisma.fiscalDepreciationGroup.findUnique.mockResolvedValue(null);
      prisma.fiscalDepreciationGroup.create.mockResolvedValue({});

      const result = await fiscalService.seedFiscalGroups(mockTenantId, true);
      expect(result.createdCount).toBe(9); // 6 standar + 3 industri khusus
      expect(prisma.fiscalDepreciationGroup.create).toHaveBeenCalled();
    });

    it('Harus MENOLAK aset jenis BANGUNAN menggunakan metode Saldo Menurun', async () => {
      prisma.fiscalDepreciationGroup.findUnique.mockResolvedValue(null);

      await expect(
        fiscalService.create(mockTenantId, {
          kode: 'BANGUNAN-TEST',
          nama: 'Bangunan Pabrik',
          jenis: FiscalGroupType.BANGUNAN,
          masaManfaatBulan: 240,
          tarifGarisLurus: 5.0,
          tarifSaldoMenurun: 10.0, // Dilarang untuk bangunan
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 2. MASTER KATEGORI ASET TETAP
  // =========================================================================
  describe('2. Master Kategori Aset Tetap', () => {
    it('Membuat kategori aset harus memastikan akun kontrol bertipe FIXED_ASSET dan non-direct posting', async () => {
      prisma.assetCategory.findUnique.mockResolvedValue(null);
      prisma.fiscalDepreciationGroup.findFirst.mockResolvedValue({
        id: 'fg-1',
        jenis: FiscalGroupType.BUKAN_BANGUNAN,
      });

      // Akun GL ditemukan tapi belum bertipe FIXED_ASSET
      prisma.chartOfAccount.findFirst.mockResolvedValue({
        id: 'acc-asset',
        controlType: ControlAccountType.NONE,
        isControlAccount: false,
      });
      prisma.chartOfAccount.update.mockResolvedValue({});
      prisma.assetCategory.create.mockResolvedValue({ id: 'cat-1', kode: 'KENDARAAN' });

      const res = await categoryService.create(mockTenantId, {
        kode: 'KENDARAAN',
        nama: 'Kendaraan Operasional',
        fiscalGroupId: 'fg-1',
        akunAsetId: 'acc-asset',
        akunAkumulasiId: 'acc-akum',
        akunBebanId: 'acc-beban',
        akunCipId: 'acc-cip',
        akunLabaRugiPelepasanId: 'acc-lr',
        akunRugiPenurunanNilaiId: 'acc-rugi',
        akunRugiPenghapusanId: 'acc-hapus',
      });

      expect(res.kode).toBe('KENDARAAN');
      // Memastikan update controlType FIXED_ASSET dan isControlAccount = true dijalankan
      expect(prisma.chartOfAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { controlType: ControlAccountType.FIXED_ASSET, isControlAccount: true },
        }),
      );
    });
  });

  // =========================================================================
  // 3. KARTU ASET & REGISTRASI (DRAFT, CIP, AKTIVASI)
  // =========================================================================
  describe('3. Registrasi & Siklus Hidup Kartu Aset', () => {
    it('Registrasi manual aset harus membuat nomor aset unik dan event PEROLEHAN', async () => {
      prisma.assetCategory.findFirst.mockResolvedValue({
        id: 'cat-1',
        metodeKomersial: DepreciationMethod.GARIS_LURUS,
        faktorSaldoMenurun: 2.0,
        umurManfaatBulan: 48,
        akunAset: { kode_akun: '1-2001' },
      });
      prisma.fixedAsset.findUnique.mockResolvedValue(null);
      prisma.fixedAsset.create.mockImplementation(({ data }) => Promise.resolve({ id: 'fa-1', ...data }));
      prisma.assetEvent.create.mockResolvedValue({});

      const asset = await assetService.create(mockTenantId, {
        categoryId: 'cat-1',
        nama: 'Laptop ASUS ROG Strix',
        tanggalPerolehan: '2026-11-01',
        hargaPerolehanAsli: 25000000,
      });

      expect(asset.noAset).toBe('ASSET-2026-0001');
      expect(asset.tagCode).toBe('ASSET-2026-0001');
      expect(asset.status).toBe(FixedAssetStatus.DRAFT);
      expect(prisma.assetEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipe: AssetEventType.PEROLEHAN }),
        }),
      );
    });

    it('tagCode duplikat HARUS DITOLAK walau dari aset lain yang sudah ada', async () => {
      prisma.assetCategory.findFirst.mockResolvedValue({ id: 'cat-1', akunAset: {} });
      prisma.fixedAsset.findUnique.mockResolvedValue({
        id: 'fa-existing',
        noAset: 'AST-OLD',
        tagCode: 'TAG-123',
        status: FixedAssetStatus.DIJUAL, // Walau sudah dijual, tagCode TIDAK boleh dipakai ulang
      });

      await expect(
        assetService.create(mockTenantId, {
          categoryId: 'cat-1',
          nama: 'Printer Baru',
          tagCode: 'TAG-123',
          tanggalPerolehan: '2026-11-01',
          hargaPerolehanAsli: 5000000,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('Aktivasi aset DRAFT ke AKTIF wajib mencatat tanggalMulaiDigunakan', async () => {
      prisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'fa-1',
        status: FixedAssetStatus.DRAFT,
      });
      prisma.fixedAsset.update.mockResolvedValue({
        id: 'fa-1',
        status: FixedAssetStatus.AKTIF,
        tanggalMulaiDigunakan: new Date('2026-11-05'),
      });

      const res = await assetService.activate(mockTenantId, 'fa-1', {
        tanggalMulaiDigunakan: '2026-11-05',
      });

      expect(res.status).toBe(FixedAssetStatus.AKTIF);
      expect(prisma.assetEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipe: AssetEventType.MUTASI }),
        }),
      );
    });
  });

  // =========================================================================
  // 4. KAPITALISASI CIP KE AKTIF
  // =========================================================================
  describe('4. Kapitalisasi Aset CIP ke Aset Tetap Aktif', () => {
    it('Kapitalisasi CIP harus memposting jurnal Dr Aset Kategori Baru / Cr CIP Kategori Lama dan mengubah status menjadi AKTIF', async () => {
      prisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'cip-1',
        noAset: 'CIP-2026-0001',
        nama: 'Pembangunan Gedung Kantor Baru',
        status: FixedAssetStatus.CIP,
        hargaPerolehan: 500000000,
        mata_uang: 'IDR',
        category: {
          id: 'cat-cip',
          akunCip: { kode_akun: '1-2999' },
        },
      });

      prisma.assetCategory.findFirst.mockResolvedValue({
        id: 'cat-bangunan',
        nama: 'Bangunan Kantor Permanen',
        akunAset: { kode_akun: '1-2100' },
        umurManfaatBulan: 240,
        metodeKomersial: DepreciationMethod.GARIS_LURUS,
        metodeFiskal: DepreciationMethod.GARIS_LURUS,
      });

      prisma.assetCapitalization.create.mockResolvedValue({ id: 'cap-1', noDokumen: 'ACAP-2026-0001' });
      prisma.fixedAsset.update.mockResolvedValue({ id: 'cip-1', status: FixedAssetStatus.AKTIF });

      const res = await assetService.capitalizeCip(mockTenantId, 'cip-1', {
        categoryId: 'cat-bangunan',
        tanggal: '2026-11-15',
        tanggalMulaiDigunakan: '2026-11-15',
      });

      expect(res.asset.status).toBe(FixedAssetStatus.AKTIF);
      expect(subledgerPosting.postSubledgerJournal).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({
          entries: [
            { kode_akun: '1-2100', tipe: 'DEBIT', jumlah: 500000000, dimensions: undefined },
            { kode_akun: '1-2999', tipe: 'KREDIT', jumlah: 500000000, dimensions: undefined },
          ],
        }),
      );
    });
  });

  // =========================================================================
  // 5. DUPLIKASI MENJADI N UNIT
  // =========================================================================
  describe('5. Duplikasi Menjadi N Unit', () => {
    it('Duplikasi harus menghasilkan kartu aset baru dengan nomor aset dan tag unik per unit', async () => {
      prisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'fa-orig',
        noAset: 'AST-001',
        nama: 'Kursi Ergonomis',
        categoryId: 'cat-1',
        hargaPerolehanAsli: 1500000,
        hargaPerolehan: 1500000,
        status: FixedAssetStatus.AKTIF,
      });

      let seq = 1;
      numberingService.getNextNumber.mockImplementation(() => Promise.resolve(`AST-00${++seq}`));
      prisma.fixedAsset.create.mockImplementation(({ data }) => Promise.resolve({ id: `fa-new-${seq}`, ...data }));

      const res = await assetService.duplicateN(mockTenantId, 'fa-orig', { n: 3 });

      expect(res.assets.length).toBe(3);
      expect(res.assets[0].noAset).toBe('AST-002');
      expect(res.assets[1].noAset).toBe('AST-003');
      expect(res.assets[2].noAset).toBe('AST-004');
    });
  });

  // =========================================================================
  // 6. PUBLIC API V1 (IDEMPOTEN VIA EXTERNAL_REF)
  // =========================================================================
  describe('6. Public API V1 Fixed Asset', () => {
    it('PUT /v1/fixed-assets/:external_ref bersifat IDEMPOTEN', async () => {
      // Pemanggilan pertama: aset belum ada
      prisma.fixedAsset.findUnique.mockResolvedValueOnce(null);
      prisma.assetCategory.findFirst.mockResolvedValue({
        id: 'cat-1',
        akunAset: { kode_akun: '1-2001' },
      });
      prisma.fixedAsset.create.mockResolvedValue({
        id: 'fa-v1',
        externalRef: 'EXT-ASSET-001',
        status: FixedAssetStatus.DRAFT,
      });

      const res1 = await assetV1Service.upsertAsset(mockTenantId, 'EXT-ASSET-001', {
        category_id: 'cat-1',
        nama: 'Mesin CNC Industri',
        tanggal_perolehan: '2026-11-01',
        harga_perolehan: 120000000,
      });

      expect(res1.isExisting).toBe(false);

      // Pemanggilan kedua dengan external_ref yang sama: mengembalikan aset existing (Idempoten)
      prisma.fixedAsset.findUnique.mockResolvedValueOnce({
        id: 'fa-v1',
        externalRef: 'EXT-ASSET-001',
        status: FixedAssetStatus.DRAFT,
      });
      prisma.fixedAsset.update.mockResolvedValue({
        id: 'fa-v1',
        externalRef: 'EXT-ASSET-001',
        nama: 'Mesin CNC Industri (Updated)',
      });

      const res2 = await assetV1Service.upsertAsset(mockTenantId, 'EXT-ASSET-001', {
        category_id: 'cat-1',
        nama: 'Mesin CNC Industri (Updated)',
        tanggal_perolehan: '2026-11-01',
        harga_perolehan: 120000000,
      });

      expect(res2.isExisting).toBe(true);
    });
  });

  // =========================================================================
  // 7. SALDO AWAL ASET TETAP (OPENING BALANCE IMPORT)
  // =========================================================================
  describe('7. Saldo Awal Aset Tetap & Validasi GL', () => {
    it('Saldo awal TIDAK membuat jurnal GL dan memvalidasi total subledger vs saldo akun GL', async () => {
      prisma.assetCategory.findMany.mockResolvedValue([
        {
          id: 'cat-mesin',
          kode: 'MESIN',
          nama: 'Mesin Produksi',
          akunAsetId: 'acc-mesin',
          akunAkumulasiId: 'acc-akum-mesin',
          umurManfaatBulan: 96,
        },
      ]);
      prisma.fixedAsset.findFirst.mockResolvedValue(null);
      prisma.fixedAsset.create.mockImplementation(({ data }) => Promise.resolve({ id: 'fa-op', ...data }));
      prisma.assetDepreciationEntry.create.mockResolvedValue({});

      // Mock saldo GL: Akun Aset = 100.000.000, Akun Akumulasi = 25.000.000
      prisma.journalEntry.aggregate
        .mockResolvedValueOnce({ _sum: { jumlah: 100000000 } }) // debitAsset
        .mockResolvedValueOnce({ _sum: { jumlah: 0 } })         // creditAsset
        .mockResolvedValueOnce({ _sum: { jumlah: 0 } })         // debitAkum
        .mockResolvedValueOnce({ _sum: { jumlah: 25000000 } }); // creditAkum

      const res = await assetService.importOpeningBalance(mockTenantId, {
        items: [
          {
            noAset: 'AST-OP-001',
            nama: 'Mesin Cetak Heidelberg',
            kategoriKode: 'MESIN',
            tanggalPerolehan: '2024-01-01',
            tanggalMulaiDigunakan: '2024-01-01',
            hargaPerolehan: 100000000,
            akumulasiPenyusutanKomersial: 25000000,
            sisaUmurBulan: 72,
          },
        ],
      });

      expect(res.importedCount).toBe(1);
      // Validasi: TIDAK membuat jurnal GL
      expect(subledgerPosting.postSubledgerJournal).not.toHaveBeenCalled();
      // Validasi rekonsiliasi GL
      expect(res.reconciliation[0].status).toBe('COCOK');
      expect(res.reconciliation[0].selisihPerolehan).toBe(0);
      expect(res.reconciliation[0].selisihAkumulasi).toBe(0);
    });
  });
});

