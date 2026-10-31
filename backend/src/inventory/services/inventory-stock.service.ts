import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingPeriodService } from '../../accounting-period/accounting-period.service';
import { ValuationStrategyFactory } from '../strategies/valuation-strategy.factory';
import {
  ReceiptParams,
  ReceiptResult,
  IssueParams,
  IssueResult,
  RecalculateResult,
} from '../strategies/valuation.strategy.interface';
import { Prisma } from '@prisma/client';

@Injectable()
export class InventoryStockService {
  private readonly logger = new Logger(InventoryStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingPeriodService: AccountingPeriodService,
    private readonly strategyFactory: ValuationStrategyFactory,
  ) {}

  /**
   * Memastikan modul Inventory aktif pada tenant
   */
  async ensureInventoryEnabled(tenantId: string) {
    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    if (!setting || !setting.inventoryEnabled) {
      throw new BadRequestException(
        'Modul Inventory belum aktif untuk tenant ini. Aktifkan modul Inventory di menu Pengaturan Subledger terlebih dahulu.',
      );
    }

    return setting;
  }

  /**
   * Eksekusi penerimaan stok (Receipt) dengan proteksi row-lock dan penanganan transaksi backdated
   */
  async executeReceipt(
    tenantId: string,
    params: ReceiptParams,
  ): Promise<ReceiptResult> {
    const setting = await this.ensureInventoryEnabled(tenantId);

    // 1. Validasi periode akuntansi OPEN
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(params.tanggal),
    );

    // 2. Transaksi atomik dengan row lock
    return this.prisma.$transaction(
      async (tx) => {
        // Ambil item
        const item = await tx.item.findFirst({
          where: { id: params.itemId, tenantId },
        });

        if (!item) {
          throw new NotFoundException(`Barang ID "${params.itemId}" tidak ditemukan.`);
        }

        if (item.tipe !== 'STOK') {
          throw new BadRequestException(
            `Barang "${item.nama}" bertipe ${item.tipe}. Hanya barang bertipe STOK yang dapat diproses mutasi fisiknya.`,
          );
        }

        // Lock baris StockBalance jika sudah ada untuk serialisasi paralel
        await tx.$executeRaw`
          SELECT id FROM "StockBalance"
          WHERE "tenantId" = ${tenantId} AND "itemId" = ${params.itemId} AND "warehouseId" = ${params.warehouseId}
          FOR UPDATE
        `;

        const strategy = this.strategyFactory.getStrategy(item.valuationMethod);
        const result = await strategy.processReceipt(tx, params);

        // 3. Deteksi dan tangani Backdated Entry:
        // Jika ada pergerakan stok dengan tanggal di masa depan dari tanggal ini, jalankan rekalkulasi
        const laterMovementsCount = await tx.stockMovement.count({
          where: {
            tenantId,
            itemId: params.itemId,
            warehouseId: params.warehouseId,
            tanggal: { gt: params.tanggal },
          },
        });

        if (laterMovementsCount > 0) {
          this.logger.warn(
            `Penerimaan stok tanggal ${params.tanggal.toISOString()} untuk item ${item.kode} bersifat backdated (${laterMovementsCount} pergerakan sesudahnya ditemukan). Menjalankan rekalkulasi kronologis...`,
          );
          const recalc = await strategy.recalculateHistory(
            tx,
            tenantId,
            params.itemId,
            params.warehouseId,
          );
          this.logger.log(
            `Rekalkulasi selesai. Selisih HPP terdeteksi: ${recalc.selisihHpp}`,
          );
        }

        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 20000,
      },
    );
  }

  /**
   * Eksekusi pengeluaran stok (Issue) dengan proteksi row-lock dan penanganan transaksi backdated
   */
  async executeIssue(
    tenantId: string,
    params: IssueParams,
  ): Promise<IssueResult> {
    const setting = await this.ensureInventoryEnabled(tenantId);

    // 1. Validasi periode akuntansi OPEN
    await this.accountingPeriodService.validateJournalDate(
      tenantId,
      new Date(params.tanggal),
    );

    // 2. Transaksi atomik dengan row lock
    return this.prisma.$transaction(
      async (tx) => {
        // Ambil item
        const item = await tx.item.findFirst({
          where: { id: params.itemId, tenantId },
        });

        if (!item) {
          throw new NotFoundException(`Barang ID "${params.itemId}" tidak ditemukan.`);
        }

        if (item.tipe !== 'STOK') {
          throw new BadRequestException(
            `Barang "${item.nama}" bertipe ${item.tipe}. Hanya barang bertipe STOK yang dapat diproses mutasi fisiknya.`,
          );
        }

        // Lock baris StockBalance jika sudah ada untuk serialisasi paralel
        await tx.$executeRaw`
          SELECT id FROM "StockBalance"
          WHERE "tenantId" = ${tenantId} AND "itemId" = ${params.itemId} AND "warehouseId" = ${params.warehouseId}
          FOR UPDATE
        `;

        const allowNeg =
          params.allowNegativeStock !== undefined
            ? params.allowNegativeStock
            : setting.allowNegativeStock;

        const strategy = this.strategyFactory.getStrategy(item.valuationMethod);
        const result = await strategy.processIssue(tx, {
          ...params,
          allowNegativeStock: allowNeg,
        });

        // 3. Deteksi dan tangani Backdated Entry
        const laterMovementsCount = await tx.stockMovement.count({
          where: {
            tenantId,
            itemId: params.itemId,
            warehouseId: params.warehouseId,
            tanggal: { gt: params.tanggal },
          },
        });

        if (laterMovementsCount > 0) {
          this.logger.warn(
            `Pengeluaran stok tanggal ${params.tanggal.toISOString()} untuk item ${item.kode} bersifat backdated. Menjalankan rekalkulasi kronologis...`,
          );
          const recalc = await strategy.recalculateHistory(
            tx,
            tenantId,
            params.itemId,
            params.warehouseId,
          );
          this.logger.log(
            `Rekalkulasi selesai. Selisih HPP terdeteksi: ${recalc.selisihHpp}`,
          );
        }

        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 20000,
      },
    );
  }
}
