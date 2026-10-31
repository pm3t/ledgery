import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpStatus,
  UseInterceptors,
  UseFilters,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../api-v1/integration-log.interceptor';
import { V1ExceptionFilter } from '../api-v1/v1-exception.filter';
import { resolveIdempotencyKey } from '../common/utils/idempotency.util';
import { StockReceiptOtherService } from './services/stock-receipt-other.service';
import { ItemService } from './services/item.service';
import { WarehouseService } from './services/warehouse.service';
import { InventoryReportService } from './services/inventory-report.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('v1')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class V1InventoryController {
  constructor(
    private readonly receiptOtherService: StockReceiptOtherService,
    private readonly itemService: ItemService,
    private readonly warehouseService: WarehouseService,
    private readonly reportService: InventoryReportService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /v1/inventory/receipts
   * Penerimaan stok lainnya via API publik (contoh: hasil panen, sampling, retur non-faktur).
   * Mendukung idempotency_key dan external_ref.
   */
  @Post('inventory/receipts')
  async createAndPostV1Receipt(@Req() req: any, @Body() body: any) {
    const tenantId = req.tenantId;

    // 1. Resolusi Idempotency Key
    const headers = req?.headers || {};
    const headerKey =
      (headers['idempotency-key'] as string) ||
      (headers['Idempotency-Key'] as string);
    const resolvedKey = resolveIdempotencyKey(
      body.idempotency_key || body.idempotencyKey,
      headerKey,
    );

    // 2. Replay Check
    if (resolvedKey) {
      const existing = await this.prisma.stockReceiptOther.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: resolvedKey,
          },
        },
        include: { lines: { include: { item: true } }, warehouse: true, journal: true },
      });
      if (existing) {
        return {
          statusCode: HttpStatus.OK,
          isReplay: true,
          message: 'Penerimaan stok ditemukan dari request sebelumnya (Idempotent Replay)',
          data: existing,
        };
      }
    }

    // 3. Resolusi Gudang
    let warehouseId = body.warehouseId || body.warehouse_id;
    if (!warehouseId && (body.warehouseKode || body.warehouse_code)) {
      const kode = body.warehouseKode || body.warehouse_code;
      const wh = await this.prisma.warehouse.findUnique({
        where: { tenantId_kode: { tenantId, kode } },
      });
      if (wh) warehouseId = wh.id;
    }
    if (!warehouseId) {
      const defWh = await this.warehouseService.getOrCreateDefaultWarehouse(tenantId);
      warehouseId = defWh.id;
    }

    // 4. Resolusi Akun Lawan
    let akunLawanId = body.akunLawanId || body.contra_account_id;
    if (!akunLawanId && (body.kodeAkunLawan || body.contra_account_code)) {
      const kode = body.kodeAkunLawan || body.contra_account_code;
      const acc = await this.prisma.chartOfAccount.findUnique({
        where: { tenantId_kode_akun: { tenantId, kode_akun: kode } },
      });
      if (acc) akunLawanId = acc.id;
    }

    if (!akunLawanId) {
      throw new BadRequestException(
        'Akun lawan wajib disertakan (akunLawanId atau kodeAkunLawan).',
      );
    }

    // 5. Resolusi Baris
    const rawLines = body.lines || body.items || [];
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      throw new BadRequestException('Penerimaan stok harus memiliki minimal 1 baris barang.');
    }

    const lines = [];
    for (const l of rawLines) {
      let itemId = l.itemId || l.item_id;
      if (!itemId && (l.itemKode || l.item_code)) {
        const item = await this.prisma.item.findUnique({
          where: { tenantId_kode: { tenantId, kode: l.itemKode || l.item_code } },
        });
        if (item) itemId = item.id;
      }
      if (!itemId && (l.externalRef || l.external_ref)) {
        const item = await this.prisma.item.findUnique({
          where: { tenantId_externalRef: { tenantId, externalRef: l.externalRef || l.external_ref } },
        });
        if (item) itemId = item.id;
      }

      if (!itemId) {
        throw new BadRequestException(
          `Barang tidak valid pada baris: ${JSON.stringify(l)}. Sertakan itemId, itemKode, atau externalRef.`,
        );
      }

      lines.push({
        itemId,
        qty: Number(l.qty || l.quantity || 1),
        biayaSatuan: Number(l.biayaSatuan || l.cost || l.unit_cost || 0),
        catatan: l.catatan || l.notes || undefined,
      });
    }

    // 6. Buat Draft dan langsung Posting
    const draft = await this.receiptOtherService.create(
      tenantId,
      {
        tanggal: body.tanggal || body.date || new Date().toISOString().slice(0, 10),
        warehouseId,
        akunLawanId,
        catatan: body.catatan || body.notes || undefined,
        externalRef: body.externalRef || body.external_ref || undefined,
        idempotencyKey: resolvedKey,
        lines,
      },
      { nama: 'API V1 Client' },
    );

    const posted = await this.receiptOtherService.post(tenantId, draft.id, {
      nama: 'API V1 Client',
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Penerimaan stok lainnya berhasil diposting ke sub ledger dan GL',
      data: posted,
    };
  }

  /**
   * PUT /v1/items/:external_ref
   * Upsert data master barang berdasarkan external_ref.
   */
  @Put('items/:external_ref')
  async upsertV1Item(
    @Req() req: any,
    @Param('external_ref') externalRef: string,
    @Body() body: any,
  ) {
    const tenantId = req.tenantId;

    let akunPersediaanId = body.akunPersediaanId;
    if (!akunPersediaanId && body.kodeAkunPersediaan) {
      const acc = await this.prisma.chartOfAccount.findUnique({
        where: { tenantId_kode_akun: { tenantId, kode_akun: body.kodeAkunPersediaan } },
      });
      if (acc) akunPersediaanId = acc.id;
    }

    let akunHppId = body.akunHppId;
    if (!akunHppId && body.kodeAkunHpp) {
      const acc = await this.prisma.chartOfAccount.findUnique({
        where: { tenantId_kode_akun: { tenantId, kode_akun: body.kodeAkunHpp } },
      });
      if (acc) akunHppId = acc.id;
    }

    const item = await this.itemService.upsertByExternalRef(tenantId, externalRef, {
      kode: body.kode || body.code || externalRef,
      nama: body.nama || body.name,
      groupCode: body.groupCode || body.category,
      satuan: body.satuan || body.unit || 'PCS',
      tipe: body.tipe || 'STOK',
      akunPersediaanId,
      akunHppId,
      valuationMethod: body.valuationMethod,
      isActive: body.isActive !== undefined ? body.isActive : true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Data barang berhasil disimpan',
      data: item,
    };
  }

  /**
   * GET /v1/inventory/stock?item=&warehouse=
   * Mengambil posisi stok saat ini (on-hand, biaya rata-rata, nilai total).
   */
  @Get('inventory/stock')
  async getV1Stock(
    @Req() req: any,
    @Query('item') itemParam?: string,
    @Query('item_code') itemCode?: string,
    @Query('warehouse') warehouseParam?: string,
    @Query('warehouse_code') warehouseCode?: string,
  ) {
    const tenantId = req.tenantId;

    let warehouseId: string | undefined = undefined;
    const whSearch = warehouseParam || warehouseCode;
    if (whSearch) {
      const wh = await this.prisma.warehouse.findFirst({
        where: {
          tenantId,
          OR: [{ id: whSearch }, { kode: whSearch }],
        },
      });
      if (wh) warehouseId = wh.id;
    }

    const stock = await this.reportService.getCurrentStock(tenantId, {
      warehouseId,
      search: itemParam || itemCode,
    });

    return {
      statusCode: HttpStatus.OK,
      data: stock,
    };
  }
}

