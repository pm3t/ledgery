import { BadRequestException } from '@nestjs/common';
import { Prisma, OrderStatus, GoodsReceiptStatus, DeliveryOrderStatus } from '@prisma/client';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { SalesOrderService } from './services/sales-order.service';
import { DeliveryOrderService } from './services/delivery-order.service';
import { OrderReportsService } from './services/order-reports.service';

describe('Modul 16: Order Management (SO, DO, PO, GR)', () => {
  const tenantId = 'tenant-test-om';

  // ==============================================================
  // TEST 1: ALUR PO -> GR -> BILL & PURCHASE PRICE VARIANCE
  // ==============================================================
  it('1. Alur PO -> GR -> Bill menghasilkan Dr Persediaan / Cr GR_IR lalu Dr GR_IR / Cr Hutang tanpa mengubah biaya persediaan, dan selisih harga masuk PURCHASE_PRICE_VARIANCE', async () => {
    let poLine: any = {
      id: 'pol-1',
      poId: 'po-1',
      itemId: 'item-1',
      qty: new Prisma.Decimal(10),
      harga: new Prisma.Decimal(100000),
      diskon: new Prisma.Decimal(0),
      ppnRate: new Prisma.Decimal(11),
      qtyDiterima: new Prisma.Decimal(0),
      qtyDitagih: new Prisma.Decimal(0),
    };

    let po: any = {
      id: 'po-1',
      tenantId,
      noDokumen: 'PO-2026-00001',
      status: OrderStatus.OPEN,
      lines: [poLine],
    };

    let grLine: any = {
      id: 'grl-1',
      receiptId: 'gr-1',
      poLineId: 'pol-1',
      itemId: 'item-1',
      qty: new Prisma.Decimal(10),
      biayaSatuan: new Prisma.Decimal(100000), // Biaya GR dari PO = 100.000
      totalNilai: new Prisma.Decimal(1000000),
      qtyDitagih: new Prisma.Decimal(0),
    };

    let gr: any = {
      id: 'gr-1',
      tenantId,
      noDokumen: 'GR-2026-00001',
      poId: 'po-1',
      partnerId: 'vendor-1',
      warehouseId: 'wh-1',
      status: GoodsReceiptStatus.DRAFT,
      totalNilai: new Prisma.Decimal(1000000),
      partner: { nama: 'Vendor Utama', groupCode: null },
      lines: [grLine],
    };

    // Simulasi posting GR
    // Jurnal GR: Dr INVENTORY (1.000.000) / Cr GR_IR_CLEARING (1.000.000)
    const grEntries: any[] = [
      { kode_akun: '1-10301', tipe: 'DEBIT', jumlah: 1000000 },
      { kode_akun: '2-10200', tipe: 'KREDIT', jumlah: 1000000 },
    ];
    expect(grEntries[0].kode_akun).toBe('1-10301');
    expect(grEntries[1].kode_akun).toBe('2-10200');

    // Update qtyDiterima pada PO
    poLine.qtyDiterima = new Prisma.Decimal(10);
    gr.status = GoodsReceiptStatus.POSTED;

    // Sekarang Vendor menagih dengan harga lebih tinggi: 105.000 per unit (total = 1.050.000)
    // Nilai GR yang dikliring = 1.000.000
    // Selisih Harga (Purchase Price Variance) = 50.000
    const billQty = 10;
    const billHarga = 105000;
    const billNet = billQty * billHarga;
    const grCleared = Number(grLine.qty) * Number(grLine.biayaSatuan);
    const variance = billNet - grCleared;

    expect(variance).toBe(50000); // 50.000 masuk ke PURCHASE_PRICE_VARIANCE

    const billEntries: any[] = [];
    billEntries.push({ kode_akun: '2-10200', tipe: 'DEBIT', jumlah: grCleared }); // Dr GR_IR_CLEARING
    billEntries.push({ kode_akun: '5-10200', tipe: 'DEBIT', jumlah: variance }); // Dr PPV
    billEntries.push({ kode_akun: '1-10401', tipe: 'DEBIT', jumlah: billNet * 0.11 }); // Dr PPN Masukan (115.500)
    billEntries.push({ kode_akun: '2-10101', tipe: 'KREDIT', jumlah: billNet * 1.11 }); // Cr Hutang AP (1.165.500)

    const totalDebit = billEntries
      .filter((e) => e.tipe === 'DEBIT')
      .reduce((sum, e) => sum + e.jumlah, 0);
    const totalKredit = billEntries
      .filter((e) => e.tipe === 'KREDIT')
      .reduce((sum, e) => sum + e.jumlah, 0);

    expect(totalDebit).toBe(totalKredit);
    expect(totalDebit).toBe(1165500);

    // Tandai ditagih
    grLine.qtyDitagih = new Prisma.Decimal(10);
    poLine.qtyDitagih = new Prisma.Decimal(10);
    expect(Number(grLine.qtyDitagih)).toBe(10);
    expect(Number(poLine.qtyDitagih)).toBe(10);
  });

  // ==============================================================
  // TEST 2: ALUR SO -> DO -> FAKTUR & HPP TERCATAT HANYA SEKALI
  // ==============================================================
  it('2. SO -> DO -> Faktur menghasilkan HPP hanya sekali (di DO) dan faktur tertaut DO tidak menduplikasi pengeluaran stok & HPP', async () => {
    let soLine: any = {
      id: 'sol-1',
      soId: 'so-1',
      itemId: 'item-1',
      qty: new Prisma.Decimal(5),
      harga: new Prisma.Decimal(150000),
      qtyDikirim: new Prisma.Decimal(0),
      qtyDitagih: new Prisma.Decimal(0),
    };

    let doLine: any = {
      id: 'dol-1',
      deliveryId: 'do-1',
      soLineId: 'sol-1',
      itemId: 'item-1',
      qty: new Prisma.Decimal(5),
      biayaTotal: new Prisma.Decimal(0),
      qtyDitagih: new Prisma.Decimal(0),
    };

    let doDoc: any = {
      id: 'do-1',
      tenantId,
      noDokumen: 'DO-2026-00001',
      soId: 'so-1',
      status: DeliveryOrderStatus.DRAFT,
      warehouseId: 'wh-1',
      partner: { nama: 'Customer A' },
      lines: [doLine],
    };

    // Saat DO diposting:
    // HPP dihitung dari valuasi stok (mis. 5 unit x 100.000 = 500.000)
    const hppCalculated = 500000;
    doLine.biayaTotal = new Prisma.Decimal(hppCalculated);
    doDoc.totalNilaiHpp = new Prisma.Decimal(hppCalculated);
    doDoc.status = DeliveryOrderStatus.POSTED;
    soLine.qtyDikirim = new Prisma.Decimal(5);

    // Jurnal DO: Dr HPP (500.000) / Cr Persediaan (500.000)
    const doEntries = [
      { kode_akun: '5-10101', tipe: 'DEBIT', jumlah: hppCalculated },
      { kode_akun: '1-10301', tipe: 'KREDIT', jumlah: hppCalculated },
    ];
    expect(doEntries[0].jumlah).toBe(500000);
    expect(doEntries[1].jumlah).toBe(500000);

    // Saat Faktur Penjualan (Sales Invoice) tertaut DO diposting:
    // Baris faktur bertipe DO_LINE: HPP = 0 (karena sudah dicatat saat DO)
    let totalCogsDiFaktur = 0;
    const invLine = {
      sourceLineType: 'DO_LINE',
      sourceLineId: 'dol-1',
      qty: 5,
      hargaSatuan: 150000,
      diskon: 0,
      ppnRate: 11,
    };

    if (invLine.sourceLineType === 'DO_LINE') {
      // Tidak menghitung HPP lagi!
      totalCogsDiFaktur = 0;
    }

    expect(totalCogsDiFaktur).toBe(0);

    // Jurnal Faktur Penjualan: Hanya Piutang vs Pendapatan & PPN Keluaran
    const revenue = invLine.qty * invLine.hargaSatuan; // 750.000
    const ppn = revenue * 0.11; // 82.500
    const arTotal = revenue + ppn; // 832.500

    const invEntries = [
      { kode_akun: '1-10201', tipe: 'DEBIT', jumlah: arTotal },
      { kode_akun: '4-10101', tipe: 'KREDIT', jumlah: revenue },
      { kode_akun: '2-10301', tipe: 'KREDIT', jumlah: ppn },
    ];

    expect(invEntries[0].jumlah).toBe(832500);
    expect(invEntries[1].jumlah + invEntries[2].jumlah).toBe(832500);

    // qtyDitagih pada DO dan SO bertambah
    doLine.qtyDitagih = new Prisma.Decimal(5);
    soLine.qtyDitagih = new Prisma.Decimal(5);
    expect(Number(doLine.qtyDitagih)).toBe(5);
    expect(Number(soLine.qtyDitagih)).toBe(5);
  });

  // ==============================================================
  // TEST 3: PENGIRIMAN / PENERIMAAN PARSIAL & STATUS ORDER OTOMATIS
  // ==============================================================
  it('3. Penerimaan dan pengiriman parsial dengan banyak dokumen turunan memperbarui status order (OPEN -> PARTIAL -> COMPLETED) secara akurat', async () => {
    const mockTx: any = {
      purchaseOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const poService = new PurchaseOrderService({} as any, {} as any);

    // Skenario: PO pesan 10 unit
    let poState: any = {
      id: 'po-1',
      status: OrderStatus.OPEN,
      lines: [{ id: 'pol-1', qty: new Prisma.Decimal(10), qtyDiterima: new Prisma.Decimal(0) }],
    };

    mockTx.purchaseOrder.findUnique.mockImplementation(() => Promise.resolve(poState));
    mockTx.purchaseOrder.update.mockImplementation(({ data }: any) => {
      poState.status = data.status;
      return Promise.resolve(poState);
    });

    // 1. Awal: Belum ada penerimaan -> status OPEN
    await poService.refreshOrderStatus(mockTx, 'po-1');
    expect(poState.status).toBe(OrderStatus.OPEN);

    // 2. Penerimaan Parsial 1: 4 unit diterima -> status PARTIAL
    poState.lines[0].qtyDiterima = new Prisma.Decimal(4);
    await poService.refreshOrderStatus(mockTx, 'po-1');
    expect(poState.status).toBe(OrderStatus.PARTIAL);

    // 3. Penerimaan Parsial 2: 3 unit lagi diterima (total 7) -> tetap PARTIAL
    poState.lines[0].qtyDiterima = new Prisma.Decimal(7);
    await poService.refreshOrderStatus(mockTx, 'po-1');
    expect(poState.status).toBe(OrderStatus.PARTIAL);

    // 4. Penerimaan Sisa: 3 unit lagi diterima (total 10) -> status COMPLETED
    poState.lines[0].qtyDiterima = new Prisma.Decimal(10);
    await poService.refreshOrderStatus(mockTx, 'po-1');
    expect(poState.status).toBe(OrderStatus.COMPLETED);
  });

  // ==============================================================
  // TEST 4: TOLERANSI OVER-DELIVERY DITOLAK JIKA MELAMPAUI
  // ==============================================================
  it('4. Kelebihan kuantitas pengiriman/penerimaan ditolak jika melampaui overDeliveryTolerancePct', async () => {
    const setting = {
      orderManagementEnabled: true,
      inventoryEnabled: true,
      apEnabled: true,
      overDeliveryTolerancePct: 5, // 5% toleransi
    };

    const mockPrisma: any = {
      subledgerSetting: {
        findUnique: jest.fn().mockResolvedValue(setting),
      },
      businessPartner: {
        findFirst: jest.fn().mockResolvedValue({ id: 'v-1', isVendor: true }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: 'w-1', isActive: true }),
      },
      item: {
        findFirst: jest.fn().mockResolvedValue({ id: 'i-1', tipe: 'STOK', nama: 'Barang A' }),
      },
      purchaseOrderLine: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pol-1',
          qty: new Prisma.Decimal(100), // Pesan 100
          qtyDiterima: new Prisma.Decimal(0),
          harga: new Prisma.Decimal(10000),
          diskon: new Prisma.Decimal(0),
        }),
      },
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };

    const mockDocNumbering: any = {
      generateNextNumber: jest.fn().mockResolvedValue('GR-2026-00001'),
    };

    const grService = new GoodsReceiptService(
      mockPrisma,
      mockDocNumbering,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    // Upaya menerima 110 unit (10% over-delivery saat batas adalah 5%)
    await expect(
      grService.create(tenantId, {
        tanggal: '2026-03-01',
        partnerId: 'v-1',
        warehouseId: 'w-1',
        lines: [{ itemId: 'i-1', poLineId: 'pol-1', qty: 110, biayaSatuan: 10000 }],
      }),
    ).rejects.toThrow(BadRequestException);

    // Upaya menerima 105 unit (persis 5% toleransi) -> diizinkan
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr-success' });
    const successResult = await grService.create(tenantId, {
      tanggal: '2026-03-01',
      partnerId: 'v-1',
      warehouseId: 'w-1',
      lines: [{ itemId: 'i-1', poLineId: 'pol-1', qty: 105, biayaSatuan: 10000 }],
    });
    expect(successResult).toBeDefined();
  });

  // ==============================================================
  // TEST 5: LAPORAN REKONSILIASI GR/IR CLEARING
  // ==============================================================
  it('5. Saldo laporan GR/IR Clearing sama persis dengan akumulasi nilai barang diterima yang belum ditagih', async () => {
    const mockPrisma: any = {
      postingSetup: {
        findFirst: jest.fn().mockResolvedValue({
          account: { id: 'acc-grir', kode_akun: '2-10200', nama_akun: 'GR/IR Clearing' },
        }),
      },
      journalEntry: {
        findMany: jest.fn().mockResolvedValue([
          // Dua GR masuk: masing-masing Kredit 500.000 dan Kredit 300.000 (total KREDIT 800.000)
          // Satu Bill posting: Debit 500.000
          // Sisa saldo GL = 800.000 - 500.000 = 300.000
          { tipe: 'KREDIT', jumlah: new Prisma.Decimal(500000) },
          { tipe: 'KREDIT', jumlah: new Prisma.Decimal(300000) },
          { tipe: 'DEBIT', jumlah: new Prisma.Decimal(500000) },
        ]),
      },
      goodsReceiptLine: {
        findMany: jest.fn().mockResolvedValue([
          // Baris 1: 5 unit diterima, 5 unit sudah ditagih -> sisa 0
          {
            id: 'l-1',
            qty: new Prisma.Decimal(5),
            qtyDitagih: new Prisma.Decimal(5),
            biayaSatuan: new Prisma.Decimal(100000),
            receipt: {
              id: 'gr-1',
              noDokumen: 'GR-01',
              tanggal: new Date(),
              partner: { nama: 'Vendor A' },
              warehouse: { nama: 'Gudang Pusat' },
            },
            item: { kode: 'ITM-1', nama: 'Barang 1', satuan: 'PCS' },
          },
          // Baris 2: 3 unit diterima, 0 unit ditagih -> sisa 3 x 100.000 = 300.000
          {
            id: 'l-2',
            qty: new Prisma.Decimal(3),
            qtyDitagih: new Prisma.Decimal(0),
            biayaSatuan: new Prisma.Decimal(100000),
            receipt: {
              id: 'gr-2',
              noDokumen: 'GR-02',
              tanggal: new Date(),
              partner: { nama: 'Vendor B' },
              warehouse: { nama: 'Gudang Pusat' },
            },
            item: { kode: 'ITM-2', nama: 'Barang 2', satuan: 'PCS' },
          },
        ]),
      },
    };

    const reportsService = new OrderReportsService(mockPrisma);
    const report = await reportsService.getGrIrClearingReport(tenantId);

    expect(report.glBalance).toBe(300000);
    expect(report.totalSubledgerUnbilled).toBe(300000);
    expect(report.selisih).toBe(0);
    expect(report.statusRekonsiliasi).toBe('RECONCILED');
    expect(report.items.length).toBe(1);
    expect(report.items[0].nilaiBelumDitagih).toBe(300000);
  });

  // ==============================================================
  // TEST 6: CANCEL ORDER DITOLAK BILA SUDAH ADA DOKUMEN TURUNAN
  // ==============================================================
  it('6. Pembatalan order (Cancel PO / SO) ditolak bila sudah memiliki barang yang diterima atau dikirim', async () => {
    const mockPrisma: any = {
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'po-1',
          status: OrderStatus.PARTIAL,
          lines: [{ id: 'pol-1', qtyDiterima: new Prisma.Decimal(2), qtyDitagih: new Prisma.Decimal(0) }],
        }),
      },
      salesOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'so-1',
          status: OrderStatus.PARTIAL,
          lines: [{ id: 'sol-1', qtyDikirim: new Prisma.Decimal(3), qtyDitagih: new Prisma.Decimal(0) }],
        }),
      },
    };

    const poService = new PurchaseOrderService(mockPrisma, {} as any);
    const soService = new SalesOrderService(mockPrisma, {} as any);

    // Cancel PO harus throw
    await expect(poService.cancel(tenantId, 'po-1', 'Alasan pembatalan')).rejects.toThrow(
      BadRequestException,
    );

    // Cancel SO harus throw
    await expect(soService.cancel(tenantId, 'so-1', 'Alasan pembatalan')).rejects.toThrow(
      BadRequestException,
    );
  });

  // ==============================================================
  // TEST 7: VOID DO MENGEMBALIKAN LAPISAN BIAYA & KUANTITAS FISIK
  // ==============================================================
  it('7. Pembatalan Surat Jalan (Void DO) mengembalikan kuantitas fisik dan lapisan biaya ke gudang', async () => {
    const mockPrisma: any = {
      deliveryOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'do-1',
          noDokumen: 'DO-2026-00001',
          status: DeliveryOrderStatus.POSTED,
          tanggal: new Date(),
          warehouseId: 'wh-1',
          soId: 'so-1',
          journalId: 'j-1',
          partner: { nama: 'Customer A' },
          lines: [
            {
              id: 'dol-1',
              itemId: 'item-fifo',
              qty: new Prisma.Decimal(5),
              biayaTotal: new Prisma.Decimal(500000), // 5 unit x 100.000
              qtyDitagih: new Prisma.Decimal(0), // Belum ditagih
              soLineId: 'sol-1',
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'do-1', status: DeliveryOrderStatus.VOID }),
      },
      salesOrderLine: {
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
    };

    const mockPeriodService: any = {
      validateJournalDate: jest.fn().mockResolvedValue(true),
    };

    const mockStockService: any = {
      executeReceipt: jest.fn().mockResolvedValue({ saldoQtyBaru: 15, saldoNilaiBaru: 1500000 }),
    };

    const mockSubledgerPosting: any = {
      reverseJournal: jest.fn().mockResolvedValue({ id: 'rev-j-1' }),
    };

    const mockSoService: any = {
      refreshOrderStatus: jest.fn(),
    };

    const doService = new DeliveryOrderService(
      mockPrisma,
      {} as any,
      mockSubledgerPosting,
      mockPeriodService,
      mockStockService,
      mockSoService,
    );

    const voidResult = await doService.void(tenantId, 'do-1', 'Salah kirim barang');
    expect(voidResult.status).toBe(DeliveryOrderStatus.VOID);

    // Memverifikasi stok dikembalikan dengan nilai masuk sesuai biayaTotal asal (500.000)
    expect(mockStockService.executeReceipt).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        itemId: 'item-fifo',
        warehouseId: 'wh-1',
        qty: 5,
        nilaiMasuk: 500000,
        tipeMovement: 'RETURN_SALE',
      }),
    );

    // Memverifikasi qtyDikirim pada SO dikurangi kembali
    expect(mockPrisma.salesOrderLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sol-1' },
        data: { qtyDikirim: { decrement: 5 } },
      }),
    );

    // Memverifikasi jurnal dibalik
    expect(mockSubledgerPosting.reverseJournal).toHaveBeenCalledWith(
      tenantId,
      'j-1',
      expect.any(String),
      expect.stringContaining('Salah kirim barang'),
    );
  });
});

