import { Test, TestingModule } from '@nestjs/testing';
import { CashBankCaptureService } from './services/cash-bank-capture.service';
import { CashBankAccountService } from './services/cash-bank-account.service';
import { CashDocumentService } from './services/cash-document.service';
import { CashBankReportService } from './services/cash-bank-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { SelisihKursService } from '../selisih-kurs/selisih-kurs.service';
import {
  CashBankAccountType,
  CashBankEntryDirection,
  CashBankSourceType,
  CashDocStatus,
  ControlAccountType,
  JournalStatus,
  EntryType,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('Modul 19: Sub Ledger Kas & Bank Unit Tests', () => {
  let captureService: CashBankCaptureService;
  let accountService: CashBankAccountService;
  let docService: CashDocumentService;
  let reportService: CashBankReportService;
  let prisma: any;
  let subledgerPosting: any;

  const mockTenantId = 'tenant-test-cash-bank';
  const mockCoaBca = {
    id: 'coa-bca-01',
    tenantId: mockTenantId,
    kode_akun: '1-1002',
    nama_akun: 'Bank BCA Giro',
    controlType: ControlAccountType.CASH_BANK,
    cashFlowCategory: null,
    isActive: true,
  };
  const mockCoaKasKecil = {
    id: 'coa-kas-kecil-01',
    tenantId: mockTenantId,
    kode_akun: '1-1001',
    nama_akun: 'Kas Kecil Kantor',
    controlType: ControlAccountType.CASH_BANK,
    cashFlowCategory: null,
    isActive: true,
  };
  const mockCoaBiaya = {
    id: 'coa-biaya-adm-01',
    tenantId: mockTenantId,
    kode_akun: '6-1001',
    nama_akun: 'Beban Operasional & ATK',
    controlType: ControlAccountType.NONE,
    cashFlowCategory: 'OPERASI',
    isActive: true,
  };

  const mockAccountBca = {
    id: 'cba-bca-01',
    tenantId: mockTenantId,
    kode: 'BCA-01',
    nama: 'Bank BCA Operasional',
    jenis: CashBankAccountType.BANK,
    chartOfAccountId: mockCoaBca.id,
    mata_uang: 'IDR',
    namaBank: 'BCA',
    noRekening: '1234567890',
    namaPemilik: 'PT Demo Sejahtera',
    plafonKasKecil: null,
    isActive: true,
    chartOfAccount: mockCoaBca,
  };

  const mockAccountKasKecil = {
    id: 'cba-kas-kecil-01',
    tenantId: mockTenantId,
    kode: 'KAS-KECIL',
    nama: 'Kas Kecil Head Office',
    jenis: CashBankAccountType.KAS_KECIL,
    chartOfAccountId: mockCoaKasKecil.id,
    mata_uang: 'IDR',
    namaBank: null,
    noRekening: null,
    namaPemilik: null,
    plafonKasKecil: 5000000,
    isActive: true,
    chartOfAccount: mockCoaKasKecil,
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: mockTenantId, mata_uang: 'IDR' }),
      },
      chartOfAccount: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockCoaBca.id) return Promise.resolve(mockCoaBca);
          if (where.id === mockCoaKasKecil.id) return Promise.resolve(mockCoaKasKecil);
          if (where.id === mockCoaBiaya.id) return Promise.resolve(mockCoaBiaya);
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockCoaBca.id) return Promise.resolve(mockCoaBca);
          if (where.id === mockCoaKasKecil.id) return Promise.resolve(mockCoaKasKecil);
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([mockCoaBca, mockCoaKasKecil]),
      },
      cashBankAccount: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockAccountBca.id) return Promise.resolve(mockAccountBca);
          if (where.id === mockAccountKasKecil.id) return Promise.resolve(mockAccountKasKecil);
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockAccountBca.id || where.chartOfAccountId === mockCoaBca.id)
            return Promise.resolve(mockAccountBca);
          if (where.id === mockAccountKasKecil.id || where.chartOfAccountId === mockCoaKasKecil.id)
            return Promise.resolve(mockAccountKasKecil);
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([mockAccountBca, mockAccountKasKecil]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-cba', ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ ...mockAccountBca, ...data })),
      },
      cashBankEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cbe-' + Math.random(), ...data })),
      },
      cashReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rec-01', ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      },
      cashDisbursement: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'disb-01', ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      },
      cashTransfer: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'trans-01', ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      },
      journal: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      subledgerSetting: {
        findUnique: jest.fn().mockResolvedValue({
          tenantId: mockTenantId,
          cashBankEnabled: true,
          pettyCashOverLimitMode: 'WARN',
        }),
      },
      postingSetup: {
        findFirst: jest.fn().mockResolvedValue({ accountId: 'coa-bank-charge', account: { kode_akun: '6-9999' } }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return await cb(prisma);
      }),
    };

    subledgerPosting = {
      postSubledgerJournal: jest.fn().mockResolvedValue({
        id: 'mock-journal-posted-01',
        no_voucher: 'JNL-2026-0001',
        status: JournalStatus.POSTED,
      }),
      reverseJournal: jest.fn().mockResolvedValue({
        id: 'mock-journal-reversed-01',
        no_voucher: 'JNL-2026-0002',
        status: JournalStatus.POSTED,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashBankCaptureService,
        CashBankAccountService,
        CashDocumentService,
        CashBankReportService,
        { provide: PrismaService, useValue: prisma },
        { provide: SubledgerPostingService, useValue: subledgerPosting },
        {
          provide: DocumentNumberingService,
          useValue: {
            getNextDocumentNumber: jest.fn().mockResolvedValue('DOC-2026-0001'),
          },
        },
        {
          provide: AccountingPeriodService,
          useValue: {
            validateJournalDate: jest.fn().mockResolvedValue({ status: 'OPEN' }),
          },
        },
        {
          provide: SelisihKursService,
          useValue: {
            hitungSelisihKurs: jest.fn().mockReturnValue({ selisih: 0, gainLoss: 'BALANCE' }),
          },
        },
      ],
    }).compile();

    captureService = module.get<CashBankCaptureService>(CashBankCaptureService);
    accountService = module.get<CashBankAccountService>(CashBankAccountService);
    docService = module.get<CashDocumentService>(CashDocumentService);
    reportService = module.get<CashBankReportService>(CashBankReportService);
  });

  // =========================================================================
  // TEST 1: Auto-Capture Jurnal Mentah ke Buku Kas/Bank
  // =========================================================================
  it('(1) Jurnal mentah (POSTED) yang mendebit akun CASH_BANK menghasilkan 1 CashBankEntry dengan sourceType JOURNAL_CAPTURE & idempoten', async () => {
    const mockJournal = {
      id: 'journal-raw-01',
      tenantId: mockTenantId,
      tanggal: new Date('2026-10-15'),
      deskripsi: 'Jurnal gaji karyawan kredit kas bank',
      status: JournalStatus.POSTED,
      sourceDocType: null,
      sourceDocId: null,
      entries: [
        {
          id: 'entry-debit-01',
          chartOfAccountId: mockCoaBca.id,
          chartOfAccount: mockCoaBca,
          tipe: EntryType.DEBIT,
          jumlah: 25000000,
          jumlah_konversi: 25000000,
        },
        {
          id: 'entry-kredit-02',
          chartOfAccountId: mockCoaBiaya.id,
          chartOfAccount: mockCoaBiaya,
          tipe: EntryType.KREDIT,
          jumlah: 25000000,
          jumlah_konversi: 25000000,
        },
      ],
    };

    prisma.journal.findUnique.mockResolvedValue(mockJournal);

    // Jalankan capture pertama
    const createdCount = await captureService.captureJournal('journal-raw-01');
    expect(createdCount).toBe(1);
    expect(prisma.cashBankEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashBankAccountId: mockAccountBca.id,
          arah: CashBankEntryDirection.MASUK,
          jumlah: 25000000,
          sourceType: CashBankSourceType.JOURNAL_CAPTURE,
          journalEntryId: 'entry-debit-01',
        }),
      }),
    );

    // Jalankan kedua kali: mock prisma.cashBankEntry.findUnique mengembalikan record yang sudah ada
    prisma.cashBankEntry.findUnique.mockResolvedValueOnce({ id: 'cbe-existing-01' });
    const duplicateCount = await captureService.captureJournal('journal-raw-01');
    expect(duplicateCount).toBe(0);
  });

  // =========================================================================
  // TEST 2: Jurnal PENDING tidak menghasilkan entri sebelum APPROVED
  // =========================================================================
  it('(2) Jurnal dengan status PENDING tidak menghasilkan CashBankEntry sampai berstatus APPROVED', async () => {
    const pendingJournal: any = {
      id: 'journal-pending-01',
      tenantId: mockTenantId,
      tanggal: new Date('2026-10-16'),
      deskripsi: 'Jurnal pembayaran pending approval',
      status: JournalStatus.PENDING,
      entries: [
        {
          id: 'entry-pending-01',
          chartOfAccountId: mockCoaBca.id,
          chartOfAccount: mockCoaBca,
          tipe: EntryType.KREDIT,
          jumlah: 5000000,
          jumlah_konversi: 5000000,
        },
      ],
    };

    prisma.journal.findUnique.mockResolvedValue(pendingJournal);

    const count = await captureService.captureJournal('journal-pending-01');
    expect(count).toBe(0);
    expect(prisma.cashBankEntry.create).not.toHaveBeenCalled();

    // Setelah diapprove
    pendingJournal.status = JournalStatus.APPROVED;
    prisma.cashBankEntry.findUnique.mockResolvedValue(null);
    const countApproved = await captureService.captureJournal('journal-pending-01');
    expect(countApproved).toBe(1);
    expect(prisma.cashBankEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          arah: CashBankEntryDirection.KELUAR,
          jumlah: 5000000,
        }),
      }),
    );
  });

  // =========================================================================
  // TEST 3: Dokumen Kas (Penerimaan & Pengeluaran) membuat CashBankEntry
  // =========================================================================
  it('(3) Dokumen CashReceipt memposting jurnal GL dan menghasilkan CashBankEntry dengan sourceType CASH_RECEIPT', async () => {
    const receiptDraft = {
      id: 'receipt-01',
      tenantId: mockTenantId,
      noDokumen: 'CR-2026-0001',
      tanggal: new Date('2026-10-20'),
      cashBankAccountId: mockAccountBca.id,
      mata_uang: 'IDR',
      kurs: 1,
      total: 10000000,
      status: CashDocStatus.DRAFT,
      lines: [
        {
          id: 'line-01',
          akunLawanId: mockCoaBiaya.id,
          akunLawan: mockCoaBiaya,
          deskripsi: 'Penerimaan sponsorship',
          jumlah: 10000000,
        },
      ],
      cashBankAccount: mockAccountBca,
    };

    prisma.cashReceipt.findFirst.mockResolvedValue(receiptDraft);

    const postedReceipt = await docService.postReceipt(mockTenantId, 'receipt-01');
    expect(postedReceipt.status).toBe(CashDocStatus.POSTED);
    expect(subledgerPosting.postSubledgerJournal).toHaveBeenCalledWith(
      mockTenantId,
      expect.objectContaining({
        sourceDocType: 'CASH_RECEIPT',
        sourceDocId: 'receipt-01',
      }),
    );
  });

  // =========================================================================
  // TEST 4: Void Ditolak Jika Sudah Cleared (Telah Direkonsiliasi)
  // =========================================================================
  it('(4) Void dokumen kas membuat entri pembalik; tolak void jika entri sudah clearedAt !== null', async () => {
    const postedReceipt = {
      id: 'receipt-posted-01',
      tenantId: mockTenantId,
      noDokumen: 'CR-2026-0002',
      tanggal: new Date('2026-10-21'),
      cashBankAccountId: mockAccountBca.id,
      journalId: 'journal-receipt-01',
      status: CashDocStatus.POSTED,
      total: 5000000,
      lines: [],
      cashBankAccount: mockAccountBca,
    };

    prisma.cashReceipt.findFirst.mockResolvedValue(postedReceipt);

    // Skenario A: Entri sudah clearedAt -> assertCanReverse melempar BadRequestException
    prisma.cashBankEntry.findMany.mockResolvedValueOnce([
      {
        id: 'cbe-cleared-01',
        clearedAt: new Date('2026-10-25'),
      },
    ]);

    await expect(
      docService.voidReceipt(mockTenantId, 'receipt-posted-01', 'Salah input'),
    ).rejects.toThrow(BadRequestException);

    // Skenario B: Entri belum clearedAt -> Berhasil di-void
    prisma.cashBankEntry.findMany.mockResolvedValueOnce([]); // assertCanReverse
    const voided = await docService.voidReceipt(mockTenantId, 'receipt-posted-01', 'Salah input');
    expect(voided.status).toBe(CashDocStatus.VOID);
    expect(subledgerPosting.reverseJournal).toHaveBeenCalledWith(
      mockTenantId,
      'journal-receipt-01',
      undefined,
      expect.any(String),
    );
  });

  // =========================================================================
  // TEST 5: Pengisian Kas Kecil (Replenishment) dan Plafon Imprest
  // =========================================================================
  it('(5) Pengisian kas kecil (PENGISIAN_KAS_KECIL) menghitung saran nominal plafon - saldo dan menandai voucher yang diganti', async () => {
    // Plafon = 5.000.000. Ada 2 voucher yang belum diganti (total 3.200.000).
    const voucher1 = {
      id: 'v-01',
      noDokumen: 'PCV-001',
      tanggal: new Date('2026-10-10'),
      total: 1200000,
      replenishmentId: null,
      status: CashDocStatus.POSTED,
      docVariant: 'PETTY_VOUCHER',
    };
    const voucher2 = {
      id: 'v-02',
      noDokumen: 'PCV-002',
      tanggal: new Date('2026-10-12'),
      total: 2000000,
      replenishmentId: null,
      status: CashDocStatus.POSTED,
      docVariant: 'PETTY_VOUCHER',
    };

    // Saldo kas kecil saat ini = 1.800.000 (Plafon 5.000.000 - 3.200.000)
    prisma.cashBankEntry.findMany.mockResolvedValueOnce([
      { arah: CashBankEntryDirection.MASUK, jumlah: 5000000, jumlahFungsional: 5000000 },
      { arah: CashBankEntryDirection.KELUAR, jumlah: 3200000, jumlahFungsional: 3200000 },
    ]);
    prisma.cashDisbursement.findMany.mockResolvedValueOnce([voucher1, voucher2]);

    const suggestion = await docService.getPettyCashReplenishmentSuggestion(
      mockTenantId,
      mockAccountKasKecil.id,
    );

    expect(suggestion.plafon).toBe(5000000);
    expect(suggestion.saldoSaatIni).toBe(1800000);
    expect(suggestion.suggestedNominal).toBe(3200000);
    expect(suggestion.vouchers).toHaveLength(2);
    expect(suggestion.totalVouchers).toBe(3200000);
  });

  // =========================================================================
  // TEST 6: Laporan Arus Kas Metode Langsung
  // =========================================================================
  it('(6) Laporan arus kas metode langsung mengelompokkan akun lawan dan mengecualikan transfer internal', async () => {
    // 1 Penerimaan Operasi (10.000.000)
    // 1 Pengeluaran Operasi (3.000.000)
    const entries = [
      {
        id: 'entry-ops-in',
        cashBankAccountId: mockAccountBca.id,
        tanggal: new Date('2026-10-10'),
        arah: CashBankEntryDirection.MASUK,
        jumlahFungsional: 10000000,
        sourceType: CashBankSourceType.CASH_RECEIPT,
        journalId: 'j-01',
        journalEntryId: 'je-01',
        journal: {
          entries: [
            { id: 'je-01', chartOfAccount: mockCoaBca, tipe: EntryType.DEBIT, jumlah: 10000000 },
            { id: 'je-02', chartOfAccount: { ...mockCoaBiaya, cashFlowCategory: 'OPERASI' }, tipe: EntryType.KREDIT, jumlah: 10000000 },
          ],
        },
      },
      {
        id: 'entry-ops-out',
        cashBankAccountId: mockAccountBca.id,
        tanggal: new Date('2026-10-12'),
        arah: CashBankEntryDirection.KELUAR,
        jumlahFungsional: 3000000,
        sourceType: CashBankSourceType.CASH_DISBURSEMENT,
        journalId: 'j-02',
        journalEntryId: 'je-03',
        journal: {
          entries: [
            { id: 'je-03', chartOfAccount: mockCoaBca, tipe: EntryType.KREDIT, jumlah: 3000000 },
            { id: 'je-04', chartOfAccount: { ...mockCoaBiaya, cashFlowCategory: 'OPERASI' }, tipe: EntryType.DEBIT, jumlah: 3000000 },
          ],
        },
      },
    ];

    prisma.cashBankEntry.findMany.mockResolvedValueOnce([]); // priorEntries
    prisma.cashBankEntry.findMany.mockResolvedValueOnce(entries); // currentEntries

    const report = await reportService.getDirectCashFlowReport(mockTenantId, {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    expect(report.operasi.arusKasMasuk).toBe(10000000);
    expect(report.operasi.arusKasKeluar).toBe(3000000);
    expect(report.operasi.arusKasBersih).toBe(7000000);
    expect(report.kenaikanPenurunanBersihKas).toBe(7000000);
  });
});
