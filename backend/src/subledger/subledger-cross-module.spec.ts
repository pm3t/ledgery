import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SubledgerReconciliationService } from './subledger-reconciliation.service';
import { SubledgerSettingService } from './subledger-setting.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { TaxService } from '../tax/tax.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PostingSetupKey,
  ControlAccountType,
  PeriodStatus,
} from '@prisma/client';

describe('Subledger Cross-Module Integration Test Suite', () => {
  let reconService: SubledgerReconciliationService;
  let periodService: AccountingPeriodService;
  let taxService: TaxService;

  const mockTenantId = 'tenant-cross-module-1';

  // Akun Kontrol Mock
  const mockArControlAccount = {
    id: 'acc-ar-control',
    kode_akun: '1103.01',
    nama_akun: 'Piutang Usaha IDR',
    controlType: ControlAccountType.AR,
    kategori: 'ASET',
  };

  const mockApControlAccount = {
    id: 'acc-ap-control',
    kode_akun: '2101.01',
    nama_akun: 'Hutang Usaha IDR',
    controlType: ControlAccountType.AP,
    kategori: 'KEWAJIBAN',
  };

  const mockInventoryControlAccount = {
    id: 'acc-inv-control',
    kode_akun: '1105.01',
    nama_akun: 'Persediaan Barang Dagang',
    controlType: ControlAccountType.INVENTORY,
    kategori: 'ASET',
  };

  const mockGrIrControlAccount = {
    id: 'acc-grir-control',
    kode_akun: '2104.01',
    nama_akun: 'Barang Diterima Belum Ditagih',
    controlType: ControlAccountType.NONE,
    kategori: 'KEWAJIBAN',
  };

  // Mock Prisma Service
  let mockPrisma: any;
  let mockSettingService: any;

  beforeEach(async () => {
    mockSettingService = {
      getSettings: jest.fn().mockResolvedValue({
        tenantId: mockTenantId,
        arEnabled: true,
        apEnabled: true,
        inventoryEnabled: true,
        orderManagementEnabled: true,
        blockPeriodCloseOnRecon: true,
      }),
      getPostingSetups: jest.fn().mockResolvedValue([
        { key: PostingSetupKey.AR_CONTROL, account: mockArControlAccount },
        { key: PostingSetupKey.AP_CONTROL, account: mockApControlAccount },
        { key: PostingSetupKey.INVENTORY, account: mockInventoryControlAccount },
        { key: PostingSetupKey.GR_IR_CLEARING, account: mockGrIrControlAccount },
      ]),
    };

    mockPrisma = {
      subledgerSetting: {
        findUnique: jest.fn(),
      },
      chartOfAccount: {
        findUnique: jest.fn(),
      },
      journalEntry: {
        findMany: jest.fn(),
      },
      salesInvoice: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      creditNote: {
        findMany: jest.fn(),
      },
      customerReceipt: {
        findMany: jest.fn(),
      },
      purchaseBill: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      debitNote: {
        findMany: jest.fn(),
      },
      vendorPayment: {
        findMany: jest.fn(),
      },
      stockMovement: {
        findMany: jest.fn(),
      },
      goodsReceiptLine: {
        findMany: jest.fn(),
      },
      accountingPeriod: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      purchaseOrder: {
        count: jest.fn().mockResolvedValue(0),
      },
      salesOrder: {
        count: jest.fn().mockResolvedValue(0),
      },
      taxSetting: {
        findUnique: jest.fn(),
      },
      taxRecap: {
        create: jest.fn().mockImplementation((args: any) =>
          Promise.resolve({ id: 'recap-1', ...args.data }),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubledgerReconciliationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubledgerSettingService, useValue: mockSettingService },
      ],
    }).compile();

    reconService = module.get<SubledgerReconciliationService>(SubledgerReconciliationService);
    periodService = new AccountingPeriodService(mockPrisma as any, reconService as any);
    taxService = new TaxService(mockPrisma as any);
  });

  // =========================================================================
  // TEST SUITE 1: REKONSILIASI COCOK SEMPURNA (STATUS 'OK')
  // =========================================================================
  describe('1. Rekonsiliasi Sub Ledger vs Buku Besar Seimbang (Match)', () => {
    it('harus menghasilkan status OK dan selisih 0 saat saldo GL sama persis dengan saldo subledger', async () => {
      // Setup journalEntry.findMany untuk 4 akun kontrol
      // 1. AR GL: Debit 10.000.000
      // 2. AP GL: Kredit 5.000.000
      // 3. Inventory GL: Debit 8.000.000
      // 4. GR/IR GL: Kredit 2.000.000
      mockPrisma.journalEntry.findMany
        .mockResolvedValueOnce([
          {
            tipe: 'DEBIT',
            jumlah: 10000000,
            journal: {
              id: 'jrn-ar-1',
              no_voucher: 'JU-2026-001',
              tanggal: new Date('2026-10-10'),
              sumber_aplikasi: 'AR',
              sourceDocType: 'SALES_INVOICE',
              sourceDocId: 'inv-1',
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            tipe: 'KREDIT',
            jumlah: 5000000,
            journal: {
              id: 'jrn-ap-1',
              no_voucher: 'JU-2026-002',
              tanggal: new Date('2026-10-11'),
              sumber_aplikasi: 'AP',
              sourceDocType: 'PURCHASE_BILL',
              sourceDocId: 'bill-1',
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            tipe: 'DEBIT',
            jumlah: 8000000,
            journal: {
              id: 'jrn-inv-1',
              no_voucher: 'JU-2026-003',
              tanggal: new Date('2026-10-12'),
              sumber_aplikasi: 'INVENTORY',
              sourceDocType: 'STOCK_MOVEMENT',
              sourceDocId: 'mov-1',
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            tipe: 'KREDIT',
            jumlah: 2000000,
            journal: {
              id: 'jrn-grir-1',
              no_voucher: 'JU-2026-004',
              tanggal: new Date('2026-10-13'),
              sumber_aplikasi: 'ORDERS',
              sourceDocType: 'GOODS_RECEIPT',
              sourceDocId: 'gr-1',
            },
          },
        ]);

      // Subledger AR Docs
      mockPrisma.salesInvoice.findMany.mockResolvedValueOnce([
        {
          id: 'inv-1',
          noDokumen: 'INV/2026/10/001',
          journalId: 'jrn-ar-1',
          totalFungsional: 10000000,
          allocations: [],
        },
      ]);
      mockPrisma.creditNote.findMany.mockResolvedValueOnce([]);
      mockPrisma.customerReceipt.findMany.mockResolvedValueOnce([]);

      // Subledger AP Docs
      mockPrisma.purchaseBill.findMany.mockResolvedValueOnce([
        {
          id: 'bill-1',
          noDokumen: 'BILL/2026/10/001',
          journalId: 'jrn-ap-1',
          totalFungsional: 5000000,
          allocations: [],
        },
      ]);
      mockPrisma.debitNote.findMany.mockResolvedValueOnce([]);
      mockPrisma.vendorPayment.findMany.mockResolvedValueOnce([]);

      // Subledger Inventory: StockMovements
      mockPrisma.stockMovement.findMany.mockResolvedValueOnce([
        { id: 'mov-1', journalId: 'jrn-inv-1', nilai: 8000000 },
      ]);

      // Subledger GR/IR: GoodsReceiptLines
      mockPrisma.goodsReceiptLine.findMany.mockResolvedValueOnce([
        {
          id: 'grl-1',
          qty: 10,
          qtyDitagih: 0,
          biayaSatuan: 200000,
          receipt: {
            id: 'gr-1',
            noDokumen: 'GR-2026-001',
            tanggal: new Date('2026-10-13'),
            journalId: 'jrn-grir-1',
            partner: { nama: 'CV Pemasok Berkah' },
          },
          item: { kode: 'ITM-01', nama: 'Barang Uji' },
        },
      ]);

      const recon = await reconService.getReconciliation(mockTenantId, '2026-10-31');

      expect(recon.isFullyReconciled).toBe(true);
      expect(recon.totalSelisihAbsolut).toBe(0);
      expect(recon.accounts.ar.status).toBe('OK');
      expect(recon.accounts.ar.selisih).toBe(0);
      expect(recon.accounts.ap.status).toBe('OK');
      expect(recon.accounts.ap.selisih).toBe(0);
      expect(recon.accounts.inventory.status).toBe('OK');
      expect(recon.accounts.inventory.selisih).toBe(0);
      expect(recon.accounts.grIrClearing.status).toBe('OK');
      expect(recon.accounts.grIrClearing.selisih).toBe(0);
    });
  });

  // =========================================================================
  // TEST SUITE 2: DETEKSI SELISIH DARI JURNAL MENTAH (RAW GL JOURNAL)
  // =========================================================================
  describe('2. Deteksi Selisih Rekonsiliasi & Drill-Down', () => {
    it('harus mendeteksi status SELISIH dan menampilkan rincian jurnal liar saat ada jurnal langsung tanpa dokumen sumber', async () => {
      // Setup AR GL: Ada jurnal manual masuk ke AR_CONTROL sebesar 5.000.000 tanpa subledger doc
      mockPrisma.journalEntry.findMany
        .mockResolvedValueOnce([
          {
            tipe: 'DEBIT',
            jumlah: 10000000,
            journal: {
              id: 'jrn-ar-1',
              no_voucher: 'JU-2026-001',
              tanggal: new Date('2026-10-10'),
              sumber_aplikasi: 'AR',
              sourceDocType: 'SALES_INVOICE',
              sourceDocId: 'inv-1',
            },
          },
          {
            tipe: 'DEBIT',
            jumlah: 5000000,
            journal: {
              id: 'jrn-manual-1',
              no_voucher: 'JV-2026-999',
              tanggal: new Date('2026-10-15'),
              deskripsi: 'Jurnal manual masuk langsung ke akun kontrol',
              sumber_aplikasi: 'MANUAL',
              sourceDocType: null,
              sourceDocId: null,
            },
          },
        ])
        .mockResolvedValueOnce([]) // AP GL
        .mockResolvedValueOnce([]) // Inv GL
        .mockResolvedValueOnce([]); // GR/IR GL

      // AR Subledger hanya punya invoice 10.000.000 (sehingga GL 15.000.000 vs Subledger 10.000.000 -> Selisih 5.000.000)
      mockPrisma.salesInvoice.findMany.mockResolvedValueOnce([
        {
          id: 'inv-1',
          noDokumen: 'INV/2026/10/001',
          journalId: 'jrn-ar-1',
          totalFungsional: 10000000,
          allocations: [],
        },
      ]);
      mockPrisma.creditNote.findMany.mockResolvedValueOnce([]);
      mockPrisma.customerReceipt.findMany.mockResolvedValueOnce([]);

      mockPrisma.purchaseBill.findMany.mockResolvedValueOnce([]);
      mockPrisma.debitNote.findMany.mockResolvedValueOnce([]);
      mockPrisma.vendorPayment.findMany.mockResolvedValueOnce([]);
      mockPrisma.stockMovement.findMany.mockResolvedValueOnce([]);
      mockPrisma.goodsReceiptLine.findMany.mockResolvedValueOnce([]);

      const recon = await reconService.getReconciliation(mockTenantId, '2026-10-31');

      expect(recon.isFullyReconciled).toBe(false);
      expect(recon.accounts.ar.status).toBe('SELISIH');
      expect(recon.accounts.ar.selisih).toBe(5000000);
      expect(recon.accounts.ar.drillDown.summary.totalRawJournals).toBe(1);
      expect(recon.accounts.ar.drillDown.summary.totalRawJournalValue).toBe(5000000);
      expect(recon.accounts.ar.drillDown.rawOrUnlinkedJournals[0].noVoucher).toBe('JV-2026-999');
    });
  });

  // =========================================================================
  // TEST SUITE 3: INTEGRASI TUTUP PERIODE AKUNTANSI (CLOSE PERIOD)
  // =========================================================================
  describe('3. Integrasi Penutupan Periode Akuntansi', () => {
    const mockPeriod = {
      id: 'period-okt-2026',
      status: PeriodStatus.OPEN,
      tanggal_selesai: new Date('2026-10-31T23:59:59Z'),
      fiscalYear: { tenantId: mockTenantId },
    };

    it('harus memblokir penutupan periode jika ada selisih dan blockPeriodCloseOnRecon = true', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue(mockPeriod);
      mockPrisma.subledgerSetting.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        arEnabled: true,
        apEnabled: true,
        inventoryEnabled: true,
        orderManagementEnabled: true,
        blockPeriodCloseOnRecon: true,
      });

      jest.spyOn(reconService, 'getReconciliation').mockResolvedValueOnce({
        tanggal: '2026-10-31',
        isFullyReconciled: false,
        totalSelisihAbsolut: 5000000,
        setting: {
          arEnabled: true,
          apEnabled: true,
          inventoryEnabled: true,
          orderManagementEnabled: true,
          blockPeriodCloseOnRecon: true,
        },
        accounts: {
          ar: { status: 'SELISIH', selisih: 5000000 } as any,
          ap: { status: 'OK', selisih: 0 } as any,
          inventory: { status: 'OK', selisih: 0 } as any,
          grIrClearing: { status: 'OK', selisih: 0 } as any,
        },
      });

      await expect(periodService.closePeriod('period-okt-2026', 'user-acc-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('harus mengizinkan penutupan dengan warning jika ada selisih tetapi blockPeriodCloseOnRecon = false', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue(mockPeriod);
      mockPrisma.subledgerSetting.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        arEnabled: true,
        apEnabled: true,
        inventoryEnabled: true,
        orderManagementEnabled: true,
        blockPeriodCloseOnRecon: false, // Tidak memblokir
      });

      jest.spyOn(reconService, 'getReconciliation').mockResolvedValueOnce({
        tanggal: '2026-10-31',
        isFullyReconciled: false,
        totalSelisihAbsolut: 2500000,
        setting: {
          arEnabled: true,
          apEnabled: true,
          inventoryEnabled: true,
          orderManagementEnabled: true,
          blockPeriodCloseOnRecon: false,
        },
        accounts: {
          ar: { status: 'SELISIH', selisih: 2500000 } as any,
          ap: { status: 'OK', selisih: 0 } as any,
          inventory: { status: 'OK', selisih: 0 } as any,
          grIrClearing: { status: 'OK', selisih: 0 } as any,
        },
      });

      mockPrisma.accountingPeriod.update.mockResolvedValue({
        ...mockPeriod,
        status: PeriodStatus.CLOSED,
      });

      const res = await periodService.closePeriod('period-okt-2026', 'user-acc-1');
      expect(res.status).toBe(PeriodStatus.CLOSED);
      expect(res.warning).toBeDefined();
      expect(res.warning.message).toContain('Peringatan: Terdapat selisih rekonsiliasi');
    });

    it('harus mengizinkan penutupan normal tanpa cek rekonsiliasi jika modul subledger nonaktif (V2 kompatibilitas)', async () => {
      mockPrisma.accountingPeriod.findUnique.mockResolvedValue(mockPeriod);
      mockPrisma.subledgerSetting.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        arEnabled: false,
        apEnabled: false,
        inventoryEnabled: false,
        orderManagementEnabled: false,
      });

      mockPrisma.accountingPeriod.update.mockResolvedValue({
        ...mockPeriod,
        status: PeriodStatus.CLOSED,
      });

      const res = await periodService.closePeriod('period-okt-2026', 'user-acc-1');
      expect(res.status).toBe(PeriodStatus.CLOSED);
      expect(res.warning).toBeFalsy();
    });
  });

  // =========================================================================
  // TEST SUITE 4: INTEGRASI PERPAJAKAN (REKAP PPN SUBLEDGER DENGAN FAKTUR PAJAK)
  // =========================================================================
  describe('4. Integrasi Perpajakan PPN dengan Dokumen Sub Ledger', () => {
    it('harus menghitung PPN Keluaran & Masukan dari SalesInvoice dan PurchaseBill berstatus POSTED beserta nomor faktur pajak', async () => {
      mockPrisma.taxSetting.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        tarif_ppn: 11, // 11%
      });

      mockPrisma.subledgerSetting.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        arEnabled: true,
        apEnabled: true,
      });

      // Sales Invoice POSTED
      mockPrisma.salesInvoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          noDokumen: 'INV/2026/10/001',
          subtotal: 10000000,
          totalDiskon: 0,
          totalPpn: 1100000,
          tanggal: new Date('2026-10-10'),
          partner: { nama: 'PT Pembeli Sukses', npwp: '01.234.567.8-001.000' },
        },
      ]);
      mockPrisma.creditNote.findMany.mockResolvedValue([]);

      // Purchase Bill POSTED dengan nomor faktur pajak masukan
      mockPrisma.purchaseBill.findMany.mockResolvedValue([
        {
          id: 'bill-1',
          noDokumen: 'BILL/2026/10/005',
          noFakturVendor: 'INV-VEND-99',
          nomorFakturPajakMasukan: '010.001-26.12345678',
          subtotal: 6000000,
          totalDiskon: 0,
          totalPpn: 660000,
          tanggal: new Date('2026-10-15'),
          partner: { nama: 'CV Pemasok Berkah', npwp: '02.345.678.9-002.000' },
        },
      ]);
      mockPrisma.debitNote.findMany.mockResolvedValue([]);

      const ppnResult = await taxService.calculatePPN(mockTenantId, '2026-10');

      expect(ppnResult.metodeSumber).toBe('SUBLEDGER_DOCUMENTS');
      expect(ppnResult.ppnKeluaran.totalDpp).toBe(10000000);
      expect(ppnResult.ppnKeluaran.totalPpn).toBe(1100000);
      expect(ppnResult.ppnMasukan.totalDpp).toBe(6000000);
      expect(ppnResult.ppnMasukan.totalPpn).toBe(660000);
      expect(ppnResult.ppnKurangLebihBayar).toBe(440000); // 1.100.000 - 660.000
      expect(ppnResult.posisiPajak).toBe('KURANG_BAYAR');
      expect(ppnResult.ppnMasukan.dokumen[0].nomorFakturPajakMasukan).toBe('010.001-26.12345678');
    });
  });
});
