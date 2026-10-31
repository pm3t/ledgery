import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  HttpStatus,
  UseInterceptors,
  UseFilters,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../../api-v1/integration-log.interceptor';
import { V1ExceptionFilter } from '../../api-v1/v1-exception.filter';
import { resolveIdempotencyKey } from '../../common/utils/idempotency.util';
import { PurchaseOrderService } from '../services/purchase-order.service';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { SalesOrderService } from '../services/sales-order.service';
import { DeliveryOrderService } from '../services/delivery-order.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Controller('v1')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class V1OrderManagementController {
  constructor(
    private readonly poService: PurchaseOrderService,
    private readonly grService: GoodsReceiptService,
    private readonly soService: SalesOrderService,
    private readonly doService: DeliveryOrderService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /v1/ap/purchase-orders
   */
  @Post('ap/purchase-orders')
  async createPurchaseOrderV1(@Body() body: any, @Req() req: any) {
    const tenantId = req.apiKey?.tenantId;
    if (!tenantId) throw new BadRequestException('API Key tenant tidak terdeteksi.');

    const idempotencyKey = resolveIdempotencyKey(req, body);

    // Resolve partner jika memakai vendor_ref / partner_code
    let partnerId = body.partnerId;
    if (!partnerId && (body.vendor_ref || body.partner_code)) {
      const code = body.partner_code || body.vendor_ref;
      const partner = await this.prisma.businessPartner.findFirst({
        where: { tenantId, OR: [{ kode: code }, { externalRef: code }] },
      });
      if (partner) partnerId = partner.id;
    }

    if (!partnerId) {
      throw new BadRequestException('partnerId, partner_code, atau vendor_ref wajib diisi.');
    }

    // Resolve item codes pada lines jika ada
    const lines = await Promise.all(
      (body.lines || []).map(async (l: any) => {
        let itemId = l.itemId;
        if (!itemId && (l.item_code || l.kode_barang)) {
          const itm = await this.prisma.item.findFirst({
            where: { tenantId, kode: l.item_code || l.kode_barang },
          });
          if (itm) itemId = itm.id;
        }

        return {
          itemId,
          deskripsi: l.deskripsi || l.description || 'Item PO',
          qty: Number(l.qty || 1),
          harga: Number(l.harga || l.unit_price || 0),
          diskon: Number(l.diskon || 0),
          ppnRate: Number(l.ppnRate || l.tax_rate || 0),
          warehouseId: l.warehouseId,
          dimensions: l.dimensions,
        };
      }),
    );

    const dto = {
      tanggal: body.tanggal || new Date().toISOString().slice(0, 10),
      tanggalDiharapkan: body.tanggalDiharapkan,
      partnerId,
      mata_uang: body.mata_uang,
      kurs: body.kurs ? Number(body.kurs) : 1,
      status: body.status || OrderStatus.OPEN,
      catatan: body.catatan,
      externalRef: body.external_ref || body.externalRef,
      idempotencyKey,
      lines,
    };

    const res = await this.poService.create(tenantId, dto as any, { nama: 'API-V1' });
    return {
      status: HttpStatus.CREATED,
      data: res,
    };
  }

  /**
   * POST /v1/ap/goods-receipts
   */
  @Post('ap/goods-receipts')
  async createGoodsReceiptV1(@Body() body: any, @Req() req: any) {
    const tenantId = req.apiKey?.tenantId;
    if (!tenantId) throw new BadRequestException('API Key tenant tidak terdeteksi.');

    const idempotencyKey = resolveIdempotencyKey(req, body);

    // Resolve PO via po_ref atau po_number
    let poId = body.poId;
    if (!poId && (body.po_ref || body.po_number)) {
      const ref = body.po_ref || body.po_number;
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { tenantId, OR: [{ noDokumen: ref }, { externalRef: ref }] },
      });
      if (po) poId = po.id;
    }

    let partnerId = body.partnerId;
    if (!partnerId && (body.vendor_ref || body.partner_code)) {
      const code = body.partner_code || body.vendor_ref;
      const partner = await this.prisma.businessPartner.findFirst({
        where: { tenantId, OR: [{ kode: code }, { externalRef: code }] },
      });
      if (partner) partnerId = partner.id;
    }

    let warehouseId = body.warehouseId;
    if (!warehouseId && (body.warehouse_code || body.kode_gudang)) {
      const whCode = body.warehouse_code || body.kode_gudang;
      const wh = await this.prisma.warehouse.findFirst({
        where: { tenantId, kode: whCode },
      });
      if (wh) warehouseId = wh.id;
    }

    if (!partnerId) throw new BadRequestException('partnerId atau vendor_ref wajib diisi.');
    if (!warehouseId) throw new BadRequestException('warehouseId atau warehouse_code wajib diisi.');

    const lines = await Promise.all(
      (body.lines || []).map(async (l: any) => {
        let itemId = l.itemId;
        if (!itemId && (l.item_code || l.kode_barang)) {
          const itm = await this.prisma.item.findFirst({
            where: { tenantId, kode: l.item_code || l.kode_barang },
          });
          if (itm) itemId = itm.id;
        }

        return {
          poLineId: l.poLineId || l.po_line_id,
          itemId,
          deskripsi: l.deskripsi || l.description,
          qty: Number(l.qty || 1),
          biayaSatuan: Number(l.biayaSatuan || l.unit_cost || 0),
          dimensions: l.dimensions,
        };
      }),
    );

    const dto = {
      tanggal: body.tanggal || new Date().toISOString().slice(0, 10),
      poId,
      partnerId,
      warehouseId,
      catatan: body.catatan,
      externalRef: body.external_ref || body.externalRef,
      idempotencyKey,
      lines,
    };

    const res = await this.grService.create(tenantId, dto as any, { nama: 'API-V1' });

    // Jika diposting otomatis via flag auto_post
    if (body.auto_post) {
      const posted = await this.grService.post(tenantId, res.id, { nama: 'API-V1' });
      return { status: HttpStatus.CREATED, data: posted };
    }

    return {
      status: HttpStatus.CREATED,
      data: res,
    };
  }

  /**
   * POST /v1/ar/sales-orders
   */
  @Post('ar/sales-orders')
  async createSalesOrderV1(@Body() body: any, @Req() req: any) {
    const tenantId = req.apiKey?.tenantId;
    if (!tenantId) throw new BadRequestException('API Key tenant tidak terdeteksi.');

    const idempotencyKey = resolveIdempotencyKey(req, body);

    let partnerId = body.partnerId;
    if (!partnerId && (body.customer_ref || body.partner_code)) {
      const code = body.partner_code || body.customer_ref;
      const partner = await this.prisma.businessPartner.findFirst({
        where: { tenantId, OR: [{ kode: code }, { externalRef: code }] },
      });
      if (partner) partnerId = partner.id;
    }

    if (!partnerId) {
      throw new BadRequestException('partnerId, partner_code, atau customer_ref wajib diisi.');
    }

    const lines = await Promise.all(
      (body.lines || []).map(async (l: any) => {
        let itemId = l.itemId;
        if (!itemId && (l.item_code || l.kode_barang)) {
          const itm = await this.prisma.item.findFirst({
            where: { tenantId, kode: l.item_code || l.kode_barang },
          });
          if (itm) itemId = itm.id;
        }

        return {
          itemId,
          deskripsi: l.deskripsi || l.description || 'Item SO',
          qty: Number(l.qty || 1),
          harga: Number(l.harga || l.unit_price || 0),
          diskon: Number(l.diskon || 0),
          ppnRate: Number(l.ppnRate || l.tax_rate || 0),
          warehouseId: l.warehouseId,
          dimensions: l.dimensions,
        };
      }),
    );

    const dto = {
      tanggal: body.tanggal || new Date().toISOString().slice(0, 10),
      tanggalDiharapkan: body.tanggalDiharapkan,
      partnerId,
      mata_uang: body.mata_uang,
      kurs: body.kurs ? Number(body.kurs) : 1,
      status: body.status || OrderStatus.OPEN,
      catatan: body.catatan,
      externalRef: body.external_ref || body.externalRef,
      idempotencyKey,
      lines,
    };

    const res = await this.soService.create(tenantId, dto as any, { nama: 'API-V1' });
    return {
      status: HttpStatus.CREATED,
      data: res,
    };
  }

  /**
   * POST /v1/ar/delivery-orders
   */
  @Post('ar/delivery-orders')
  async createDeliveryOrderV1(@Body() body: any, @Req() req: any) {
    const tenantId = req.apiKey?.tenantId;
    if (!tenantId) throw new BadRequestException('API Key tenant tidak terdeteksi.');

    const idempotencyKey = resolveIdempotencyKey(req, body);

    let soId = body.soId;
    if (!soId && (body.so_ref || body.so_number)) {
      const ref = body.so_ref || body.so_number;
      const so = await this.prisma.salesOrder.findFirst({
        where: { tenantId, OR: [{ noDokumen: ref }, { externalRef: ref }] },
      });
      if (so) soId = so.id;
    }

    let partnerId = body.partnerId;
    if (!partnerId && (body.customer_ref || body.partner_code)) {
      const code = body.partner_code || body.customer_ref;
      const partner = await this.prisma.businessPartner.findFirst({
        where: { tenantId, OR: [{ kode: code }, { externalRef: code }] },
      });
      if (partner) partnerId = partner.id;
    }

    let warehouseId = body.warehouseId;
    if (!warehouseId && (body.warehouse_code || body.kode_gudang)) {
      const whCode = body.warehouse_code || body.kode_gudang;
      const wh = await this.prisma.warehouse.findFirst({
        where: { tenantId, kode: whCode },
      });
      if (wh) warehouseId = wh.id;
    }

    if (!partnerId) throw new BadRequestException('partnerId atau customer_ref wajib diisi.');
    if (!warehouseId) throw new BadRequestException('warehouseId atau warehouse_code wajib diisi.');

    const lines = await Promise.all(
      (body.lines || []).map(async (l: any) => {
        let itemId = l.itemId;
        if (!itemId && (l.item_code || l.kode_barang)) {
          const itm = await this.prisma.item.findFirst({
            where: { tenantId, kode: l.item_code || l.kode_barang },
          });
          if (itm) itemId = itm.id;
        }

        return {
          soLineId: l.soLineId || l.so_line_id,
          itemId,
          deskripsi: l.deskripsi || l.description,
          qty: Number(l.qty || 1),
          dimensions: l.dimensions,
        };
      }),
    );

    const dto = {
      tanggal: body.tanggal || new Date().toISOString().slice(0, 10),
      soId,
      partnerId,
      warehouseId,
      catatan: body.catatan,
      externalRef: body.external_ref || body.externalRef,
      idempotencyKey,
      lines,
    };

    const res = await this.doService.create(tenantId, dto as any, { nama: 'API-V1' });

    if (body.auto_post) {
      const posted = await this.doService.post(tenantId, res.id, { nama: 'API-V1' });
      return { status: HttpStatus.CREATED, data: posted };
    }

    return {
      status: HttpStatus.CREATED,
      data: res,
    };
  }

  /**
   * GET /v1/orders/:type/:id/status
   */
  @Get('orders/:type/:id/status')
  async getOrderStatusV1(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const tenantId = req.apiKey?.tenantId;
    if (!tenantId) throw new BadRequestException('API Key tenant tidak terdeteksi.');

    const upperType = type.toUpperCase();

    if (upperType === 'PO') {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { tenantId, OR: [{ id }, { noDokumen: id }, { externalRef: id }] },
        include: { lines: true },
      });
      if (!po) throw new NotFoundException('Pesanan Pembelian (PO) tidak ditemukan.');

      return {
        id: po.id,
        noDokumen: po.noDokumen,
        status: po.status,
        lines: po.lines.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          qtyDipesan: Number(l.qty),
          qtyDiterima: Number(l.qtyDiterima),
          qtyDitagih: Number(l.qtyDitagih),
          sisaBelumDiterima: Math.max(0, Number(l.qty) - Number(l.qtyDiterima)),
          sisaBelumDitagih: Math.max(0, Number(l.qty) - Number(l.qtyDitagih)),
        })),
      };
    }

    if (upperType === 'SO') {
      const so = await this.prisma.salesOrder.findFirst({
        where: { tenantId, OR: [{ id }, { noDokumen: id }, { externalRef: id }] },
        include: { lines: true },
      });
      if (!so) throw new NotFoundException('Pesanan Penjualan (SO) tidak ditemukan.');

      return {
        id: so.id,
        noDokumen: so.noDokumen,
        status: so.status,
        lines: so.lines.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          qtyDipesan: Number(l.qty),
          qtyDikirim: Number(l.qtyDikirim),
          qtyDitagih: Number(l.qtyDitagih),
          sisaBelumDikirim: Math.max(0, Number(l.qty) - Number(l.qtyDikirim)),
          sisaBelumDitagih: Math.max(0, Number(l.qty) - Number(l.qtyDitagih)),
        })),
      };
    }

    throw new BadRequestException('Tipe order hanya mendukung "po" atau "so".');
  }
}

