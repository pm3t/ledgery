import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubledgerReconciliationService } from './subledger-reconciliation.service';
import { SubledgerSettingService } from './subledger-setting.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { AssetReportService } from '../fixed-asset/services/asset-report.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PostingSetupKey,
  ControlAccountType,
  FixedAssetStatus,
  DepreciationMethod,
} from '@prisma/client';

describe('Modul 25: Integrasi Lintas-Modul V4, Rekonsiliasi, Closing, & Laporan', () => {
  let reconService: SubledgerReconciliationService;
  let periodService: AccountingPeriodService;
  let assetReportService: AssetReportService;
  let prisma: any;
  let settingService: any;

  const mockTenantId = 'tenant-v4-integration';

  beforeEach(async () => {
    prisma = {
      subledgerSetting: {
        findUnique: jest.fn(),
      },
      chartOfAccount: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      cashBankAccount: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      cashBankEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      journalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      salesInvoice: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      creditNote: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      customerReceipt: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      purchaseBill: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      debitNote: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      vendorPayment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      inventoryItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      goodsReceiptLine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      purchaseOrder: {
        count: jest.fn().mockResolvedValue(0),
      },
      salesOrder: {
        count: jest.fn().mockResolvedValue(0),
      },
      bankReconciliation: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      assetCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      fixedAsset: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      assetDepreciationRun: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      assetDepreciationEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      assetDisposal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      dimension: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      accountingPeriod: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    settingService = {
      getSettings: jest.fn().mockResolvedValue({
        tenantId: mockTenantId,
        arEnabled: true,
        apEnabled: true,
        inventoryEnabled: true,
        orderManagementEnabled: true,
        cashBankEnabled: true,
        fixedAssetEnabled: true,
        blockPeriodCloseOnRecon: false,
        blockPeriodCloseOnBankRecon: false,
        blockPeriodCloseOnDepreciation: false,
      }),
      getPostingSetups: jest.fn().mockResolvedValue([
        {
          key: PostingSetupKey.AR_CONTROL,
          account: { id: 'coa-ar', kode_akun: '1103.01', nama_akun: 'Piutang Usaha' },
        },
        {
          key: PostingSetupKey.AP_CONTROL,
          account: { id: 'coa-ap', kode_akun: '2101.01', nama_akun: 'Hutang Usaha' },
        },
        {
          key: PostingSetupKey.INVENTORY,
          account: { id: 'coa-inv', kode_akun: '1105.01', nama_akun: 'Persediaan' },
        },
        {
          key: PostingSetupKey.GR_IR_CLEARING,
          account: { id: 'coa-grir', kode_akun: '2104.01', nama_akun: 'GR/IR Kliring' },
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubledgerReconciliationService,
        AssetReportService,
        AccountingPeriodService,
        { provide: PrismaService, useValue: prisma },
        { provide: SubledgerSettingService, useValue: settingService },
      ],
    }).compile();

    reconService = module.get<SubledgerReconciliationService>(SubledgerReconciliationService);
    assetReportService = module.get<AssetReportService>(AssetReportService);
    periodService = module.get<AccountingPeriodService>(AccountingPeriodService);
  });

  // =========================================================================
  // SKENARIO (a): SIKLUS HIDUP LENGKAP ASET TETAP & REKONSILIASI GL = 0
  // =========================================================================
  describe('Skenario (a): Siklus Hidup Aset Tetap, Roll-Forward Neraca, & Rekonsiliasi GL', () => {
    it('Siklus aset lengkap harus menghasilkan rekonsiliasi GL vs Subledger selisih = 0 dan roll-forward akurat', async () => {
      const mockCategory = {
        id: 'cat-mesin',
        kode: 'MSN',
        nama: 'Mesin Pabrik',
        jenis: 'BERWUJUD',
        dapatDisusutkan: true,
        akunAset: { id: 'coa-mesin-aset', kode_akun: '1301.01', nama_akun: 'Aset Mesin' },
        akunAkumulasi: { id: 'coa-mesin-akum', kode_akun: '1301.02', nama_akun: 'Akum. Penyusutan Mesin' },
        akunCip: null,
      };

      prisma.assetCategory.findMany.mockResolvedValue([mockCategory]);

      // GL Entries:
      // 1. Perolehan: Dr Aset Mesin 120.000.000 (oleh faktur AP/aktivasi)
      // 2. Akumulasi: Cr Akum. Penyusutan Mesin 3.000.000 (penyusutan 3 bulan @ 1.000.000)
      // 3. Penurunan Nilai (Impairment): Cr Akum. Penyusutan 5.000.000
      // 4. Pelepasan / Jual: Dr Kas 115.000.000, Dr Akum. Penyusutan 8.000.000, Cr Aset Mesin 120.000.000, Cr Laba Pelepasan 3.000.000
      // Setelah pelepasan, saldo akhir GL perolehan = 0, akumulasi = 0.
      prisma.journalEntry.findMany.mockImplementation((params: any) => {
        const accId = params.where.chartOfAccountId;
        if (accId === 'coa-mesin-aset') {
          return Promise.resolve([
            {
              tipe: 'DEBIT',
              jumlah: 120000000,
              journal: { id: 'j-perolehan', sourceDocType: 'ASSET_REGISTRATION', sourceDocId: 'AST-001' },
            },
            {
              tipe: 'KREDIT',
              jumlah: 120000000,
              journal: { id: 'j-disposal', sourceDocType: 'ASSET_DISPOSAL', sourceDocId: 'DSP-001' },
            },
          ]);
        }
        if (accId === 'coa-mesin-akum') {
          return Promise.resolve([
            {
              tipe: 'KREDIT',
              jumlah: 3000000,
              journal: { id: 'j-dep', sourceDocType: 'ASSET_DEPRECIATION', sourceDocId: 'DEP-001' },
            },
            {
              tipe: 'KREDIT',
              jumlah: 5000000,
              journal: { id: 'j-imp', sourceDocType: 'ASSET_IMPAIRMENT', sourceDocId: 'IMP-001' },
            },
            {
              tipe: 'DEBIT',
              jumlah: 8000000,
              journal: { id: 'j-disposal', sourceDocType: 'ASSET_DISPOSAL', sourceDocId: 'DSP-001' },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      // Subledger Asset: Aset berstatus DIJUAL
      prisma.fixedAsset.findMany.mockResolvedValue([
        {
          id: 'fa-001',
          noAset: 'AST-001',
          categoryId: 'cat-mesin',
          status: FixedAssetStatus.DIJUAL,
          hargaPerolehan: 120000000,
          tanggalPerolehan: new Date('2026-01-01'),
          costAdditions: [],
          disposals: [
            {
              id: 'dsp-001',
              tanggal: new Date('2026-04-15'),
              status: 'POSTED',
              hargaJual: 115000000,
              nilaiTercatatSaatPelepasan: 112000000,
              labaRugi: 3000000,
            },
          ],
          depreciationEntries: [
            { buku: 'KOMERSIAL', status: 'AKTIF', jumlah: 3000000, createdAt: new Date('2026-03-31') },
          ],
          impairments: [
            { tanggal: new Date('2026-04-01'), status: 'POSTED', jumlah: 5000000 },
          ],
        },
      ]);

      const recon = await reconService.reconcileFixedAsset(mockTenantId, new Date('2026-04-30'));
      expect(recon.status).toBe('OK');
      expect(recon.totalSelisih).toBe(0);
      expect(recon.totalGlPerolehan).toBe(0);
      expect(recon.totalSubledgerPerolehan).toBe(0);
      expect(recon.totalGlAkumulasi).toBe(0);
      expect(recon.totalSubledgerAkumulasi).toBe(0);
      expect(recon.drillDown.summary.totalMismatchedAssets).toBe(0);
    });
  });

  // =========================================================================
  // SKENARIO (b): TRANSAKSI KAS/BANK CAMPURAN & REKONSILIASI BANK SELESAI
  // =========================================================================
  describe('Skenario (b): Transaksi Kas/Bank Campuran & Rekonsiliasi Bank', () => {
    it('Transaksi campuran (dokumen kas, AR receipt, AP payment, raw journal) harus seimbang dengan GL', async () => {
      const mockBankAccount = {
        id: 'cba-bca',
        kode: 'BCA-01',
        nama: 'BCA Giro Operasional',
        jenis: 'BANK',
        mata_uang: 'IDR',
        chartOfAccountId: 'coa-bca',
        chartOfAccount: { id: 'coa-bca', kode_akun: '1102.01', nama_akun: 'Bank BCA Giro' },
      };

      prisma.cashBankAccount.findMany.mockResolvedValue([mockBankAccount]);

      // GL Entries untuk akun BCA:
      // Dr 50.000.000 (Penerimaan AR)
      // Dr 20.000.000 (Cash Receipt Lainnya)
      // Cr 15.000.000 (Pembayaran Vendor AP)
      // Dr 10.000.000 (Raw Journal dari integrasi lama yang di-auto-capture)
      // Saldo GL = 50 + 20 - 15 + 10 = 65.000.000
      prisma.journalEntry.findMany.mockResolvedValue([
        { tipe: 'DEBIT', jumlah: 50000000, journal: { id: 'j-ar', sourceDocType: 'CUSTOMER_RECEIPT' } },
        { tipe: 'DEBIT', jumlah: 20000000, journal: { id: 'j-cr', sourceDocType: 'CASH_RECEIPT' } },
        { tipe: 'KREDIT', jumlah: 15000000, journal: { id: 'j-ap', sourceDocType: 'VENDOR_PAYMENT' } },
        { tipe: 'DEBIT', jumlah: 10000000, journal: { id: 'j-raw', sourceDocType: 'JOURNAL_CAPTURE' } },
      ]);

      // CashBankEntry (buku kas):
      prisma.cashBankEntry.findMany.mockResolvedValue([
        { arah: 'MASUK', jumlahFungsional: 50000000, journalId: 'j-ar' },
        { arah: 'MASUK', jumlahFungsional: 20000000, journalId: 'j-cr' },
        { arah: 'KELUAR', jumlahFungsional: 15000000, journalId: 'j-ap' },
        { arah: 'MASUK', jumlahFungsional: 10000000, journalId: 'j-raw' },
      ]);

      const recon = await reconService.reconcileCashBank(mockTenantId, new Date('2026-11-01'));
      expect(recon.status).toBe('OK');
      expect(recon.totalGlBalance).toBe(65000000);
      expect(recon.totalSubledgerBalance).toBe(65000000);
      expect(recon.totalSelisih).toBe(0);
      expect(recon.accounts[0].status).toBe('OK');
      expect(recon.drillDown.summary.totalOrphanDocs).toBe(0);
      expect(recon.drillDown.summary.totalRawJournals).toBe(0);
    });
  });

  // =========================================================================
  // SKENARIO (c): CLOSING PERIODE (PERINGATAN & PEMBLOKIRAN SESUAI PENGATURAN)
  // =========================================================================
  describe('Skenario (c): Closing Periode dengan Kontrol Rekonsiliasi, Bank, & Penyusutan', () => {
    const mockPeriod = {
      id: 'per-2026-10',
      tenantId: mockTenantId,
      nomor_periode: 10,
      tanggal_selesai: new Date('2026-10-31'),
      status: 'OPEN',
      fiscalYear: { nama_tahun_buku: '2026', tenantId: mockTenantId },
    };

    it('Harus MEMBLOKIR closing jika blockPeriodCloseOnBankRecon bernilai true dan ada bank recon belum SELESAI', async () => {
      const mockSettings = {
        tenantId: mockTenantId,
        arEnabled: false,
        apEnabled: false,
        inventoryEnabled: false,
        orderManagementEnabled: false,
        cashBankEnabled: true,
        fixedAssetEnabled: false,
        blockPeriodCloseOnRecon: false,
        blockPeriodCloseOnBankRecon: true, // AKTIF: WAJIB SELESAI
        blockPeriodCloseOnDepreciation: false,
      };
      settingService.getSettings.mockResolvedValue(mockSettings);
      prisma.subledgerSetting.findUnique.mockResolvedValue(mockSettings);

      prisma.accountingPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.journalEntry.findMany.mockResolvedValue([]);
      prisma.salesInvoice.findMany.mockResolvedValue([]);
      prisma.cashBankAccount.findMany.mockResolvedValue([
        {
          id: 'cba-bank-1',
          kode: 'MDR-01',
          nama: 'Mandiri Giro',
          jenis: 'BANK',
          isActive: true,
          chartOfAccountId: 'coa-m',
          chartOfAccount: { id: 'coa-m', kode_akun: '1102', nama_akun: 'Bank Mandiri' },
        },
      ]);

      // Tidak ada BankReconciliation yang SELESAI per akhir periode
      prisma.bankReconciliation.findFirst.mockResolvedValue(null);

      await expect(
        periodService.closePeriod(mockTenantId, 'per-2026-10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('Harus MEMBLOKIR closing jika blockPeriodCloseOnDepreciation bernilai true dan penyusutan belum diposting', async () => {
      const mockSettings = {
        tenantId: mockTenantId,
        arEnabled: false,
        apEnabled: false,
        inventoryEnabled: false,
        orderManagementEnabled: false,
        cashBankEnabled: false,
        fixedAssetEnabled: true,
        blockPeriodCloseOnRecon: false,
        blockPeriodCloseOnBankRecon: false,
        blockPeriodCloseOnDepreciation: true, // AKTIF: WAJIB RUN PENYUSUTAN
      };
      settingService.getSettings.mockResolvedValue(mockSettings);
      prisma.subledgerSetting.findUnique.mockResolvedValue(mockSettings);

      prisma.accountingPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.journalEntry.findMany.mockResolvedValue([]);
      prisma.salesInvoice.findMany.mockResolvedValue([]);

      // Ada aset aktif yang dapat disusutkan
      prisma.fixedAsset.findFirst.mockResolvedValue({
        id: 'fa-aktif',
        status: FixedAssetStatus.AKTIF,
        category: { dapatDisusutkan: true },
      });

      // Belum ada run penyusutan berstatus POSTED
      prisma.assetDepreciationRun.findFirst.mockResolvedValue(null);

      await expect(
        periodService.closePeriod(mockTenantId, 'per-2026-10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('Tenant yang menonaktifkan modul V4 TIDAK terpengaruh oleh validasi bank dan penyusutan', async () => {
      const mockSettings = {
        tenantId: mockTenantId,
        arEnabled: false,
        apEnabled: false,
        inventoryEnabled: false,
        orderManagementEnabled: false,
        cashBankEnabled: false,
        fixedAssetEnabled: false,
        blockPeriodCloseOnRecon: false,
        blockPeriodCloseOnBankRecon: true,
        blockPeriodCloseOnDepreciation: true,
      };
      settingService.getSettings.mockResolvedValue(mockSettings);
      prisma.subledgerSetting.findUnique.mockResolvedValue(mockSettings);

      prisma.accountingPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.journalEntry.findMany.mockResolvedValue([]);
      prisma.salesInvoice.findMany.mockResolvedValue([]);
      prisma.accountingPeriod.update.mockResolvedValue({ ...mockPeriod, status: 'CLOSED' });

      const res = await periodService.closePeriod(mockTenantId, 'per-2026-10');
      expect(res.status).toBe('CLOSED');
    });
  });

  // =========================================================================
  // SKENARIO (d): REKONSILIASI KOMERSIAL VS FISKAL KONSISTEN
  // =========================================================================
  describe('Skenario (d): Rekonsiliasi Penyusutan Komersial vs Fiskal', () => {
    it('Laporan komersial vs fiskal harus menghitung selisih koreksi fiskal positif/negatif dan beda temporer', async () => {
      prisma.fixedAsset.findMany.mockResolvedValue([
        {
          id: 'fa-1',
          noAset: 'AST-KTR-01',
          nama: 'Laptop Kantor',
          status: FixedAssetStatus.AKTIF,
          metodeKomersial: DepreciationMethod.GARIS_LURUS,
          metodeFiskal: DepreciationMethod.GARIS_LURUS,
          nilaiTercatat: 15000000,
          nilaiSisaBukuFiskal: 10000000,
          category: { nama: 'Peralatan Kantor' },
          fiscalGroup: { nama: 'Kelompok 1 (25%)', tarifGarisLurus: 25 },
          depreciationEntries: [
            { buku: 'KOMERSIAL', jumlah: 6000000, periodeBukuTahun: 2026 },
            { buku: 'FISKAL', jumlah: 5000000, periodeBukuTahun: 2026 },
          ],
          disposals: [],
        },
      ]);

      const res = await assetReportService.getCommercialVsFiscalReport(mockTenantId, {
        fiscalYear: 2026,
        role: 'ADMIN',
      });

      expect(res.summary.totalKomersial).toBe(6000000);
      expect(res.summary.totalFiskal).toBe(5000000);
      expect(res.summary.totalKoreksiFiskal).toBe(1000000);
      expect(res.summary.arahKoreksi).toBe('POSITIF'); // Komersial > Fiskal = Koreksi Positif
      expect(res.items[0].bedaTemporer).toBe(5000000); // 15jt - 10jt
    });
  });

  // =========================================================================
  // SKENARIO (e): PERAN PETUGAS_ASET DITOLAK PADA LAPORAN FINANSIAL
  // =========================================================================
  describe('Skenario (e): Hak Akses Peran PETUGAS_ASET', () => {
    it('PETUGAS_ASET HARUS DITOLAK dengan ForbiddenException pada seluruh laporan finansial aset', async () => {
      await expect(
        assetReportService.getListReport(mockTenantId, { role: 'PETUGAS_ASET' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        assetReportService.getRollForwardReport(mockTenantId, {
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          role: 'PETUGAS_ASET',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        assetReportService.getCommercialVsFiscalReport(mockTenantId, {
          fiscalYear: 2026,
          role: 'PETUGAS_ASET',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        assetReportService.getDisposalGainLossReport(mockTenantId, {
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          role: 'PETUGAS_ASET',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
