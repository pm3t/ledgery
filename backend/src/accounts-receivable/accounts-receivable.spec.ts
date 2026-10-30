import { Test, TestingModule } from '@nestjs/testing';
import { SalesInvoiceService } from './sales-invoice.service';
import { CustomerReceiptService } from './customer-receipt.service';
import { DefaultInventoryIssueService } from './inventory-issue.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import {
  SalesInvoiceStatus,
  CustomerReceiptStatus,
  PostingSetupKey,
} from '@prisma/client';

describe('Accounts Receivable (AR) Unit Test Suite', () => {
  let salesInvoiceService: SalesInvoiceService;
  let customerReceiptService: CustomerReceiptService;
  let subledgerPostingService: jest.Mocked<Partial<SubledgerPostingService>>;
  let accountingPeriodService: jest.Mocked<Partial<AccountingPeriodService>>;
  let documentNumberingService: jest.Mocked<Partial<DocumentNumberingService>>;
  let inventoryIssueService: jest.Mocked<Partial<DefaultInventoryIssueService>>;

  const mockTenant = {
    id: 'tenant-ar-1',
    nama_perusahaan: 'PT AR Test',
    mata_uang: 'IDR',
  };

  const mockPartner = {
    id: 'partner-cust-1',
    tenantId: 'tenant-ar-1',
    kode: 'CUST-001',
    nama: 'PT Pelanggan Maju',
    isCustomer: true,
    isActive: true,
    creditLimit: 50000000,
    groupCode: null,
  };

  const mockAccounts = [
    { id: 'acc-ar', kode_akun: '11200', nama_akun: 'Piutang Usaha' },
    { id: 'acc-sales', kode_akun: '41100', nama_akun: 'Pendapatan Penjualan' },
    { id: 'acc-discount', kode_akun: '41200', nama_akun: 'Potongan Penjualan' },
    { id: 'acc-ppn', kode_akun: '21500', nama_akun: 'PPN Keluaran' },
    { id: 'acc-bank', kode_akun: '11100', nama_akun: 'Kas & Bank' },
    { id: 'acc-fx', kode_akun: '71100', nama_akun: 'Laba/Rugi Selisih Kurs' },
  ];

  let savedInvoices: any[] = [];
  let savedReceipts: any[] = [];

  const mockPrisma: any = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(mockTenant),
    },
    businessPartner: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === mockPartner.id || where.tenantId_kode?.kode === mockPartner.kode) {
          return Promise.resolve(mockPartner);
        }
        return Promise.resolve(null);
      }),
    },
    subledgerSetting: {
      findUnique: jest.fn().mockResolvedValue({
        tenantId: 'tenant-ar-1',
        arEnabled: true,
        creditLimitMode: 'BLOCK',
        agingBuckets: [30, 60, 90],
      }),
    },
    postingSetup: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.key === PostingSetupKey.AR_CONTROL) {
          return Promise.resolve({ account: mockAccounts[0] });
        }
        if (where.key === PostingSetupKey.SALES_REVENUE) {
          return Promise.resolve({ account: mockAccounts[1] });
        }
        if (where.key === PostingSetupKey.SALES_DISCOUNT) {
          return Promise.resolve({ account: mockAccounts[2] });
        }
        if (where.key === PostingSetupKey.PPN_KELUARAN) {
          return Promise.resolve({ account: mockAccounts[3] });
        }
        if (where.key === PostingSetupKey.FX_GAIN_LOSS) {
          return Promise.resolve({ account: mockAccounts[5] });
        }
        return Promise.resolve(null);
      }),
    },
    chartOfAccount: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const found = mockAccounts.find((a) => a.id === where.id || a.kode_akun === where.tenantId_kode_akun?.kode_akun);
        return Promise.resolve(found ? { ...found, isActive: true, tenantId: 'tenant-ar-1' } : null);
      }),
    },
    salesInvoice: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id) {
          const inv = savedInvoices.find((i) => i.id === where.id);
          return Promise.resolve(inv ? { ...inv, lines: [...inv.lines], partner: { ...inv.partner } } : null);
        }
        if (where.tenantId_idempotencyKey) {
          const inv = savedInvoices.find(
            (i) => i.tenantId === where.tenantId_idempotencyKey.tenantId && i.idempotencyKey === where.tenantId_idempotencyKey.idempotencyKey,
          );
          return Promise.resolve(inv ? { ...inv, lines: [...inv.lines], partner: { ...inv.partner } } : null);
        }
        return Promise.resolve(null);
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { saldoFungsional: 0 } }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newInv = {
          id: `inv-${Date.now()}-${Math.random()}`,
          ...data,
          lines: data.lines?.create || [],
          partner: mockPartner,
          allocations: [],
        };
        savedInvoices.push(newInv);
        return Promise.resolve(newInv);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = savedInvoices.findIndex((i) => i.id === where.id);
        if (idx !== -1) {
          savedInvoices[idx] = { ...savedInvoices[idx], ...data };
          return Promise.resolve(savedInvoices[idx]);
        }
        return Promise.resolve(null);
      }),
    },
    customerReceipt: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id) {
          return Promise.resolve(savedReceipts.find((r) => r.id === where.id) || null);
        }
        if (where.tenantId_idempotencyKey) {
          return Promise.resolve(
            savedReceipts.find(
              (r) => r.tenantId === where.tenantId_idempotencyKey.tenantId && r.idempotencyKey === where.tenantId_idempotencyKey.idempotencyKey,
            ) || null,
          );
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newRct = {
          id: `rct-${Date.now()}`,
          ...data,
          partner: mockPartner,
          akunKasBank: mockAccounts[4],
        };
        savedReceipts.push(newRct);
        return Promise.resolve(newRct);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = savedReceipts.findIndex((r) => r.id === where.id);
        if (idx !== -1) {
          savedReceipts[idx] = { ...savedReceipts[idx], ...data };
          return Promise.resolve(savedReceipts[idx]);
        }
        return Promise.resolve(null);
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return await callback(mockPrisma);
    }),
  };

  beforeEach(async () => {
    savedInvoices = [];
    savedReceipts = [];

    accountingPeriodService = {
      validateJournalDate: jest.fn().mockResolvedValue(true),
    };

    subledgerPostingService = {
      postSubledgerJournal: jest.fn().mockImplementation(async (tenantId, payload) => {
        return {
          id: `jnl-${Date.now()}`,
          no_voucher: payload.no_voucher,
          status: 'POSTED',
          entries: payload.entries,
        };
      }),
      reverseJournal: jest.fn().mockResolvedValue({
        id: `rev-${Date.now()}`,
        status: 'POSTED',
      }),
    };

    documentNumberingService = {
      generateNextNumber: jest.fn().mockImplementation((tenantId, docType, prefix) => {
        return Promise.resolve(`${prefix}-2026-0001`);
      }),
    };

    inventoryIssueService = {
      issueStockForInvoice: jest.fn().mockResolvedValue({ cogsAmount: 0 }),
      returnStockForCreditNote: jest.fn().mockResolvedValue({ cogsAmount: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesInvoiceService,
        CustomerReceiptService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubledgerPostingService, useValue: subledgerPostingService },
        { provide: AccountingPeriodService, useValue: accountingPeriodService },
        { provide: DocumentNumberingService, useValue: documentNumberingService },
        { provide: DefaultInventoryIssueService, useValue: inventoryIssueService },
      ],
    }).compile();

    salesInvoiceService = module.get<SalesInvoiceService>(SalesInvoiceService);
    customerReceiptService = module.get<CustomerReceiptService>(CustomerReceiptService);
  });

  // (1) Jurnal Faktur Seimbang
  describe('Test (1): Jurnal Faktur Penjualan Seimbang (Balance)', () => {
    it('Harus menghasilkan entri jurnal GL yang balance (Total Debit === Total Kredit)', async () => {
      // Buat draft faktur: Qty 2 @ 500.000 = 1.000.000, Diskon 100.000, DPP 900.000, PPN 11% = 99.000, Total = 999.000
      const draft = await salesInvoiceService.createDraft('tenant-ar-1', {
        tanggal: '2026-10-15',
        jatuhTempo: '2026-11-15',
        partnerId: 'partner-cust-1',
        lines: [
          {
            deskripsi: 'Jasa Konsultasi ERP',
            qty: 2,
            hargaSatuan: 500000,
            diskon: 100000,
            ppnRate: 11,
          },
        ],
      });

      expect(draft.total).toBe(999000);

      // Posting Faktur
      const posted = await salesInvoiceService.postInvoice('tenant-ar-1', draft.id);
      expect(posted.status).toBe(SalesInvoiceStatus.POSTED);

      // Verifikasi pemanggilan postSubledgerJournal
      expect(subledgerPostingService.postSubledgerJournal).toHaveBeenCalled();
      const callArgs = (subledgerPostingService.postSubledgerJournal as jest.Mock).mock.calls[0][1];
      const entries = callArgs.entries;

      let totalDebit = 0;
      let totalKredit = 0;
      for (const e of entries) {
        if (e.tipe === 'DEBIT') totalDebit += e.jumlah;
        if (e.tipe === 'KREDIT') totalKredit += e.jumlah;
      }

      // Total Debit (Piutang 999.000 + Diskon 100.000) = 1.099.000
      // Total Kredit (Pendapatan 1.000.000 + PPN 99.000) = 1.099.000
      expect(totalDebit).toBe(totalKredit);
      expect(totalDebit).toBe(1099000);
    });
  });

  // (2) Alokasi Parsial & Lunas Mengubah Status dengan Benar
  describe('Test (2): Alokasi Pembayaran Parsial & Lunas Mengubah Status Faktur', () => {
    it('Harus mengubah status faktur dari POSTED -> PARTIAL -> PAID', async () => {
      // 1. Buat dan post faktur total 1.000.000
      const draft = await salesInvoiceService.createDraft('tenant-ar-1', {
        tanggal: '2026-10-01',
        jatuhTempo: '2026-10-31',
        partnerId: 'partner-cust-1',
        lines: [
          {
            deskripsi: 'Penjualan Produk A',
            qty: 1,
            hargaSatuan: 1000000,
          },
        ],
      });
      const posted = await salesInvoiceService.postInvoice('tenant-ar-1', draft.id);
      expect(posted.saldo).toBe(1000000);
      expect(posted.status).toBe(SalesInvoiceStatus.POSTED);

      // 2. Pembayaran Pertama: Parsial 400.000
      await customerReceiptService.createAndPostReceipt('tenant-ar-1', {
        tanggal: '2026-10-10',
        partnerId: 'partner-cust-1',
        akunKasBankId: 'acc-bank',
        jumlah: 400000,
        allocations: [
          {
            invoiceId: posted.id,
            jumlahAlokasi: 400000,
          },
        ],
      });

      const invAfterPartial = await salesInvoiceService.findOne('tenant-ar-1', posted.id);
      expect(invAfterPartial.saldo).toBe(600000);
      expect(invAfterPartial.totalDialokasikan).toBe(400000);
      expect(invAfterPartial.status).toBe(SalesInvoiceStatus.PARTIAL);

      // 3. Pembayaran Kedua: Pelunasan 600.000
      await customerReceiptService.createAndPostReceipt('tenant-ar-1', {
        tanggal: '2026-10-20',
        partnerId: 'partner-cust-1',
        akunKasBankId: 'acc-bank',
        jumlah: 600000,
        allocations: [
          {
            invoiceId: posted.id,
            jumlahAlokasi: 600000,
          },
        ],
      });

      const invAfterPaid = await salesInvoiceService.findOne('tenant-ar-1', posted.id);
      expect(invAfterPaid.saldo).toBe(0);
      expect(invAfterPaid.totalDialokasikan).toBe(1000000);
      expect(invAfterPaid.status).toBe(SalesInvoiceStatus.PAID);
    });
  });

  // (3) Void Ditolak Bila Ada Alokasi atau Periode CLOSED
  describe('Test (3): Void Ditolak Bila Ada Alokasi Aktif atau Periode CLOSED', () => {
    it('Harus menolak void faktur jika faktur sudah memiliki alokasi pembayaran', async () => {
      // Buat faktur dengan alokasi aktif
      const draft = await salesInvoiceService.createDraft('tenant-ar-1', {
        tanggal: '2026-10-01',
        jatuhTempo: '2026-10-31',
        partnerId: 'partner-cust-1',
        lines: [{ deskripsi: 'Jasa', qty: 1, hargaSatuan: 500000 }],
      });
      const posted = await salesInvoiceService.postInvoice('tenant-ar-1', draft.id);

      // Tambahkan alokasi pembayaran
      await customerReceiptService.createAndPostReceipt('tenant-ar-1', {
        tanggal: '2026-10-05',
        partnerId: 'partner-cust-1',
        akunKasBankId: 'acc-bank',
        jumlah: 200000,
        allocations: [{ invoiceId: posted.id, jumlahAlokasi: 200000 }],
      });

      // Coba void faktur -> HARUS DITOLAK
      await expect(
        salesInvoiceService.voidInvoice('tenant-ar-1', posted.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('Harus menolak void transaksi jika tanggal berada di periode CLOSED', async () => {
      const draft = await salesInvoiceService.createDraft('tenant-ar-1', {
        tanggal: '2026-10-01',
        jatuhTempo: '2026-10-31',
        partnerId: 'partner-cust-1',
        lines: [{ deskripsi: 'Jasa', qty: 1, hargaSatuan: 500000 }],
      });
      const posted = await salesInvoiceService.postInvoice('tenant-ar-1', draft.id);

      // Simulasikan periode akuntansi CLOSED
      (accountingPeriodService.validateJournalDate as jest.Mock).mockRejectedValueOnce(
        new BadRequestException('Periode akuntansi telah ditutup (CLOSED).'),
      );

      await expect(
        salesInvoiceService.voidInvoice('tenant-ar-1', posted.id),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // (4) Idempotency Key Ganda Tidak Membuat Faktur Kedua
  describe('Test (4): Idempotency Key Replay', () => {
    it('Harus mengembalikan faktur yang sudah ada tanpa menduplikasi data saat key sama dikirim ulang', async () => {
      const payload = {
        tanggal: '2026-10-15',
        jatuhTempo: '2026-11-15',
        partnerId: 'partner-cust-1',
        idempotencyKey: 'IDEMP-AR-999',
        lines: [{ deskripsi: 'Lisensi Software', qty: 1, hargaSatuan: 2500000 }],
      };

      // Request pertama
      const firstCall = await salesInvoiceService.createDraft('tenant-ar-1', payload);
      expect(firstCall.idempotencyKey).toBe('IDEMP-AR-999');

      const initialCount = savedInvoices.length;

      // Request kedua dengan idempotencyKey yang sama
      const secondCall = await salesInvoiceService.createDraft('tenant-ar-1', payload);

      // ID harus sama persis dan jumlah record tidak bertambah
      expect(secondCall.id).toBe(firstCall.id);
      expect(savedInvoices.length).toBe(initialCount);
    });
  });

  // (5) Selisih Kurs Realisasi Terjurnal Saat Alokasi Mata Uang Asing
  describe('Test (5): Selisih Kurs Realisasi (Realized FX Gain/Loss)', () => {
    it('Harus menghitung dan mencatat laba selisih kurs ke FX_GAIN_LOSS saat kurs penerimaan > kurs faktur', async () => {
      // 1. Faktur dalam USD: Kurs historis 15.000, Total USD 100 = Rp 1.500.000
      const draft = await salesInvoiceService.createDraft('tenant-ar-1', {
        tanggal: '2026-10-01',
        jatuhTempo: '2026-10-31',
        partnerId: 'partner-cust-1',
        mata_uang: 'USD',
        kurs: 15000,
        lines: [{ deskripsi: 'Hosting Server', qty: 1, hargaSatuan: 100 }],
      });
      const posted = await salesInvoiceService.postInvoice('tenant-ar-1', draft.id);

      // 2. Penerimaan dalam USD: Kurs saat bayar 16.000 (Penguatan USD -> Realized FX Gain Rp 100.000)
      await customerReceiptService.createAndPostReceipt('tenant-ar-1', {
        tanggal: '2026-10-25',
        partnerId: 'partner-cust-1',
        akunKasBankId: 'acc-bank',
        mata_uang: 'USD',
        kurs: 16000,
        jumlah: 100,
        allocations: [
          {
            invoiceId: posted.id,
            jumlahAlokasi: 100,
            kursAlokasi: 16000,
          },
        ],
      });

      // 3. Verifikasi jurnal penerimaan mencakup akun FX_GAIN_LOSS
      const postCalls = (subledgerPostingService.postSubledgerJournal as jest.Mock).mock.calls;
      const receiptCall = postCalls.find((c) => c[1].sourceDocType === 'CUSTOMER_RECEIPT');
      expect(receiptCall).toBeDefined();

      const entries = receiptCall[1].entries;
      const fxEntry = entries.find((e: any) => e.kode_akun === '71100'); // Akun FX_GAIN_LOSS
      expect(fxEntry).toBeDefined();
      expect(fxEntry.tipe).toBe('KREDIT'); // Gain berada di sisi Kredit
      expect(fxEntry.jumlah).toBe(100000); // 100 USD * (16.000 - 15.000) = 100.000
    });
  });
});
