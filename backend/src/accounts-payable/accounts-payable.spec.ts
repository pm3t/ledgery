import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseBillService } from './purchase-bill.service';
import { VendorPaymentService } from './vendor-payment.service';
import { DefaultInventoryReceiptService } from './inventory-receipt.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import {
  PurchaseBillStatus,
  VendorPaymentStatus,
  PostingSetupKey,
} from '@prisma/client';

describe('Accounts Payable (AP) Unit Test Suite', () => {
  let purchaseBillService: PurchaseBillService;
  let vendorPaymentService: VendorPaymentService;
  let subledgerPostingService: jest.Mocked<Partial<SubledgerPostingService>>;
  let accountingPeriodService: jest.Mocked<Partial<AccountingPeriodService>>;
  let documentNumberingService: jest.Mocked<Partial<DocumentNumberingService>>;
  let inventoryReceiptService: jest.Mocked<Partial<DefaultInventoryReceiptService>>;

  const mockTenant = {
    id: 'tenant-ap-1',
    nama_perusahaan: 'PT AP Vendor Test',
    mata_uang: 'IDR',
  };

  const mockVendor = {
    id: 'partner-vendor-1',
    tenantId: 'tenant-ap-1',
    kode: 'VEND-001',
    nama: 'CV Supplier Utama',
    isVendor: true,
    isCustomer: false,
    isActive: true,
    groupCode: null,
  };

  const mockAccounts = [
    { id: 'acc-ap', kode_akun: '21100', nama_akun: 'Hutang Usaha' },
    { id: 'acc-expense', kode_akun: '51100', nama_akun: 'Beban Operasional Pembelian' },
    { id: 'acc-discount', kode_akun: '51200', nama_akun: 'Potongan Pembelian' },
    { id: 'acc-ppn', kode_akun: '11600', nama_akun: 'PPN Masukan' },
    { id: 'acc-bank', kode_akun: '11100', nama_akun: 'Kas & Bank' },
    { id: 'acc-fx', kode_akun: '71100', nama_akun: 'Laba/Rugi Selisih Kurs' },
    { id: 'acc-inv', kode_akun: '11400', nama_akun: 'Persediaan Barang Dagang' },
    { id: 'acc-grir', kode_akun: '21300', nama_akun: 'Barang Diterima Belum Ditagih (GR/IR)' },
  ];

  let savedBills: any[] = [];
  let savedPayments: any[] = [];

  const mockPrisma: any = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(mockTenant),
    },
    businessPartner: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id === mockVendor.id || where.tenantId_kode?.kode === mockVendor.kode) {
          return Promise.resolve(mockVendor);
        }
        return Promise.resolve(null);
      }),
    },
    subledgerSetting: {
      findUnique: jest.fn().mockResolvedValue({
        tenantId: 'tenant-ap-1',
        apEnabled: true,
        inventoryEnabled: true,
        agingBuckets: [30, 60, 90],
      }),
    },
    postingSetup: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.key === PostingSetupKey.AP_CONTROL) {
          return Promise.resolve({ account: mockAccounts[0] });
        }
        if (where.key === PostingSetupKey.PURCHASE_EXPENSE) {
          return Promise.resolve({ account: mockAccounts[1] });
        }
        if (where.key === PostingSetupKey.PURCHASE_DISCOUNT) {
          return Promise.resolve({ account: mockAccounts[2] });
        }
        if (where.key === PostingSetupKey.PPN_MASUKAN) {
          return Promise.resolve({ account: mockAccounts[3] });
        }
        if (where.key === PostingSetupKey.FX_GAIN_LOSS) {
          return Promise.resolve({ account: mockAccounts[5] });
        }
        if (where.key === PostingSetupKey.INVENTORY) {
          return Promise.resolve({ account: mockAccounts[6] });
        }
        if (where.key === PostingSetupKey.GR_IR_CLEARING) {
          return Promise.resolve({ account: mockAccounts[7] });
        }
        return Promise.resolve(null);
      }),
    },
    chartOfAccount: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const found = mockAccounts.find((a) => a.id === where.id || a.kode_akun === where.tenantId_kode_akun?.kode_akun);
        return Promise.resolve(found ? { ...found, isActive: true, tenantId: 'tenant-ap-1' } : null);
      }),
    },
    purchaseBill: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id) {
          const item = savedBills.find((b) => b.id === where.id);
          return Promise.resolve(item ? { ...item, lines: [...item.lines], partner: mockVendor, allocations: [] } : null);
        }
        if (where.tenantId_idempotencyKey) {
          const item = savedBills.find(
            (b) =>
              b.tenantId === where.tenantId_idempotencyKey.tenantId &&
              b.idempotencyKey === where.tenantId_idempotencyKey.idempotencyKey,
          );
          return Promise.resolve(item ? { ...item, lines: [...item.lines], partner: mockVendor } : null);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newBill = {
          id: `bill-${Date.now()}-${Math.random()}`,
          ...data,
          lines: (data.lines?.create || []).map((l: any, idx: number) => ({
            id: `line-${idx}`,
            ...l,
            akunBiaya: mockAccounts[1],
          })),
          partner: mockVendor,
          allocations: [],
        };
        savedBills.push(newBill);
        return Promise.resolve(newBill);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = savedBills.findIndex((b) => b.id === where.id);
        if (idx >= 0) {
          savedBills[idx] = { ...savedBills[idx], ...data };
          return Promise.resolve({ ...savedBills[idx], partner: mockVendor, lines: savedBills[idx].lines });
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => Promise.resolve(savedBills)),
    },
    vendorPayment: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.id) {
          const item = savedPayments.find((p) => p.id === where.id);
          return Promise.resolve(item ? { ...item, allocations: [...item.allocations] } : null);
        }
        if (where.tenantId_idempotencyKey) {
          const item = savedPayments.find(
            (p) =>
              p.tenantId === where.tenantId_idempotencyKey.tenantId &&
              p.idempotencyKey === where.tenantId_idempotencyKey.idempotencyKey,
          );
          return Promise.resolve(item ? { ...item, allocations: [...item.allocations] } : null);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newPayment = {
          id: `pay-${Date.now()}-${Math.random()}`,
          ...data,
          allocations: data.allocations?.create || [],
          partner: mockVendor,
        };
        savedPayments.push(newPayment);
        return Promise.resolve(newPayment);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = savedPayments.findIndex((p) => p.id === where.id);
        if (idx >= 0) {
          savedPayments[idx] = { ...savedPayments[idx], ...data };
          return Promise.resolve(savedPayments[idx]);
        }
        return Promise.resolve(null);
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return await callback(mockPrisma);
    }),
  };

  beforeEach(async () => {
    savedBills = [];
    savedPayments = [];

    subledgerPostingService = {
      postSubledgerJournal: jest.fn().mockResolvedValue({ id: 'journal-subledger-1' }),
      reverseJournal: jest.fn().mockResolvedValue({ id: 'journal-reverse-1' }),
    };

    accountingPeriodService = {
      validateJournalDate: jest.fn().mockResolvedValue(undefined),
    };

    documentNumberingService = {
      generateNextNumber: jest.fn().mockResolvedValue('BILL-2026-00001'),
    };

    inventoryReceiptService = {
      receiveStockForBill: jest.fn().mockResolvedValue({ costAmount: 1000000 }),
      returnStockForDebitNote: jest.fn().mockResolvedValue({ costAmount: 500000 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseBillService,
        VendorPaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubledgerPostingService, useValue: subledgerPostingService },
        { provide: DocumentNumberingService, useValue: documentNumberingService },
        { provide: AccountingPeriodService, useValue: accountingPeriodService },
        { provide: DefaultInventoryReceiptService, useValue: inventoryReceiptService },
      ],
    }).compile();

    purchaseBillService = module.get<PurchaseBillService>(PurchaseBillService);
    vendorPaymentService = module.get<VendorPaymentService>(VendorPaymentService);
  });

  // =========================================================================
  // TEST 1: Post Bill Menghasilkan Jurnal Seimbang (Balanced)
  // =========================================================================
  it('1. Post Faktur Pembelian menghasilkan entri jurnal GL yang seimbang (Dr Biaya + Dr PPN = Cr AP_CONTROL)', async () => {
    // Buat draft faktur pembelian: DPP 10.000.000, Diskon 500.000, PPN 11% (1.045.000) -> Total 10.545.000
    const draft = await purchaseBillService.createDraft('tenant-ap-1', {
      tanggal: '2026-03-01',
      jatuhTempo: '2026-03-31',
      partnerId: mockVendor.id,
      noFakturVendor: 'INV-VEND-9988',
      lines: [
        {
          deskripsi: 'Jasa Pemeliharaan Server',
          qty: 1,
          hargaSatuan: 10000000,
          diskon: 500000,
          ppnRate: 11,
          itemType: 'SERVICE',
        },
      ],
    });

    expect(draft.status).toBe(PurchaseBillStatus.DRAFT);
    expect(Number(draft.total)).toBe(10545000);

    // Post bill
    const posted = await purchaseBillService.postBill('tenant-ap-1', draft.id);

    expect(posted.status).toBe(PurchaseBillStatus.POSTED);
    expect(subledgerPostingService.postSubledgerJournal).toHaveBeenCalledTimes(1);

    // Ambil baris jurnal yang dikirim ke SubledgerPostingService
    const callArgs = (subledgerPostingService.postSubledgerJournal as jest.Mock).mock.calls[0][1];
    const entries = callArgs.entries;

    let totalDebit = 0;
    let totalKredit = 0;

    for (const e of entries) {
      if (e.tipe === 'DEBIT') totalDebit += Number(e.jumlah);
      if (e.tipe === 'KREDIT') totalKredit += Number(e.jumlah);
    }

    // Dr Biaya (10.000.000) + Dr PPN (1.045.000) = 11.045.000
    // Cr Diskon (500.000) + Cr Hutang AP_CONTROL (10.545.000) = 11.045.000
    expect(totalDebit).toBe(totalKredit);
    expect(totalDebit).toBe(11045000);
  });

  // =========================================================================
  // TEST 2: Pembayaran Vendor Parsial & Lunas Mengubah Saldo dan Status Bill
  // =========================================================================
  it('2. Pembayaran Vendor dengan alokasi parsial dan lunas mengubah saldo & status faktur (POSTED -> PARTIAL -> PAID)', async () => {
    // Buat dan posting faktur senilai 5.000.000
    const draft = await purchaseBillService.createDraft('tenant-ap-1', {
      tanggal: '2026-03-01',
      jatuhTempo: '2026-03-31',
      partnerId: mockVendor.id,
      lines: [
        {
          deskripsi: 'Pengadaan ATK Kantor',
          qty: 1,
          hargaSatuan: 5000000,
          diskon: 0,
          ppnRate: 0,
        },
      ],
    });
    const bill = await purchaseBillService.postBill('tenant-ap-1', draft.id);

    // Pembayaran 1: Parsial sebesar 2.000.000
    await vendorPaymentService.createAndPostPayment('tenant-ap-1', {
      tanggal: '2026-03-05',
      partnerId: mockVendor.id,
      akunKasBankId: 'acc-bank',
      jumlah: 2000000,
      allocations: [
        {
          billId: bill.id,
          jumlahAlokasi: 2000000,
        },
      ],
    });

    const billAfterPartial = await mockPrisma.purchaseBill.findUnique({ where: { id: bill.id } });
    expect(billAfterPartial.status).toBe(PurchaseBillStatus.PARTIAL);
    expect(Number(billAfterPartial.saldo)).toBe(3000000);
    expect(Number(billAfterPartial.totalDialokasikan)).toBe(2000000);

    // Pembayaran 2: Pelunasan sisa 3.000.000
    await vendorPaymentService.createAndPostPayment('tenant-ap-1', {
      tanggal: '2026-03-10',
      partnerId: mockVendor.id,
      akunKasBankId: 'acc-bank',
      jumlah: 3000000,
      allocations: [
        {
          billId: bill.id,
          jumlahAlokasi: 3000000,
        },
      ],
    });

    const billAfterPaid = await mockPrisma.purchaseBill.findUnique({ where: { id: bill.id } });
    expect(billAfterPaid.status).toBe(PurchaseBillStatus.PAID);
    expect(Number(billAfterPaid.saldo)).toBe(0);
    expect(Number(billAfterPaid.totalDialokasikan)).toBe(5000000);
  });

  // =========================================================================
  // TEST 3: Void Bill Ditolak Jika Sudah Teralokasi atau Periode Tertutup
  // =========================================================================
  it('3. Void Faktur Pembelian ditolak jika sudah memiliki alokasi pembayaran atau periode CLOSED', async () => {
    const draft = await purchaseBillService.createDraft('tenant-ap-1', {
      tanggal: '2026-03-01',
      jatuhTempo: '2026-03-31',
      partnerId: mockVendor.id,
      lines: [{ deskripsi: 'Sewa Gudang', qty: 1, hargaSatuan: 2000000 }],
    });
    const bill = await purchaseBillService.postBill('tenant-ap-1', draft.id);

    // Bayar sebagian
    await vendorPaymentService.createAndPostPayment('tenant-ap-1', {
      tanggal: '2026-03-05',
      partnerId: mockVendor.id,
      akunKasBankId: 'acc-bank',
      jumlah: 500000,
      allocations: [{ billId: bill.id, jumlahAlokasi: 500000 }],
    });

    // Void harus ditolak karena ada alokasi aktif
    await expect(
      purchaseBillService.voidBill('tenant-ap-1', bill.id, 'Coba batalkan faktur terbayar'),
    ).rejects.toThrow(BadRequestException);

    // Uji periode closed pada faktur tanpa alokasi
    const draft2 = await purchaseBillService.createDraft('tenant-ap-1', {
      tanggal: '2026-03-01',
      jatuhTempo: '2026-03-31',
      partnerId: mockVendor.id,
      lines: [{ deskripsi: 'Langganan Software', qty: 1, hargaSatuan: 1000000 }],
    });
    const bill2 = await purchaseBillService.postBill('tenant-ap-1', draft2.id);

    (accountingPeriodService.validateJournalDate as jest.Mock).mockRejectedValueOnce(
      new BadRequestException('Periode akuntansi sudah berstatus CLOSED'),
    );

    await expect(
      purchaseBillService.voidBill('tenant-ap-1', bill2.id, 'Batal karena periode closed'),
    ).rejects.toThrow('Periode akuntansi sudah berstatus CLOSED');
  });

  // =========================================================================
  // TEST 4: Idempotency Replay Mengembalikan Dokumen yang Sama
  // =========================================================================
  it('4. Replay request dengan idempotency_key yang sama mengembalikan dokumen faktur pembelian yang sudah ada', async () => {
    const idempotencyKey = 'idemp-bill-test-001';

    const bill1 = await purchaseBillService.createAndPostBill(
      'tenant-ap-1',
      {
        tanggal: '2026-03-01',
        jatuhTempo: '2026-03-31',
        partnerId: mockVendor.id,
        lines: [{ deskripsi: 'Pembelian Bahan Baku', qty: 10, hargaSatuan: 100000 }],
        idempotencyKey,
      },
      'Test User',
      idempotencyKey,
    );

    // Panggilan kedua dengan idempotencyKey yang sama
    const bill2 = await purchaseBillService.createAndPostBill(
      'tenant-ap-1',
      {
        tanggal: '2026-03-01',
        jatuhTempo: '2026-03-31',
        partnerId: mockVendor.id,
        lines: [{ deskripsi: 'Pembelian Bahan Baku Berbeda', qty: 99, hargaSatuan: 99999 }],
        idempotencyKey,
      },
      'Test User',
      idempotencyKey,
    );

    expect(bill2.id).toBe(bill1.id);
    expect(bill2.noDokumen).toBe(bill1.noDokumen);
    expect(savedBills.length).toBe(1);
  });

  // =========================================================================
  // TEST 5: Realisasi Selisih Kurs Pembayaran Valas ke FX_GAIN_LOSS
  // =========================================================================
  it('5. Pembayaran valuta asing menghasilkan jurnal realisasi selisih kurs yang seimbang ke akun FX_GAIN_LOSS', async () => {
    // Faktur dalam USD: $100 pada kurs 15.000 (Nilai Hutang historis = Rp 1.500.000)
    const draft = await purchaseBillService.createDraft('tenant-ap-1', {
      tanggal: '2026-03-01',
      jatuhTempo: '2026-03-31',
      partnerId: mockVendor.id,
      mata_uang: 'USD',
      kurs: 15000,
      lines: [{ deskripsi: 'Server Hosting US', qty: 1, hargaSatuan: 100 }],
    });
    const bill = await purchaseBillService.postBill('tenant-ap-1', draft.id);

    // Kasus 1: Bayar saat kurs naik ke 16.000 (RUGI KURS Rp 100.000)
    // Dr Hutang: 1.500.000, Dr FX Loss: 100.000, Cr Kas: 1.600.000
    (subledgerPostingService.postSubledgerJournal as jest.Mock).mockClear();

    await vendorPaymentService.createAndPostPayment('tenant-ap-1', {
      tanggal: '2026-03-15',
      partnerId: mockVendor.id,
      akunKasBankId: 'acc-bank',
      mata_uang: 'USD',
      kurs: 16000,
      jumlah: 100, // $100 * 16.000 = Rp 1.600.000
      allocations: [
        {
          billId: bill.id,
          jumlahAlokasi: 100,
          kursAlokasi: 16000,
        },
      ],
    });

    const callArgs = (subledgerPostingService.postSubledgerJournal as jest.Mock).mock.calls[0][1];
    const entries = callArgs.entries;

    let debitHutang = 0;
    let debitLoss = 0;
    let kreditBank = 0;

    for (const e of entries) {
      if (e.kode_akun === '21100' && e.tipe === 'DEBIT') debitHutang += Number(e.jumlah);
      if (e.kode_akun === '71100' && e.tipe === 'DEBIT') debitLoss += Number(e.jumlah);
      if (e.kode_akun === '11100' && e.tipe === 'KREDIT') kreditBank += Number(e.jumlah);
    }

    // Selisih kurs = $100 * (16.000 - 15.000) = 100.000 Loss
    expect(debitLoss).toBe(100000);
    expect(debitHutang + debitLoss).toBe(kreditBank);
    expect(kreditBank).toBe(1600000);
  });

  // =========================================================================
  // TEST 6: Faktur Pembelian Barang STOK Memanggil InventoryReceiptService
  // =========================================================================
  it('6. Faktur Pembelian dengan baris bertipe STOK memanggil InventoryReceiptService untuk menambah stok persediaan', async () => {
    const draft = await purchaseBillService.createDraft('tenant-ap-1', {
      tanggal: '2026-03-01',
      jatuhTempo: '2026-03-31',
      partnerId: mockVendor.id,
      lines: [
        {
          itemId: 'item-raw-material-1',
          itemType: 'STOCK',
          deskripsi: 'Kertas HVS A4 Rim',
          qty: 20,
          hargaSatuan: 50000, // Total 1.000.000
          diskon: 0,
          ppnRate: 0,
        },
      ],
    });

    const posted = await purchaseBillService.postBill('tenant-ap-1', draft.id);

    expect(posted.status).toBe(PurchaseBillStatus.POSTED);
    expect(inventoryReceiptService.receiveStockForBill).toHaveBeenCalledTimes(1);

    const inventoryCallArgs = (inventoryReceiptService.receiveStockForBill as jest.Mock).mock.calls[0][1];
    expect(inventoryCallArgs.itemId).toBe('item-raw-material-1');
    expect(inventoryCallArgs.qty).toBe(20);
    expect(inventoryCallArgs.nilaiMasuk).toBe(1000000);

    // Pastikan akun persediaan (INVENTORY: 11400) yang didebit
    const callArgs = (subledgerPostingService.postSubledgerJournal as jest.Mock).mock.calls[0][1];
    const invDebit = callArgs.entries.find((e: any) => e.kode_akun === '11400' && e.tipe === 'DEBIT');
    expect(invDebit).toBeDefined();
    expect(Number(invDebit.jumlah)).toBe(1000000);
  });
});

