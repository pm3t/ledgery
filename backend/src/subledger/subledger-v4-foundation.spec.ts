import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ControlAccountType,
  CashFlowCategory,
  PostingSetupKey,
  UserRole,
  PettyCashOverLimitMode,
  DepreciationConvention,
  LabelSymbology,
} from '@prisma/client';
import {
  DocumentNumberingService,
  SubledgerDocType,
  DEFAULT_DOC_PREFIXES,
} from './document-numbering.service';
import { ChartOfAccountService } from '../chart-of-account/chart-of-account.service';
import { JournalService } from '../journal/journal.service';
import { RolesGuard } from '../auth/roles.guard';
import { sanitizeAssetForRole, FINANCIAL_ASSET_FIELDS } from '../common/asset-serializer';
import { PeriodsV1Controller } from '../api-v1/periods-v1/periods-v1.controller';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Unit Test Suite Fondasi Modul 18: Kas & Bank dan Aset Tetap V4
 * Memverifikasi:
 * 1. Enum lama tetap valid & enum baru terdaftar lengkap
 * 2. CASH_BANK tidak menonaktifkan direct posting; FIXED_ASSET menonaktifkannya
 * 3. PETUGAS_ASET ditolak pada endpoint non-aset dan field finansial disanitasi di sisi server
 * 4. GET /v1/periods?tanggal=YYYY-MM-DD mengembalikan status benar dan tercatat
 */
describe('Modul 18 Fondasi Kas & Bank dan Aset Tetap V4 Test Suite', () => {
  describe('1. Verifikasi Skema Enum & DocumentNumbering V4', () => {
    it('Harus memastikan enum lama tetap valid dan nilai baru terdaftar secara aditif', () => {
      // ControlAccountType
      expect(ControlAccountType.NONE).toBe('NONE');
      expect(ControlAccountType.AR).toBe('AR');
      expect(ControlAccountType.AP).toBe('AP');
      expect(ControlAccountType.INVENTORY).toBe('INVENTORY');
      expect(ControlAccountType.CASH_BANK).toBe('CASH_BANK');
      expect(ControlAccountType.FIXED_ASSET).toBe('FIXED_ASSET');

      // CashFlowCategory
      expect(CashFlowCategory.OPERASI).toBe('OPERASI');
      expect(CashFlowCategory.INVESTASI).toBe('INVESTASI');
      expect(CashFlowCategory.PENDANAAN).toBe('PENDANAAN');

      // PostingSetupKey
      expect(PostingSetupKey.AR_CONTROL).toBe('AR_CONTROL');
      expect(PostingSetupKey.BANK_CHARGE_EXPENSE).toBe('BANK_CHARGE_EXPENSE');

      // UserRole
      expect(UserRole.SUPER_ADMIN).toBe('SUPER_ADMIN');
      expect(UserRole.ADMIN_TENANT).toBe('ADMIN_TENANT');
      expect(UserRole.STAF_AKUNTANSI).toBe('STAF_AKUNTANSI');
      expect(UserRole.PETUGAS_ASET).toBe('PETUGAS_ASET');

      // Konfigurasi Subledger V4
      expect(PettyCashOverLimitMode.WARN).toBe('WARN');
      expect(PettyCashOverLimitMode.BLOCK).toBe('BLOCK');
      expect(DepreciationConvention.BULAN_PENUH).toBe('BULAN_PENUH');
      expect(DepreciationConvention.BULAN_BERIKUTNYA).toBe('BULAN_BERIKUTNYA');
      expect(LabelSymbology.QR).toBe('QR');
      expect(LabelSymbology.CODE128).toBe('CODE128');
      expect(LabelSymbology.BOTH).toBe('BOTH');
    });

    it('Harus mendaftarkan seluruh tipe dokumen baru V4 beserta prefix defaultnya', () => {
      const v4DocTypes = [
        SubledgerDocType.CASH_RECEIPT,
        SubledgerDocType.CASH_DISBURSEMENT,
        SubledgerDocType.CASH_TRANSFER,
        SubledgerDocType.PETTY_REPLENISH,
        SubledgerDocType.PETTY_VOUCHER,
        SubledgerDocType.ASSET,
        SubledgerDocType.ASSET_CAPITALIZATION,
        SubledgerDocType.ASSET_DISPOSAL,
        SubledgerDocType.ASSET_IMPAIRMENT,
        SubledgerDocType.ASSET_TRANSFER,
        SubledgerDocType.DEPRECIATION_RUN,
        SubledgerDocType.VERIFICATION_SESSION,
      ];

      for (const docType of v4DocTypes) {
        expect(DEFAULT_DOC_PREFIXES[docType]).toBeDefined();
        expect(typeof DEFAULT_DOC_PREFIXES[docType]).toBe('string');
      }

      expect(DEFAULT_DOC_PREFIXES[SubledgerDocType.CASH_RECEIPT]).toBe('CR');
      expect(DEFAULT_DOC_PREFIXES[SubledgerDocType.ASSET]).toBe('AST');
      expect(DEFAULT_DOC_PREFIXES[SubledgerDocType.DEPRECIATION_RUN]).toBe('DEPR');
      expect(DEFAULT_DOC_PREFIXES[SubledgerDocType.VERIFICATION_SESSION]).toBe('VERIF');
    });
  });

  describe('2. Perilaku Penandaan Akun Kontrol (CASH_BANK vs FIXED_ASSET)', () => {
    let coaService: ChartOfAccountService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({ id: 'tenant-123' }),
        },
        chartOfAccount: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'acc-1', ...args.data })),
          update: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'acc-1', ...args.data })),
        },
      };
      coaService = new ChartOfAccountService(mockPrisma as any);
    });

    it('Menandai akun CASH_BANK TIDAK boleh menonaktifkan direct posting (isControlAccount = false secara default)', async () => {
      const result = await coaService.create({
        tenantId: 'tenant-123',
        kode_akun: '1-1001',
        nama_akun: 'Kas Operasional Kantor',
        kategori: 'ASET' as any,
        controlType: ControlAccountType.CASH_BANK,
        cashFlowCategory: CashFlowCategory.OPERASI,
      });

      expect(result.controlType).toBe(ControlAccountType.CASH_BANK);
      expect(result.isControlAccount).toBe(false); // Direct posting tetap diizinkan
      expect(result.cashFlowCategory).toBe(CashFlowCategory.OPERASI);
    });

    it('Menandai akun FIXED_ASSET HARUS menonaktifkan direct posting (isControlAccount = true)', async () => {
      const result = await coaService.create({
        tenantId: 'tenant-123',
        kode_akun: '1-2001',
        nama_akun: 'Harga Perolehan Kendaraan Operasional',
        kategori: 'ASET' as any,
        controlType: ControlAccountType.FIXED_ASSET,
        cashFlowCategory: CashFlowCategory.INVESTASI,
      });

      expect(result.controlType).toBe(ControlAccountType.FIXED_ASSET);
      expect(result.isControlAccount).toBe(true); // Direct posting dinonaktifkan
      expect(result.cashFlowCategory).toBe(CashFlowCategory.INVESTASI);
    });
  });

  describe('3. Validasi Direct Posting Manual pada JournalService', () => {
    let journalService: JournalService;
    let mockPrisma: any;
    let mockEventEmitter: any;
    let mockAccountingPeriodService: any;

    beforeEach(() => {
      mockPrisma = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', mata_uang: 'IDR' }),
        },
        chartOfAccount: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
        },
        journal: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'jrn-1', no_voucher: 'JNL-2026-0001' }),
        },
        postingPolicySetting: {
          findUnique: jest.fn().mockResolvedValue({ mode: 'AUTO_POST' }),
        },
        periodLock: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
      };
      mockEventEmitter = { emit: jest.fn() };
      mockAccountingPeriodService = {
        validateJournalDate: jest.fn().mockResolvedValue(undefined),
      };

      journalService = new JournalService(
        mockPrisma as any,
        mockEventEmitter as any,
        mockAccountingPeriodService as any,
      );
    });

    it('Harus MENGIZINKAN entri jurnal manual langsung pada akun CASH_BANK jika isControlAccount = false', async () => {
      // Mock akun CASH_BANK dengan isControlAccount = false (mis. posting payroll dari sistem eksternal Rekan)
      mockPrisma.chartOfAccount.findMany.mockResolvedValue([
        {
          id: 'acc-cash',
          kode_akun: '1-1001',
          nama_akun: 'Bank Mandiri Giro',
          controlType: ControlAccountType.CASH_BANK,
          isControlAccount: false,
          isActive: true,
        },
        {
          id: 'acc-expense',
          kode_akun: '5-1001',
          nama_akun: 'Beban Gaji',
          controlType: ControlAccountType.NONE,
          isControlAccount: false,
          isActive: true,
        },
      ]);

      const createDto: any = {
        tanggal: '2026-09-15',
        deskripsi: 'Jurnal Penggajian Karyawan dari Rekan HRIS',
        entries: [
          { kode_akun: '5-1001', tipe: 'DEBIT', jumlah: 5000000 },
          { kode_akun: '1-1001', tipe: 'KREDIT', jumlah: 5000000 },
        ],
      };

      jest.spyOn<any, any>(journalService, 'getValidDimensionMap').mockResolvedValue(new Map());
      jest.spyOn<any, any>(journalService, 'generateVoucherNumber').mockResolvedValue('JNL-2026-0001');

      await expect(
        journalService.createExternal('tenant-1', createDto),
      ).resolves.toBeDefined();
    });

    it('Harus MENOLAK entri jurnal manual langsung pada akun FIXED_ASSET', async () => {
      mockPrisma.chartOfAccount.findMany.mockResolvedValue([
        {
          id: 'acc-fa',
          kode_akun: '1-2001',
          nama_akun: 'Harga Perolehan Mesin Pabrik',
          controlType: ControlAccountType.FIXED_ASSET,
          isControlAccount: true,
          isActive: true,
        },
        {
          id: 'acc-equity',
          kode_akun: '3-1001',
          nama_akun: 'Modal Disetor',
          controlType: ControlAccountType.NONE,
          isControlAccount: false,
          isActive: true,
        },
      ]);

      const createDto: any = {
        tanggal: '2026-09-15',
        deskripsi: 'Jurnal Manual Beli Mesin Pabrik Langsung',
        entries: [
          { kode_akun: '1-2001', tipe: 'DEBIT', jumlah: 150000000 },
          { kode_akun: '3-1001', tipe: 'KREDIT', jumlah: 150000000 },
        ],
      };

      await expect(
        journalService.createExternal('tenant-1', createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Pembatasan Hak Akses & Sanitasi Server untuk PETUGAS_ASET', () => {
    let rolesGuard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = new Reflector();
      rolesGuard = new RolesGuard(reflector);
    });

    it('RolesGuard HARUS menolak PETUGAS_ASET pada rute yang tidak mencantumkan PETUGAS_ASET', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['STAF_AKUNTANSI', 'ADMIN_TENANT']);

      const mockContext = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: UserRole.PETUGAS_ASET },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('RolesGuard HARUS mengizinkan PETUGAS_ASET pada rute aset yang mengizinkan PETUGAS_ASET', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN_TENANT', 'PETUGAS_ASET']);

      const mockContext = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { role: UserRole.PETUGAS_ASET },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(rolesGuard.canActivate(mockContext)).toBe(true);
    });

    it('sanitizeAssetForRole HARUS menghapus seluruh field finansial ketika pemanggil adalah PETUGAS_ASET', () => {
      const fullAsset = {
        id: 'ast-101',
        nomorAset: 'AST-2026-00001',
        namaAset: 'Laptop ThinkPad P14s Petugas',
        lokasi: 'Gudang Utama Lantai 2',
        hargaPerolehan: 25000000,
        nilaiResidu: 1000000,
        akumulasiPenyusutan: 5000000,
        nilaiBuku: 20000000,
        tarifPenyusutan: 25.0,
        metodePenyusutan: 'GARIS_LURUS',
      };

      const sanitized = sanitizeAssetForRole(fullAsset, UserRole.PETUGAS_ASET);

      // Field operasional tetap ada
      expect(sanitized.id).toBe('ast-101');
      expect(sanitized.nomorAset).toBe('AST-2026-00001');
      expect(sanitized.namaAset).toBe('Laptop ThinkPad P14s Petugas');
      expect(sanitized.lokasi).toBe('Gudang Utama Lantai 2');

      // Field finansial wajib dihilangkan (undefined)
      expect((sanitized as any).hargaPerolehan).toBeUndefined();
      expect((sanitized as any).nilaiResidu).toBeUndefined();
      expect((sanitized as any).akumulasiPenyusutan).toBeUndefined();
      expect((sanitized as any).nilaiBuku).toBeUndefined();
      expect((sanitized as any).tarifPenyusutan).toBeUndefined();
      expect((sanitized as any).metodePenyusutan).toBeUndefined();
    });

    it('sanitizeAssetForRole TETAP mempertahankan field finansial untuk peran STAF_AKUNTANSI', () => {
      const fullAsset = {
        id: 'ast-101',
        nomorAset: 'AST-2026-00001',
        hargaPerolehan: 25000000,
        nilaiBuku: 20000000,
      };

      const result = sanitizeAssetForRole(fullAsset, UserRole.STAF_AKUNTANSI);
      expect((result as any).hargaPerolehan).toBe(25000000);
      expect((result as any).nilaiBuku).toBe(20000000);
    });
  });

  describe('5. Prasyarat Integrasi GET /v1/periods?tanggal=YYYY-MM-DD', () => {
    let controller: PeriodsV1Controller;
    let periodService: jest.Mocked<AccountingPeriodService>;

    beforeEach(() => {
      periodService = {
        evaluatePostingDate: jest.fn(),
        getPeriodsV1: jest.fn(),
      } as any;
      controller = new PeriodsV1Controller(periodService);
    });

    it('Harus mengembalikan evaluasi periode dan status OPEN/CLOSED saat query tanggal diberikan', async () => {
      const req = { tenantId: 'tenant-abc' };
      periodService.evaluatePostingDate.mockResolvedValue({
        date: '2026-09-15',
        status: 'OPEN',
        can_post: true,
        period: {
          id: 'period-2026-09',
          name: 'September 2026',
          status: 'OPEN',
        } as any,
      });

      const res = await controller.getPeriods(req, '2026-09-15');

      expect(periodService.evaluatePostingDate).toHaveBeenCalledWith(
        'tenant-abc',
        new Date('2026-09-15T00:00:00.000Z'),
      );
      expect(res).toEqual({
        tanggal: '2026-09-15',
        date: '2026-09-15',
        status: 'OPEN',
        can_post: true,
        period: {
          id: 'period-2026-09',
          name: 'September 2026',
          status: 'OPEN',
        },
      });
    });

    it('Harus menolak format tanggal yang tidak valid dengan LedgeryApiException', async () => {
      const req = { tenantId: 'tenant-abc' };
      await expect(controller.getPeriods(req, '15-09-2026')).rejects.toThrow();
    });
  });
});
