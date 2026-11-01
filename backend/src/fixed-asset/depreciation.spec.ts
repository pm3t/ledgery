import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DepreciationEngineService } from './services/depreciation-engine.service';
import { AssetDepreciationService } from './services/asset-depreciation.service';
import { DocumentNumberingService, SubledgerDocType } from '../subledger/document-numbering.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { JournalService } from '../journal/journal.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import {
  DepreciationMethod,
  DepreciationConvention,
  FiscalGroupType,
  FiscalStartRule,
  FixedAssetStatus,
  PeriodStatus,
  AssetDepreciationRunStatus,
  DepreciationBook,
  DepreciationEntryStatus,
  AssetEventType,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Modul 22: Mesin Penyusutan dan Proses Penyusutan Bulanan (Fixed Asset Depreciation Engine)', () => {
  let engine: DepreciationEngineService;
  let service: AssetDepreciationService;
  let prisma: any;
  let numberingService: any;
  let subledgerPosting: any;
  let journalService: any;
  let periodService: any;

  beforeEach(async () => {
    engine = new DepreciationEngineService();

    prisma = {
      tenant: { findUnique: jest.fn() },
      subledgerSetting: {
        findUnique: jest.fn().mockResolvedValue({
          tenantId: 'tenant-fa-001',
          depreciationConvention: DepreciationConvention.BULAN_PENUH,
          blockPeriodCloseOnDepreciation: true,
          fixedAssetEnabled: true,
          autoDepreciationRun: false,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      accountingPeriod: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      fixedAsset: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      fiscalDepreciationGroup: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      assetDepreciationRun: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assetDepreciationEntry: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      assetCostAddition: {
        create: jest.fn(),
      },
      assetEstimateChange: {
        create: jest.fn(),
      },
      assetEvent: {
        create: jest.fn(),
      },
      chartOfAccount: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    numberingService = {
      getNextNumber: jest.fn().mockImplementation((tId, docType) => {
        return Promise.resolve(`${docType}-2026-0001`);
      }),
    };

    subledgerPosting = {
      postSubledgerJournal: jest.fn().mockResolvedValue({
        id: 'journal-depr-001',
        no_voucher: 'DEPR-2026-0001',
      }),
    };

    journalService = {
      reverseJournal: jest.fn().mockResolvedValue({
        id: 'journal-rev-001',
      }),
    };

    periodService = {
      validateJournalDate: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepreciationEngineService,
        AssetDepreciationService,
        { provide: PrismaService, useValue: prisma },
        { provide: DocumentNumberingService, useValue: numberingService },
        { provide: SubledgerPostingService, useValue: subledgerPosting },
        { provide: JournalService, useValue: journalService },
        { provide: AccountingPeriodService, useValue: periodService },
      ],
    }).compile();

    service = module.get<AssetDepreciationService>(AssetDepreciationService);
  });

  // =========================================================================
  // 1. MESIN PENYUSUTAN MURNI: BUKU KOMERSIAL
  // =========================================================================
  describe('1. Mesin Penyusutan Komersial (DepreciationEngineService)', () => {
    it('Garis Lurus Komersial: alokasi tepat sampai residu tanpa selisih sen', () => {
      // Laptop: Harga 12.000.000, Residu 1.200.000, Umur 12 bulan
      // Beban bulanan = (12jt - 1.2jt) / 12 = 900.000 per bulan
      const schedule = engine.calculateCommercialSchedule(
        {
          id: 'asset-1',
          hargaPerolehan: 12000000,
          nilaiResidu: 1200000,
          umurManfaatBulan: 12,
          metodeKomersial: DepreciationMethod.GARIS_LURUS,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-10'),
          tanggalMulaiDigunakan: new Date('2026-01-15'),
          dapatDisusutkan: true,
          metodeFiskal: DepreciationMethod.GARIS_LURUS,
        },
        DepreciationConvention.BULAN_PENUH,
      );

      expect(schedule.length).toBe(12);
      expect(schedule[0].beban).toBe(900000);
      expect(schedule[0].nilaiTercatat).toBe(11100000);

      const lastMonth = schedule[11];
      expect(lastMonth.nilaiTercatat).toBe(1200000); // Tepat sama dengan residu
      expect(lastMonth.akumulasi).toBe(10800000); // 12jt - 1.2jt
    });

    it('Saldo Menurun Komersial (Double Declining): faktor 2 dan konvergensi residu di akhir masa manfaat', () => {
      // Mesin: Harga 10.000.000, Residu 500.000, Umur 24 bulan
      const schedule = engine.calculateCommercialSchedule(
        {
          id: 'asset-2',
          hargaPerolehan: 10000000,
          nilaiResidu: 500000,
          umurManfaatBulan: 24,
          metodeKomersial: DepreciationMethod.SALDO_MENURUN,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-01'),
          tanggalMulaiDigunakan: new Date('2026-01-01'),
          dapatDisusutkan: true,
          metodeFiskal: DepreciationMethod.SALDO_MENURUN,
        },
        DepreciationConvention.BULAN_PENUH,
      );

      expect(schedule.length).toBe(24);
      const lastMonth = schedule[23];
      // Saldo akhir tidak boleh tembus di bawah nilai residu
      expect(lastMonth.nilaiTercatat).toBe(500000);
      expect(lastMonth.akumulasi).toBe(9500000);
    });

    it('Konvensi BULAN_BERIKUTNYA menggeser penyusutan ke bulan ke-2', () => {
      const schedule = engine.calculateCommercialSchedule(
        {
          id: 'asset-conv',
          hargaPerolehan: 12000000,
          nilaiResidu: 0,
          umurManfaatBulan: 12,
          metodeKomersial: DepreciationMethod.GARIS_LURUS,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-15'),
          tanggalMulaiDigunakan: new Date('2026-01-20'),
          dapatDisusutkan: true,
          metodeFiskal: DepreciationMethod.GARIS_LURUS,
        },
        DepreciationConvention.BULAN_BERIKUTNYA,
      );

      // Bulan pertama dimulai Februari 2026 (2026-02)
      expect(schedule[0].periodeStr).toBe('2026-02');
      expect(schedule[0].bulan).toBe(2);
      expect(schedule[11].periodeStr).toBe('2027-01');
    });

    it('Aset yang TIDAK dapat disusutkan (mis. Tanah) menghasilkan jadwal kosong (0 beban)', () => {
      const schedule = engine.calculateCommercialSchedule(
        {
          id: 'asset-land',
          hargaPerolehan: 500000000,
          nilaiResidu: 500000000,
          umurManfaatBulan: 0,
          metodeKomersial: DepreciationMethod.GARIS_LURUS,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-01'),
          dapatDisusutkan: false,
          metodeFiskal: DepreciationMethod.GARIS_LURUS,
        },
        DepreciationConvention.BULAN_PENUH,
      );

      expect(schedule.length).toBe(0);
    });
  });

  // =========================================================================
  // 2. MESIN PENYUSUTAN MURNI: BUKU FISKAL (PMK 72 TAHUN 2023)
  // =========================================================================
  describe('2. Mesin Penyusutan Fiskal PMK 72/2023 (DepreciationEngineService)', () => {
    it('Kelompok 1 Fiskal (4 tahun / 48 bulan): Tarif Garis Lurus 25% per tahun', () => {
      // Laptop: 10.000.000
      // Tarif per tahun = 25% * 10jt = 2.500.000 / tahun -> ~208.333,33 / bulan
      const schedule = engine.calculateFiscalSchedule(
        {
          id: 'asset-fiskal-1',
          hargaPerolehan: 10000000,
          nilaiResidu: 0,
          umurManfaatBulan: 48,
          metodeKomersial: DepreciationMethod.GARIS_LURUS,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-01'),
          dapatDisusutkan: true,
          fiscalGroupId: 'group-1',
          metodeFiskal: DepreciationMethod.GARIS_LURUS,
          aturanMulaiFiskal: FiscalStartRule.BULAN_PEROLEHAN,
        },
        {
          id: 'group-1',
          kode: 'KEL_1',
          nama: 'Kelompok 1',
          jenis: FiscalGroupType.BUKAN_BANGUNAN,
          masaManfaatBulan: 48,
          tarifGarisLurus: 25.0,
          tarifSaldoMenurun: 50.0,
        },
      );

      expect(schedule.length).toBe(48);
      // Di akhir bulan ke-48 fiskal harus habis (nilai sisa buku fiskal = 0)
      const lastMonth = schedule[47];
      expect(lastMonth.nilaiTercatat).toBe(0);
      expect(lastMonth.akumulasi).toBe(10000000);
    });

    it('Saldo Menurun Fiskal: Lunasi seluruh sisa buku fiskal pada akhir masa manfaat (PMK 72/2023)', () => {
      // Kelompok 1: 4 tahun, tarif saldo menurun 50%
      const schedule = engine.calculateFiscalSchedule(
        {
          id: 'asset-fiskal-sm',
          hargaPerolehan: 10000000,
          nilaiResidu: 0,
          umurManfaatBulan: 48,
          metodeKomersial: DepreciationMethod.SALDO_MENURUN,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-01'),
          dapatDisusutkan: true,
          fiscalGroupId: 'group-1',
          metodeFiskal: DepreciationMethod.SALDO_MENURUN,
          aturanMulaiFiskal: FiscalStartRule.BULAN_PEROLEHAN,
        },
        {
          id: 'group-1',
          kode: 'KEL_1',
          nama: 'Kelompok 1',
          jenis: FiscalGroupType.BUKAN_BANGUNAN,
          masaManfaatBulan: 48,
          tarifGarisLurus: 25.0,
          tarifSaldoMenurun: 50.0,
        },
      );

      expect(schedule.length).toBe(48);
      const lastMonth = schedule[47];
      // Seluruh sisa buku dilunasi penuh pada tahun ke-4
      expect(lastMonth.nilaiTercatat).toBe(0);
      expect(lastMonth.keterangan).toContain('Pelunasan Akhir Masa Manfaat Fiskal');
    });

    it('Override Bangunan Permanen >20 tahun (PMK 72/2023 Pasal 6): 25 tahun = 300 bulan, tarif 4%', () => {
      // Gedung Pabrik: 25 tahun (300 bulan), tarif 100/25 = 4%
      const schedule = engine.calculateFiscalSchedule(
        {
          id: 'asset-gedung',
          hargaPerolehan: 1200000000,
          nilaiResidu: 0,
          umurManfaatBulan: 300,
          metodeKomersial: DepreciationMethod.GARIS_LURUS,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-01'),
          dapatDisusutkan: true,
          fiscalGroupId: 'group-bng-perm',
          metodeFiskal: DepreciationMethod.GARIS_LURUS,
          fiskalUmurOverrideBulan: 300, // 25 tahun
        },
        {
          id: 'group-bng-perm',
          kode: 'BNG_PERM',
          nama: 'Bangunan Permanen',
          jenis: FiscalGroupType.BANGUNAN,
          masaManfaatBulan: 240, // default 20 tahun
          tarifGarisLurus: 5.0,
        },
      );

      expect(schedule.length).toBe(300);
      // Beban tahunan = 4% * 1.2M = 48.000.000 -> 4.000.000/bulan
      expect(schedule[0].beban).toBe(4000000);
      expect(schedule[299].nilaiTercatat).toBe(0);
    });
  });

  // =========================================================================
  // 3. TRANSAKSI LANJUTAN: PENAMBAHAN NILAI & PERUBAHAN ESTIMASI
  // =========================================================================
  describe('3. Transaksi Lanjutan Aset (Cost Addition & Estimate Change)', () => {
    it('Penambahan Nilai (Subsequent Expenditure) dikapitalisasi dan disusutkan secara prospektif', () => {
      // Komputer 12jt, 12 bulan (1jt/bln). Pada bulan ke-4 ada penambahan upgrade 3jt
      const schedule = engine.calculateCommercialSchedule(
        {
          id: 'asset-upg',
          hargaPerolehan: 12000000,
          nilaiResidu: 0,
          umurManfaatBulan: 12,
          metodeKomersial: DepreciationMethod.GARIS_LURUS,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-01'),
          tanggalMulaiDigunakan: new Date('2026-01-01'),
          dapatDisusutkan: true,
          metodeFiskal: DepreciationMethod.GARIS_LURUS,
        },
        DepreciationConvention.BULAN_PENUH,
        [],
        [
          {
            tanggal: new Date('2026-04-05'),
            jumlah: 3000000,
          },
        ],
      );

      // Bulan 1-3 beban = 1.000.000
      expect(schedule[0].beban).toBe(1000000);
      expect(schedule[2].beban).toBe(1000000);

      // Mulai bulan 4, nilai buku ditambah 3.000.000 dan dialokasikan ke sisa 9 bulan
      // Beban baru naik dibanding 1.000.000
      expect(schedule[3].beban).toBeGreaterThan(1000000);
      expect(schedule[11].nilaiTercatat).toBe(0);
    });

    it('Perubahan Estimasi Akuntansi secara prospektif: penyesuaian sisa umur manfaat', () => {
      // Mesin 12jt, 12 bulan. Mulai bulan 7 (2026-07), masa manfaat diperpanjang
      const schedule = engine.calculateCommercialSchedule(
        {
          id: 'asset-est',
          hargaPerolehan: 12000000,
          nilaiResidu: 0,
          umurManfaatBulan: 12,
          metodeKomersial: DepreciationMethod.GARIS_LURUS,
          faktorSaldoMenurun: 2,
          tanggalPerolehan: new Date('2026-01-01'),
          tanggalMulaiDigunakan: new Date('2026-01-01'),
          dapatDisusutkan: true,
          metodeFiskal: DepreciationMethod.GARIS_LURUS,
        },
        DepreciationConvention.BULAN_PENUH,
        [
          {
            berlakuMulaiPeriode: '2026-07',
            sisaUmurBulan: 12, // Diperpanjang 12 bulan lagi dari bulan 7
          },
        ],
      );

      // Bulan 1-6 beban = 1.000.000. Sisa nilai buku di akhir bulan 6 = 6.000.000
      expect(schedule[0].beban).toBe(1000000);
      expect(schedule[5].nilaiTercatat).toBe(6000000);

      // Mulai bulan 7, 6.000.000 dibagi 12 bulan sisa = 500.000 / bulan
      expect(schedule[6].beban).toBe(500000);
      expect(schedule.length).toBe(18); // 6 bulan awal + 12 bulan baru
    });
  });

  // =========================================================================
  // 4. PROSES PENYUSUTAN BULANAN & JURNAL GL (AssetDepreciationService)
  // =========================================================================
  describe('4. Proses Penyusutan Bulanan (AssetDepreciationService)', () => {
    const mockPeriod = {
      id: 'period-2026-01',
      nomor_periode: 1,
      tanggal_mulai: new Date('2026-01-01'),
      tanggal_selesai: new Date('2026-01-31'),
      status: PeriodStatus.OPEN,
      fiscalYear: {
        nama_tahun_buku: 'FY 2026',
        tenantId: 'tenant-fa-001',
      },
    };

    const mockAsset = {
      id: 'fa-asset-01',
      tenantId: 'tenant-fa-001',
      noAset: 'AST-2026-00001',
      nama: 'MacBook Pro M3 Staf Pajak',
      hargaPerolehan: 24000000,
      nilaiResidu: 0,
      umurManfaatBulan: 24,
      metodeKomersial: DepreciationMethod.GARIS_LURUS,
      faktorSaldoMenurun: 2,
      tanggalPerolehan: new Date('2026-01-01'),
      tanggalMulaiDigunakan: new Date('2026-01-01'),
      dapatDisusutkan: true,
      status: FixedAssetStatus.AKTIF,
      nilaiTercatat: 24000000,
      nilaiSisaBukuFiskal: 24000000,
      akumulasiKomersial: 0,
      akumulasiFiskal: 0,
      fiscalGroupId: 'fg-kel-1',
      metodeFiskal: DepreciationMethod.GARIS_LURUS,
      dimensions: { cost_center: 'FINANCE' },
      category: {
        id: 'cat-elek',
        nama: 'Peralatan Elektronik',
        dapatDisusutkan: true,
        aturanMulaiFiskal: FiscalStartRule.BULAN_PEROLEHAN,
        akunAsetId: 'acc-aset-01',
        akunAkumulasiId: 'acc-akum-01',
        akunBebanId: 'acc-beban-01',
        akunAset: { kode_akun: '1-1601', nama_akun: 'Peralatan Kantor' },
        akunAkumulasi: { kode_akun: '1-1691', nama_akun: 'Akumulasi Penyusutan Peralatan' },
        akunBeban: { kode_akun: '5-1601', nama_akun: 'Beban Penyusutan Peralatan' },
      },
      fiscalGroup: {
        id: 'fg-kel-1',
        kode: 'KEL_1',
        nama: 'Kelompok 1',
        jenis: FiscalGroupType.BUKAN_BANGUNAN,
        masaManfaatBulan: 48,
        tarifGarisLurus: 25.0,
      },
      estimateChanges: [],
      costAdditions: [],
      depreciationEntries: [],
    };

    it('Preview: Menghitung beban komersial & fiskal serta menyusun preview GL journal', async () => {
      prisma.accountingPeriod.findFirst.mockResolvedValue(mockPeriod);
      prisma.fixedAsset.findMany.mockResolvedValue([mockAsset]);
      prisma.assetDepreciationEntry.findMany.mockResolvedValue([]);

      const preview = await service.preview('tenant-fa-001', 'period-2026-01');

      expect(preview.totalKomersial).toBe(1000000); // 24jt / 24 bulan = 1.000.000
      expect(preview.totalFiskal).toBe(500000); // 24jt * 25% / 12 = 500.000
      expect(preview.glJournalPreview.isBalanced).toBe(true);
      expect(preview.glJournalPreview.debitLines[0].kodeAkun).toBe('5-1601');
      expect(preview.glJournalPreview.creditLines[0].kodeAkun).toBe('1-1691');
    });

    it('Post: Menghasilkan jurnal GL komersial, entri paralel fiskal, dan update denormalisasi saldo aset', async () => {
      prisma.accountingPeriod.findFirst.mockResolvedValue(mockPeriod);
      prisma.fixedAsset.findMany.mockResolvedValue([mockAsset]);
      prisma.fixedAsset.findUnique.mockResolvedValue(mockAsset);
      prisma.assetDepreciationEntry.findMany.mockResolvedValue([]);
      prisma.assetDepreciationRun.findFirst.mockResolvedValue(null);
      prisma.assetDepreciationRun.create.mockResolvedValue({
        id: 'run-001',
        noDokumen: 'DEPR-2026-00001',
        status: AssetDepreciationRunStatus.POSTED,
      });

      const res = await service.post('tenant-fa-001', 'period-2026-01', 'user-01');

      expect(res.success).toBe(true);
      // Memposting GL journal via SubledgerPostingService
      expect(subledgerPosting.postSubledgerJournal).toHaveBeenCalledWith(
        'tenant-fa-001',
        expect.objectContaining({
          sourceDocType: 'DEPRECIATION_RUN',
          entries: expect.arrayContaining([
            expect.objectContaining({ kode_akun: '5-1601', tipe: 'DEBIT' }),
            expect.objectContaining({ kode_akun: '1-1691', tipe: 'KREDIT' }),
          ]),
        }),
      );

      // Entri disimpan
      expect(prisma.assetDepreciationEntry.create).toHaveBeenCalled();
      // Saldo aset diperbarui
      expect(prisma.fixedAsset.update).toHaveBeenCalled();
    });

    it('Reverse: Membatalkan proses penyusutan dan membalik jurnal GL via JournalService', async () => {
      const mockRun = {
        id: 'run-001',
        noDokumen: 'DEPR-2026-00001',
        status: AssetDepreciationRunStatus.POSTED,
        periodId: 'period-2026-01',
        journalId: 'journal-depr-001',
        period: mockPeriod,
        entries: [
          { assetId: 'fa-asset-01', runId: 'run-001' },
        ],
      };

      prisma.assetDepreciationRun.findFirst.mockResolvedValue(mockRun);
      prisma.fixedAsset.findUnique.mockResolvedValue(mockAsset);
      prisma.assetDepreciationEntry.findMany.mockResolvedValue([]);

      const result = await service.reverse('tenant-fa-001', 'run-001', 'user-01');

      expect(result.success).toBe(true);
      expect(journalService.reverseJournal).toHaveBeenCalledWith(
        'tenant-fa-001',
        'journal-depr-001',
        expect.objectContaining({ alasan: expect.stringContaining('DEPR-2026-00001') }),
      );
      expect(prisma.assetDepreciationRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AssetDepreciationRunStatus.REVERSED }),
        }),
      );
    });

    it('PETUGAS_ASET tidak boleh melihat nilai finansial pada jadwal penyusutan (Sanitasi Keamanan)', async () => {
      prisma.fixedAsset.findFirst.mockResolvedValue(mockAsset);

      const schedule = await service.getAssetSchedule(
        'tenant-fa-001',
        'fa-asset-01',
        'PETUGAS_ASET',
      );

      expect(schedule.assetId).toBe('fa-asset-01');
      expect(schedule.noAset).toBe('AST-2026-00001');
      // Nilai finansial harus disensor (null)
      expect(schedule.komersial[0].beban).toBeNull();
      expect(schedule.komersial[0].akumulasi).toBeNull();
      expect(schedule.komersial[0].nilaiTercatat).toBeNull();
      expect(schedule.fiskal[0].beban).toBeNull();
    });
  });
});

