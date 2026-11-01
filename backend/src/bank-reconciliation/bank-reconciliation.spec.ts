import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  CashBankEntryDirection,
  BankMatchStatus,
  BankReconStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { CashDocumentService } from '../cash-bank/services/cash-document.service';
import { BankAutoMatchService } from './services/bank-auto-match.service';
import { BankReconciliationService } from './services/bank-reconciliation.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import {
  parseIndonesianNumber,
  parseFlexibleDate,
  generateDedupeHash,
} from './utils/number-date-parser';

describe('BankReconciliationModule Test Suite (Modul 20)', () => {
  let reconService: BankReconciliationService;
  let autoMatchService: BankAutoMatchService;
  let periodService: AccountingPeriodService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      bankImportTemplate: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      bankStatementImport: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      bankStatementLine: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      cashBankEntry: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      bankReconciliation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bankMatch: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      subledgerSetting: {
        findUnique: jest.fn(),
      },
      accountingPeriod: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      cashBankAccount: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankReconciliationService,
        BankAutoMatchService,
        AccountingPeriodService,
        { provide: PrismaService, useValue: prisma },
        { provide: SubledgerPostingService, useValue: { reverseJournal: jest.fn() } },
        { provide: DocumentNumberingService, useValue: { generateNextNumber: jest.fn() } },
        { provide: CashDocumentService, useValue: { createDisbursement: jest.fn(), postDisbursement: jest.fn() } },
      ],
    }).compile();

    reconService = module.get<BankReconciliationService>(BankReconciliationService);
    autoMatchService = module.get<BankAutoMatchService>(BankAutoMatchService);
    periodService = module.get<AccountingPeriodService>(AccountingPeriodService);
  });

  // =========================================================================
  // 1. UNIT TEST: PARSER ANGKA & TANGGAL INDONESIA
  // =========================================================================
  describe('1. Parser Angka & Tanggal Format Indonesia', () => {
    it('Harus mem-parse format angka Indonesia ("1.234.567,89") dengan desimal koma dan titik ribuan', () => {
      const parsed1 = parseIndonesianNumber('1.234.567,89', ',', '.');
      expect(parsed1).toBe(1234567.89);

      const parsedNeg = parseIndonesianNumber('(500.000,00)', ',', '.');
      expect(parsedNeg).toBe(-500000.0);

      const parsedCR = parseIndonesianNumber('250.000,50 CR', ',', '.');
      expect(parsedCR).toBe(250000.5);

      const parsedDB = parseIndonesianNumber('15.000,00 DB', ',', '.');
      expect(parsedDB).toBe(-15000.0);
    });

    it('Harus mem-parse berbagai format tanggal umum perbankan Indonesia', () => {
      const d1 = parseFlexibleDate('15/10/2026');
      expect(d1.getUTCDate()).toBe(15);
      expect(d1.getUTCMonth()).toBe(9); // Oktober (0-indexed)
      expect(d1.getUTCFullYear()).toBe(2026);

      const d2 = parseFlexibleDate('2026-10-31');
      expect(d2.getUTCDate()).toBe(31);
      expect(d2.getUTCMonth()).toBe(9);

      const d3 = parseFlexibleDate('01-08-2026');
      expect(d3.getUTCDate()).toBe(1);
      expect(d3.getUTCMonth()).toBe(7); // Agustus
    });
  });

  // =========================================================================
  // 2. UNIT TEST: DEDUPE HASH PADA IMPOR ULANG
  // =========================================================================
  describe('2. Dedupe Hash & Pencegahan Duplikasi Impor', () => {
    it('Harus menghasilkan hash identik untuk data baris yang sama dan mendeteksi duplikat', () => {
      const hash1 = generateDedupeHash(
        'rek-1',
        new Date('2026-10-15T00:00:00.000Z'),
        0,
        1500000,
        'TRANSFER DARI PELANGGAN A',
        'REF-001',
        10000000,
      );
      const hash2 = generateDedupeHash(
        'rek-1',
        new Date('2026-10-15T00:00:00.000Z'),
        0,
        1500000,
        'transfer dari pelanggan a', // variasi case & spasi
        'ref-001',
        10000000,
      );

      expect(hash1).toBe(hash2);
    });
  });

  // =========================================================================
  // 3. UNIT TEST: PENCOCOKAN OTOMATIS (EXACT VS SUGGESTED)
  // =========================================================================
  describe('3. Auto-Match Engine: Pencocokan Pasti vs Ambigu', () => {
    it('Harus mengklasifikasikan sebagai EXACT jika nominal persis, tanggal selisih <= toleransi, dan kandidat tunggal', () => {
      const stmtLines = [
        {
          id: 'stmt-1',
          tanggal: new Date('2026-10-15T00:00:00.000Z'),
          keterangan: 'PEMBAYARAN INVOICE INV-100',
          referensi: 'INV-100',
          debit: 0,
          kredit: 2500000, // Kredit di bank = Masuk di buku
        },
      ];

      const bookEntries = [
        {
          id: 'book-1',
          tanggal: new Date('2026-10-15T00:00:00.000Z'),
          arah: CashBankEntryDirection.MASUK,
          jumlah: 2500000,
          keterangan: 'Penerimaan Pelanggan INV-100',
          sourceType: 'CUSTOMER_RECEIPT',
        },
      ];

      const results = autoMatchService.evaluateMatches(stmtLines, bookEntries, 3);
      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('EXACT');
      expect(results[0].confidenceScore).toBeGreaterThanOrEqual(90);
      expect(results[0].matchedEntryIds).toEqual(['book-1']);
    });

    it('Harus mengklasifikasikan sebagai SUGGESTED jika ada multiple kandidat dengan nominal yang sama', () => {
      const stmtLines = [
        {
          id: 'stmt-2',
          tanggal: new Date('2026-10-20T00:00:00.000Z'),
          keterangan: 'TRANSFER ANTAR BANK',
          debit: 1000000, // Debit di bank = Keluar di buku
          kredit: 0,
        },
      ];

      const bookEntries = [
        {
          id: 'book-A',
          tanggal: new Date('2026-10-20T00:00:00.000Z'),
          arah: CashBankEntryDirection.KELUAR,
          jumlah: 1000000,
          keterangan: 'Pengeluaran Operasional',
          sourceType: 'CASH_DISBURSEMENT',
        },
        {
          id: 'book-B',
          tanggal: new Date('2026-10-21T00:00:00.000Z'),
          arah: CashBankEntryDirection.KELUAR,
          jumlah: 1000000,
          keterangan: 'Pembayaran Vendor Lain',
          sourceType: 'VENDOR_PAYMENT',
        },
      ];

      const results = autoMatchService.evaluateMatches(stmtLines, bookEntries, 3);
      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('SUGGESTED');
    });
  });

  // =========================================================================
  // 4. UNIT TEST: PENCOCOKAN SATU-KE-BANYAK (GROUP MATCH / SETORAN GABUNGAN)
  // =========================================================================
  describe('4. Pencocokan Satu-ke-Banyak (Group Match)', () => {
    it('Harus menemukan kombinasi beberapa entri buku yang jumlah totalnya sama dengan 1 baris mutasi bank', () => {
      const stmtLines = [
        {
          id: 'stmt-group',
          tanggal: new Date('2026-10-25T00:00:00.000Z'),
          keterangan: 'SETORAN GABUNGAN KASIR',
          debit: 0,
          kredit: 3000000, // Total Rp 3.000.000
        },
      ];

      const bookEntries = [
        {
          id: 'entry-1',
          tanggal: new Date('2026-10-25T00:00:00.000Z'),
          arah: CashBankEntryDirection.MASUK,
          jumlah: 1000000,
          keterangan: 'Penerimaan Kasir Pagi',
          sourceType: 'CASH_RECEIPT',
        },
        {
          id: 'entry-2',
          tanggal: new Date('2026-10-25T00:00:00.000Z'),
          arah: CashBankEntryDirection.MASUK,
          jumlah: 2000000,
          keterangan: 'Penerimaan Kasir Sore',
          sourceType: 'CASH_RECEIPT',
        },
      ];

      const results = autoMatchService.evaluateMatches(stmtLines, bookEntries, 3);
      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('GROUP_SUGGESTED');
      expect(results[0].matchedEntryIds).toEqual(['entry-1', 'entry-2']);
      expect(results[0].totalAllocated).toBe(3000000);
    });
  });

  // =========================================================================
  // 5. UNIT TEST: RUMUS REKONSILIASI & ITEM BEREDAR
  // =========================================================================
  describe('5. Rumus Rekonsiliasi Bank & Perhitungan Selisih', () => {
    it('Harus menghitung saldoBankDisesuaikan dan selisih dengan benar memperhitungkan setoran dalam perjalanan dan cek belum cair', async () => {
      // Saldo buku = 50.000.000
      prisma.cashBankEntry.findMany
        .mockResolvedValueOnce([
          { arah: CashBankEntryDirection.MASUK, jumlah: 60000000 },
          { arah: CashBankEntryDirection.KELUAR, jumlah: 10000000 },
        ])
        // Item beredar
        .mockResolvedValueOnce([
          // Setoran dalam perjalanan (belum masuk bank): 5.000.000
          { id: 'dit-1', arah: CashBankEntryDirection.MASUK, jumlah: 5000000 },
          // Cek belum dicairkan vendor (sudah dipotong di buku, belum di bank): 2.000.000
          { id: 'oc-1', arah: CashBankEntryDirection.KELUAR, jumlah: 2000000 },
        ]);

      prisma.bankStatementLine.count.mockResolvedValue(0);

      // Saldo rekening koran di bank = 47.000.000
      // saldoBankDisesuaikan = 47.000.000 + 5.000.000 - 2.000.000 = 50.000.000
      // selisih = 50.000.000 - 50.000.000 = 0 (Seimbang!)
      const summary = await reconService.calculateReconciliationSummary(
        'tenant-1',
        'rek-1',
        '2026-10-31',
        47000000,
      );

      expect(summary.saldoBuku).toBe(50000000);
      expect(summary.saldoRekeningKoran).toBe(47000000);
      expect(summary.itemBeredar.setoranDalamPerjalanan.total).toBe(5000000);
      expect(summary.itemBeredar.cekBelumCair.total).toBe(2000000);
      expect(summary.saldoBankDisesuaikan).toBe(50000000);
      expect(summary.selisih).toBe(0);
      expect(summary.canComplete).toBe(true);
    });
  });

  // =========================================================================
  // 6. UNIT TEST: VALIDASI SELESAI (SELISIH ≠ 0 & BARIS UNMATCHED)
  // =========================================================================
  describe('6. Validasi Penyelesaian Rekonsiliasi (SELESAI)', () => {
    it('Harus menolak penyelesaian jika selisih ≠ 0', async () => {
      // Mock saldo buku 50.000.000, bank koran 40.000.000 tanpa item beredar -> selisih 10.000.000
      prisma.cashBankEntry.findMany
        .mockResolvedValueOnce([{ arah: CashBankEntryDirection.MASUK, jumlah: 50000000 }])
        .mockResolvedValueOnce([]);
      prisma.bankStatementLine.count.mockResolvedValue(0);

      await expect(
        reconService.completeReconciliation('tenant-1', 'user-1', {
          cashBankAccountId: 'rek-1',
          tanggalAkhir: '2026-10-31',
          saldoRekeningKoran: 40000000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Harus menolak penyelesaian jika masih ada baris rekening koran UNMATCHED', async () => {
      // Saldo seimbang (selisih 0), tetapi ada 1 baris UNMATCHED
      prisma.cashBankEntry.findMany
        .mockResolvedValueOnce([{ arah: CashBankEntryDirection.MASUK, jumlah: 50000000 }])
        .mockResolvedValueOnce([]);
      prisma.bankStatementLine.count.mockResolvedValue(1); // 1 baris UNMATCHED

      await expect(
        reconService.completeReconciliation('tenant-1', 'user-1', {
          cashBankAccountId: 'rek-1',
          tanggalAkhir: '2026-10-31',
          saldoRekeningKoran: 50000000,
        }),
      ).rejects.toThrow('Setiap baris harus MATCHED, ADJUSTED, atau IGNORED');
    });
  });

  // =========================================================================
  // 7. UNIT TEST: BUKA KEMBALI HANYA REKONSILIASI TERBARU
  // =========================================================================
  describe('7. Buka Kembali (Reopen) Rekonsiliasi Bank', () => {
    it('Harus menolak buka kembali jika terdapat rekonsiliasi yang lebih baru per rekening', async () => {
      prisma.bankReconciliation.findFirst
        // Rekonsiliasi yang ingin dibuka (September 2026)
        .mockResolvedValueOnce({
          id: 'recon-sept',
          tenantId: 'tenant-1',
          cashBankAccountId: 'rek-1',
          status: BankReconStatus.SELESAI,
          tanggalAkhir: new Date('2026-09-30T00:00:00.000Z'),
        })
        // Ada rekonsiliasi lebih baru (Oktober 2026)
        .mockResolvedValueOnce({
          id: 'recon-okt',
          status: BankReconStatus.SELESAI,
          tanggalAkhir: new Date('2026-10-31T00:00:00.000Z'),
        });

      await expect(
        reconService.reopenReconciliation('tenant-1', 'user-1', 'recon-sept', {
          reason: 'Koreksi transaksi lama',
        }),
      ).rejects.toThrow('Hanya rekonsiliasi bank paling akhir (terbaru) yang dapat dibuka kembali');
    });
  });

  // =========================================================================
  // 8. UNIT TEST: INTEGRASI CLOSING PERIODE DENGAN BLOCK SETTING
  // =========================================================================
  describe('8. Integrasi Closing Periode & blockPeriodCloseOnBankRecon', () => {
    it('Harus membatalkan closing periode jika rekonsiliasi bank belum SELESAI dan blockPeriodCloseOnBankRecon = true', async () => {
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'per-1',
        status: 'OPEN',
        tanggal_mulai: new Date('2026-10-01T00:00:00.000Z'),
        tanggal_selesai: new Date('2026-10-31T23:59:59.999Z'),
        fiscalYear: { tenantId: 'tenant-1', nama_tahun_buku: '2026' },
      });

      prisma.subledgerSetting.findUnique.mockResolvedValue({
        cashBankEnabled: true,
        blockPeriodCloseOnBankRecon: true,
      });

      // Ada 1 rekening BANK aktif
      prisma.cashBankAccount.findMany.mockResolvedValue([
        { id: 'rek-bca', kode: '1-1002', nama: 'Bank BCA Giro', jenis: 'BANK' },
      ]);

      // Belum ada rekonsiliasi SELESAI per akhir periode
      prisma.bankReconciliation.findFirst.mockResolvedValue(null);

      await expect(periodService.closePeriod('per-1', 'user-1')).rejects.toThrow(
        'Penutupan periode dibatalkan: Rekonsiliasi Bank per akhir periode',
      );
    });

    it('Harus meloloskan closing periode dengan warning jika blockPeriodCloseOnBankRecon = false', async () => {
      prisma.accountingPeriod.findUnique.mockResolvedValue({
        id: 'per-1',
        status: 'OPEN',
        tanggal_mulai: new Date('2026-10-01T00:00:00.000Z'),
        tanggal_selesai: new Date('2026-10-31T23:59:59.999Z'),
        fiscalYear: { tenantId: 'tenant-1', nama_tahun_buku: '2026' },
      });

      prisma.subledgerSetting.findUnique.mockResolvedValue({
        cashBankEnabled: true,
        blockPeriodCloseOnBankRecon: false, // Tidak memblokir, hanya warning
      });

      prisma.cashBankAccount.findMany.mockResolvedValue([
        { id: 'rek-bca', kode: '1-1002', nama: 'Bank BCA Giro', jenis: 'BANK' },
      ]);

      prisma.bankReconciliation.findFirst.mockResolvedValue(null);
      prisma.accountingPeriod.update.mockResolvedValue({ id: 'per-1', status: 'CLOSED' });

      const result = await periodService.closePeriod('per-1', 'user-1');
      expect(result.status).toBe('CLOSED');
      expect(result.warning?.bankReconWarning).toContain('Peringatan: Rekonsiliasi Bank per akhir periode belum SELESAI');
    });
  });
});
