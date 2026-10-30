import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubledgerPostingService } from './subledger-posting.service';
import { DocumentNumberingService } from './document-numbering.service';
import { JournalService } from '../journal/journal.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import {
  EntryType,
  JournalStatus,
  ControlAccountType,
  KategoriAkun,
} from '@prisma/client';

describe('Subledger Foundation Test Suite', () => {
  let subledgerPostingService: SubledgerPostingService;
  let documentNumberingService: DocumentNumberingService;
  let journalService: JournalService;
  let accountingPeriodService: Partial<AccountingPeriodService>;

  const mockTenant = {
    id: 'tenant-sub-1',
    nama_perusahaan: 'PT Subledger Test',
    mata_uang: 'IDR',
  };

  const mockAccounts = [
    {
      id: 'acc-ar-control',
      tenantId: 'tenant-sub-1',
      kode_akun: '110001',
      nama_akun: 'Piutang Usaha IDR',
      kategori: KategoriAkun.ASET,
      isActive: true,
      isControlAccount: true,
      controlType: ControlAccountType.AR,
    },
    {
      id: 'acc-sales',
      tenantId: 'tenant-sub-1',
      kode_akun: '410001',
      nama_akun: 'Pendapatan Penjualan',
      kategori: KategoriAkun.PENDAPATAN,
      isActive: true,
      isControlAccount: false,
      controlType: ControlAccountType.NONE,
    },
  ];

  let seqCounter = 0;
  const mockPrisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(mockTenant),
    },
    chartOfAccount: {
      findMany: jest.fn().mockImplementation((args: any) => {
        const kodes = args?.where?.kode_akun?.in || [];
        return mockAccounts.filter((a) => kodes.includes(a.kode_akun));
      }),
      findUnique: jest.fn().mockImplementation((args: any) => {
        const kode = args?.where?.tenantId_kode_akun?.kode_akun;
        return mockAccounts.find((a) => a.kode_akun === kode) || null;
      }),
    },
    dimension: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    exchangeRate: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    journal: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args: any) => {
        return {
          id: 'jnl-created-uuid',
          ...args.data,
          entries: args.data.entries?.create || [],
        };
      }),
    },
    documentNumbering: {
      findUnique: jest.fn().mockImplementation(() => {
        return {
          id: 'num-1',
          tenantId: 'tenant-sub-1',
          docType: 'SI',
          prefix: 'SI',
          formatPattern: '{PREFIX}-{YYYY}-{SEQ:5}',
          lastSeq: seqCounter,
          year: 2026,
        };
      }),
      create: jest.fn().mockImplementation((args) => args.data),
      update: jest.fn().mockImplementation((args) => {
        seqCounter += 1;
        return {
          id: 'num-1',
          prefix: 'SI',
          formatPattern: '{PREFIX}-{YYYY}-{SEQ:5}',
          lastSeq: seqCounter,
          year: 2026,
        };
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return await callback(mockPrisma);
    }),
  };

  beforeEach(async () => {
    seqCounter = 0;
    accountingPeriodService = {
      validateJournalDate: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentNumberingService,
        SubledgerPostingService,
        JournalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountingPeriodService, useValue: accountingPeriodService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    documentNumberingService = module.get<DocumentNumberingService>(
      DocumentNumberingService,
    );
    subledgerPostingService = module.get<SubledgerPostingService>(
      SubledgerPostingService,
    );
    journalService = module.get<JournalService>(JournalService);
  });

  // (a) Jurnal mentah ke akun kontrol ditolak, ke akun direct-posting biasa diterima
  describe('Test (a): Kontrol Direct Posting pada Jurnal Mentah', () => {
    it('Harus menolak jurnal manual mentah jika salah satu baris akun adalah Akun Kontrol', async () => {
      const manualDto = {
        tenantId: 'tenant-sub-1',
        tanggal: '2026-09-15',
        deskripsi: 'Jurnal manual sembarangan ke Piutang',
        sumber_aplikasi: 'Manual Dashboard',
        entries: [
          { kode_akun: '110001', tipe: EntryType.DEBIT, jumlah: 1000000 },
          { kode_akun: '410001', tipe: EntryType.KREDIT, jumlah: 1000000 },
        ],
      };

      await expect(journalService.createManual(manualDto)).rejects.toThrow(
        BadRequestException,
      );

      try {
        await journalService.createManual(manualDto);
      } catch (err: any) {
        expect(err.response?.message).toBe(
          'Akun 110001 adalah akun kontrol AR; posting hanya melalui dokumen sub ledger',
        );
        expect(err.response?.errorCode).toBe(
          'CONTROL_ACCOUNT_MANUAL_POSTING_BLOCKED',
        );
      }
    });

    it('Harus menerima jurnal manual biasa jika semua akun adalah direct-posting biasa', async () => {
      const nonControlAccounts = [
        {
          id: 'acc-cash',
          tenantId: 'tenant-sub-1',
          kode_akun: '100001',
          nama_akun: 'Kas Kecil',
          kategori: KategoriAkun.ASET,
          isActive: true,
          isControlAccount: false,
          controlType: ControlAccountType.NONE,
        },
        {
          id: 'acc-sales',
          tenantId: 'tenant-sub-1',
          kode_akun: '410001',
          nama_akun: 'Pendapatan Penjualan',
          kategori: KategoriAkun.PENDAPATAN,
          isActive: true,
          isControlAccount: false,
          controlType: ControlAccountType.NONE,
        },
      ];

      mockPrisma.chartOfAccount.findMany.mockResolvedValueOnce(
        nonControlAccounts,
      );

      const validDto = {
        tenantId: 'tenant-sub-1',
        tanggal: '2026-09-15',
        deskripsi: 'Jurnal penjualan tunai kas kecil',
        sumber_aplikasi: 'Manual Dashboard',
        entries: [
          { kode_akun: '100001', tipe: EntryType.DEBIT, jumlah: 500000 },
          { kode_akun: '410001', tipe: EntryType.KREDIT, jumlah: 500000 },
        ],
      };

      const result = await journalService.createManual(validDto);
      expect(result).toBeDefined();
      expect(result.status).toBe(JournalStatus.POSTED);
    });
  });

  // (b) SubledgerPostingService menghormati periode CLOSED dan mengecualikan kontrol akun
  describe('Test (b): SubledgerPostingService Behavior', () => {
    it('Harus menolak posting subledger jika tanggal transaksi berada di periode CLOSED', async () => {
      (
        accountingPeriodService.validateJournalDate as jest.Mock
      ).mockRejectedValueOnce(
        new BadRequestException({
          errorCode: 'PERIOD_CLOSED',
          message: 'Periode 8 (Tahun Buku 2026) sudah ditutup. Jurnal tidak dapat diposting.',
        }),
      );

      const payload = {
        tanggal: '2026-08-15',
        sumber_aplikasi: 'SUBLEDGER-AR',
        sourceDocType: 'SALES_INVOICE',
        sourceDocId: 'inv-uuid-001',
        deskripsi: 'Posting Faktur Penjualan INV-001',
        entries: [
          { kode_akun: '110001', tipe: EntryType.DEBIT, jumlah: 2500000 },
          { kode_akun: '410001', tipe: EntryType.KREDIT, jumlah: 2500000 },
        ],
      };

      await expect(
        subledgerPostingService.postSubledgerJournal('tenant-sub-1', payload),
      ).rejects.toThrow(BadRequestException);
    });

    it('Harus berhasil memposting ke Akun Kontrol bila dilakukan via SubledgerPostingService (status POSTED)', async () => {
      (
        accountingPeriodService.validateJournalDate as jest.Mock
      ).mockResolvedValueOnce(true);

      const payload = {
        tanggal: '2026-09-15',
        sumber_aplikasi: 'SUBLEDGER-AR',
        sourceDocType: 'SALES_INVOICE',
        sourceDocId: 'inv-uuid-001',
        no_voucher: 'SI-2026-00001',
        deskripsi: 'Posting Faktur Penjualan INV-001',
        entries: [
          { kode_akun: '110001', tipe: EntryType.DEBIT, jumlah: 2500000 },
          { kode_akun: '410001', tipe: EntryType.KREDIT, jumlah: 2500000 },
        ],
      };

      const result = await subledgerPostingService.postSubledgerJournal(
        'tenant-sub-1',
        payload,
      );

      expect(result).toBeDefined();
      expect(result.status).toBe(JournalStatus.POSTED);
      expect(result.sumber_aplikasi).toBe('SUBLEDGER-AR');
      expect(result.sourceDocType).toBe('SALES_INVOICE');
      expect(result.sourceDocId).toBe('inv-uuid-001');
      expect(result.no_voucher).toBe('SI-2026-00001');
    });
  });

  // (c) Generator nomor dokumen tidak menghasilkan duplikat pada request paralel
  describe('Test (c): DocumentNumberingService Concurrency', () => {
    it('Harus menghasilkan nomor sekuensial unik tanpa duplikat pada 10 pemanggilan paralel', async () => {
      const tenantId = 'tenant-sub-1';
      const docType = 'SI';

      // 10 panggilan paralel sekaligus
      const promises = Array.from({ length: 10 }).map(() =>
        documentNumberingService.generateNextNumber(tenantId, docType, 'SI', 2026),
      );

      const results = await Promise.all(promises);

      // Verifikasi: Semua nomor harus unik
      const uniqueSet = new Set(results);
      expect(uniqueSet.size).toBe(10);

      // Format harus sesuai {PREFIX}-{YYYY}-{SEQ:5}
      for (const num of results) {
        expect(num).toMatch(/^SI-2026-\d{5}$/);
      }

      // Verifikasi urutan sekuensial
      expect(results).toContain('SI-2026-00001');
      expect(results).toContain('SI-2026-00010');
    });
  });
});
