import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MovingAverageStrategy } from './strategies/moving-average.strategy';
import { FifoStrategy } from './strategies/fifo.strategy';
import { ValuationStrategyFactory } from './strategies/valuation-strategy.factory';
import { ItemService } from './services/item.service';
import { WarehouseService } from './services/warehouse.service';
import { InventoryStockService } from './services/inventory-stock.service';
import { ConcreteInventoryIssueService } from './services/inventory-issue.service';
import { ConcreteInventoryReceiptService } from './services/inventory-receipt.service';
import { StockReceiptOtherService } from './services/stock-receipt-other.service';
import { StockAdjustmentService } from './services/stock-adjustment.service';
import { StockTransferService } from './services/stock-transfer.service';
import { InventoryReportService } from './services/inventory-report.service';
import { InventoryOpeningBalanceService } from './services/inventory-opening-balance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { SubledgerPostingService } from '../subledger/subledger-posting.service';
import { DocumentNumberingService } from '../subledger/document-numbering.service';

describe('Modul 15: Sub Ledger Inventory (Persediaan)', () => {
  let movingAverageStrategy: MovingAverageStrategy;
  let fifoStrategy: FifoStrategy;
  let valuationStrategyFactory: ValuationStrategyFactory;

  beforeEach(() => {
    movingAverageStrategy = new MovingAverageStrategy();
    fifoStrategy = new FifoStrategy();
    valuationStrategyFactory = new ValuationStrategyFactory(
      movingAverageStrategy,
      fifoStrategy,
    );
  });

  // ==============================================================
  // TEST 1: MOVING AVERAGE - URUTAN PENERIMAAN & PENGELUARAN CAMPURAN
  // ==============================================================
  it('1. Biaya rata-rata bergerak (Moving Average) dihitung dengan benar pada urutan transaksi campuran', async () => {
    // Simulasi database in-memory
    let balance: any = null;
    const movements: any[] = [];

    const mockTx: any = {
      stockBalance: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(balance)),
        upsert: jest.fn().mockImplementation(({ create, update }) => {
          balance = { ...(balance || create), ...update };
          return Promise.resolve(balance);
        }),
      },
      stockMovement: {
        create: jest.fn().mockImplementation(({ data }) => {
          const row = { id: `mov-${movements.length + 1}`, ...data };
          movements.push(row);
          return Promise.resolve(row);
        }),
      },
    };

    const tenantId = 'tenant-test';
    const itemId = 'item-avco';
    const warehouseId = 'wh-01';

    // Langkah 1: Masuk 10 unit @ Rp 10.000 = Rp 100.000
    // Saldo: 10 unit, Nilai: Rp 100.000, Biaya Rata-rata: Rp 10.000
    const res1 = await movingAverageStrategy.processReceipt(mockTx, {
      tenantId,
      itemId,
      warehouseId,
      qty: 10,
      nilaiMasuk: 100000,
      tanggal: new Date('2026-03-01'),
    });
    expect(res1.saldoQtyBaru).toBe(10);
    expect(res1.saldoNilaiBaru).toBe(100000);
    expect(res1.biayaRataRataBaru).toBe(10000);

    // Langkah 2: Masuk 10 unit @ Rp 20.000 = Rp 200.000
    // Saldo: 20 unit, Total Nilai: Rp 300.000, Biaya Rata-rata: Rp 300.000 / 20 = Rp 15.000
    const res2 = await movingAverageStrategy.processReceipt(mockTx, {
      tenantId,
      itemId,
      warehouseId,
      qty: 10,
      nilaiMasuk: 200000,
      tanggal: new Date('2026-03-02'),
    });
    expect(res2.saldoQtyBaru).toBe(20);
    expect(res2.saldoNilaiBaru).toBe(300000);
    expect(res2.biayaRataRataBaru).toBe(15000);

    // Langkah 3: Keluar 5 unit (HPP = 5 × Rp 15.000 = Rp 75.000)
    // Sisa Saldo: 15 unit, Nilai Sisa: Rp 225.000, Biaya Rata-rata tetap: Rp 15.000
    const res3 = await movingAverageStrategy.processIssue(mockTx, {
      tenantId,
      itemId,
      warehouseId,
      qty: 5,
      tanggal: new Date('2026-03-03'),
    });
    expect(res3.qtyKeluar).toBe(5);
    expect(res3.totalHpp).toBe(75000);
    expect(res3.saldoQtyBaru).toBe(15);
    expect(res3.saldoNilaiBaru).toBe(225000);

    // Langkah 4: Masuk lagi 5 unit @ Rp 12.000 = Rp 60.000
    // Total Nilai Baru = Rp 225.000 + Rp 60.000 = Rp 285.000
    // Total Qty Baru = 15 + 5 = 20 unit
    // Biaya Rata-rata Baru = Rp 285.000 / 20 = Rp 14.250
    const res4 = await movingAverageStrategy.processReceipt(mockTx, {
      tenantId,
      itemId,
      warehouseId,
      qty: 5,
      nilaiMasuk: 60000,
      tanggal: new Date('2026-03-04'),
    });
    expect(res4.saldoQtyBaru).toBe(20);
    expect(res4.saldoNilaiBaru).toBe(285000);
    expect(res4.biayaRataRataBaru).toBe(14250);
  });

  // ==============================================================
  // TEST 2: FIFO - KONSUMSI LAPISAN TERTUA & LINTAS LAPISAN
  // ==============================================================
  it('2. FIFO mengonsumsi lapisan tertua dan menghitung HPP akurat saat melintasi beberapa lapisan', async () => {
    let balance: any = null;
    const layers: any[] = [];
    const consumptions: any[] = [];
    const movements: any[] = [];

    const mockTx: any = {
      stockBalance: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(balance)),
        upsert: jest.fn().mockImplementation(({ update, create }) => {
          balance = { ...(balance || create), ...update };
          return Promise.resolve(balance);
        }),
      },
      stockCostLayer: {
        create: jest.fn().mockImplementation(({ data }) => {
          const row = { id: `layer-${layers.length + 1}`, ...data };
          layers.push(row);
          return Promise.resolve(row);
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            layers
              .filter((l) => Number(l.qtySisa) > 0)
              .sort((a, b) => new Date(a.tanggalMasuk).getTime() - new Date(b.tanggalMasuk).getTime()),
          );
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const l = layers.find((x) => x.id === where.id);
          if (l) Object.assign(l, data);
          return Promise.resolve(l);
        }),
      },
      stockLayerConsumption: {
        create: jest.fn().mockImplementation(({ data }) => {
          const row = { id: `cons-${consumptions.length + 1}`, ...data };
          consumptions.push(row);
          return Promise.resolve(row);
        }),
      },
      stockMovement: {
        create: jest.fn().mockImplementation(({ data }) => {
          const row = { id: `mov-${movements.length + 1}`, ...data };
          movements.push(row);
          return Promise.resolve(row);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const m = movements.find((x) => x.id === where.id);
          if (m) Object.assign(m, data);
          return Promise.resolve(m);
        }),
      },
    };

    const tenantId = 'tenant-test';
    const itemId = 'item-fifo';
    const warehouseId = 'wh-01';

    // Batch 1: Masuk 10 unit @ Rp 10.000 pada 1 Maret
    await fifoStrategy.processReceipt(mockTx, {
      tenantId,
      itemId,
      warehouseId,
      qty: 10,
      nilaiMasuk: 100000,
      tanggal: new Date('2026-03-01'),
    });

    // Batch 2: Masuk 20 unit @ Rp 12.000 pada 2 Maret
    await fifoStrategy.processReceipt(mockTx, {
      tenantId,
      itemId,
      warehouseId,
      qty: 20,
      nilaiMasuk: 240000,
      tanggal: new Date('2026-03-02'),
    });

    // Batch 3: Masuk 15 unit @ Rp 15.000 pada 3 Maret
    await fifoStrategy.processReceipt(mockTx, {
      tenantId,
      itemId,
      warehouseId,
      qty: 15,
      nilaiMasuk: 225000,
      tanggal: new Date('2026-03-03'),
    });

    expect(layers.length).toBe(3);

    // Pengeluaran 25 unit pada 4 Maret:
    // Harus menghabiskan Batch 1 (10 unit @ Rp 10.000 = Rp 100.000)
    // dan mengambil sebagian Batch 2 (15 unit @ Rp 12.000 = Rp 180.000)
    // Total HPP = Rp 100.000 + Rp 180.000 = Rp 280.000
    const issueRes = await fifoStrategy.processIssue(mockTx, {
      tenantId,
      itemId,
      warehouseId,
      qty: 25,
      tanggal: new Date('2026-03-04'),
    });

    expect(issueRes.totalHpp).toBe(280000);
    expect(issueRes.consumedLayers?.length).toBe(2);

    // Verifikasi konsumsi per lapisan
    expect(issueRes.consumedLayers?.[0].qty).toBe(10);
    expect(issueRes.consumedLayers?.[0].biayaSatuan).toBe(10000);
    expect(issueRes.consumedLayers?.[1].qty).toBe(15);
    expect(issueRes.consumedLayers?.[1].biayaSatuan).toBe(12000);

    // Sisa lapisan di memori
    expect(Number(layers[0].qtySisa)).toBe(0); // Batch 1 habis
    expect(Number(layers[1].qtySisa)).toBe(5); // Batch 2 sisa 5 unit (20 - 15)
    expect(Number(layers[2].qtySisa)).toBe(15); // Batch 3 utuh 15 unit
    expect(issueRes.saldoQtyBaru).toBe(20); // 5 + 15
  });

  // ==============================================================
  // TEST 3: FIFO - STOK NEGATIF SELALU DITOLAK
  // ==============================================================
  it('3. Stok negatif selalu ditolak untuk barang bervaluasi FIFO, apa pun settingnya', async () => {
    const mockTx: any = {
      stockCostLayer: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'layer-1', qtySisa: new Prisma.Decimal(5), biayaSatuan: new Prisma.Decimal(10000), tanggalMasuk: new Date() },
        ]),
      },
    };

    await expect(
      fifoStrategy.processIssue(mockTx, {
        tenantId: 't1',
        itemId: 'item-fifo',
        warehouseId: 'wh1',
        qty: 10, // Diminta 10, hanya ada 5
        tanggal: new Date(),
        allowNegativeStock: true, // Sekalipun true di setting tenant, FIFO wajib menolak!
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ==============================================================
  // TEST 4: MOVING AVERAGE - STOK NEGATIF SESUAI SETTING
  // ==============================================================
  it('4. Stok negatif ditolak atau diizinkan sesuai setting allowNegativeStock pada Moving Average', async () => {
    let balance: any = { qty: new Prisma.Decimal(3), nilai: new Prisma.Decimal(30000), biayaRataRata: new Prisma.Decimal(10000) };

    const mockTx: any = {
      stockBalance: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(balance)),
        upsert: jest.fn().mockImplementation(({ update }) => {
          balance = { ...balance, ...update };
          return Promise.resolve(balance);
        }),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 'mov-1' }),
      },
    };

    // Saat allowNegativeStock = false -> Wajib tolak jika minta 5 sedangkan stok hanya 3
    await expect(
      movingAverageStrategy.processIssue(mockTx, {
        tenantId: 't1',
        itemId: 'item-avco',
        warehouseId: 'wh1',
        qty: 5,
        tanggal: new Date(),
        allowNegativeStock: false,
      }),
    ).rejects.toThrow(BadRequestException);

    // Saat allowNegativeStock = true -> Diizinkan (qty saldo menjadi -2)
    const res = await movingAverageStrategy.processIssue(mockTx, {
      tenantId: 't1',
      itemId: 'item-avco',
      warehouseId: 'wh1',
      qty: 5,
      tanggal: new Date(),
      allowNegativeStock: true,
    });
    expect(res.saldoQtyBaru).toBe(-2);
  });

  // ==============================================================
  // TEST 5: REKALKULASI BACKDATED ENTRY (MOVING AVERAGE)
  // ==============================================================
  it('5. Rekalkulasi kronologis backdated menghasilkan saldo dan HPP yang konsisten', async () => {
    // Skenario:
    // 1. Masuk 10 @ 10.000 pada 10 Maret
    // 2. Keluar 5 unit pada 15 Maret
    // Kemudian user memasukkan transaksi masa lalu:
    // 3. (Backdated) Masuk 10 @ 20.000 pada 5 Maret!
    // Urutan rekalkulasi semestinya:
    // - 5 Maret: Masuk 10 @ 20.000 (saldo: 10 @ 20.000)
    // - 10 Maret: Masuk 10 @ 10.000 (total nilai 200rb + 100rb = 300rb, avg: 15.000)
    // - 15 Maret: Keluar 5 unit (HPP baru = 5 × 15.000 = 75.000, bukan 50.000!)
    const movements = [
      { id: 'm1', tanggal: new Date('2026-03-05'), qty: 10, nilai: 200000, biayaSatuan: 20000 },
      { id: 'm2', tanggal: new Date('2026-03-10'), qty: 10, nilai: 100000, biayaSatuan: 10000 },
      { id: 'm3', tanggal: new Date('2026-03-15'), qty: -5, nilai: 50000, biayaSatuan: 10000 },
    ];

    let updatedBalance: any = null;
    const mockTx: any = {
      stockMovement: {
        findMany: jest.fn().mockResolvedValue(movements),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const m = movements.find((x) => x.id === where.id);
          if (m) Object.assign(m, data);
          return Promise.resolve(m);
        }),
      },
      stockBalance: {
        upsert: jest.fn().mockImplementation(({ update, create }) => {
          updatedBalance = { ...(updatedBalance || create), ...update };
          return Promise.resolve(updatedBalance);
        }),
      },
    };

    const recalcRes = await movingAverageStrategy.recalculateHistory(
      mockTx,
      'tenant-test',
      'item-1',
      'wh-1',
    );

    // HPP lama = 50.000, HPP baru = 75.000 -> Selisih = +25.000
    expect(recalcRes.oldTotalHpp).toBe(50000);
    expect(recalcRes.newTotalHpp).toBe(75000);
    expect(recalcRes.selisihHpp).toBe(25000);
    // Sisa stok akhir = 15 unit
    expect(Number(updatedBalance.qty)).toBe(15);
    // Nilai akhir = (200.000 + 100.000) - 75.000 = 225.000
    expect(Number(updatedBalance.nilai)).toBe(225000);
    expect(Number(updatedBalance.biayaRataRata)).toBe(15000);
  });

  // ==============================================================
  // TEST 6: VALUATION STRATEGY FACTORY
  // ==============================================================
  it('6. ValuationStrategyFactory mengembalikan strategi yang tepat sesuai konfigurasi barang', () => {
    const maStrategy = valuationStrategyFactory.getStrategy('MOVING_AVERAGE');
    expect(maStrategy).toBeInstanceOf(MovingAverageStrategy);

    const fStrategy = valuationStrategyFactory.getStrategy('FIFO');
    expect(fStrategy).toBeInstanceOf(FifoStrategy);
  });

  // ==============================================================
  // TEST 7: ATURAN PERUBAHAN VALUATION METHOD
  // ==============================================================
  it('7. Perubahan metode valuasi ditolak bila barang sudah memiliki pergerakan dan stok != 0', async () => {
    const mockPrisma: any = {
      item: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          tenantId: 't1',
          valuationMethod: 'MOVING_AVERAGE',
          satuan: 'PCS',
        }),
      },
      stockMovement: {
        count: jest.fn().mockResolvedValue(5), // Ada 5 pergerakan
      },
      stockBalance: {
        findMany: jest.fn().mockResolvedValue([
          { warehouseId: 'wh1', qty: new Prisma.Decimal(10) }, // Stok masih 10 unit!
        ]),
      },
    };

    const itemService = new ItemService(mockPrisma);

    await expect(
      itemService.update('t1', 'item-1', {
        valuationMethod: 'FIFO',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

