import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PurchaseOrderService } from '../services/purchase-order.service';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { SalesOrderService } from '../services/sales-order.service';
import { DeliveryOrderService } from '../services/delivery-order.service';
import { OrderReportsService } from '../services/order-reports.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  CreateGoodsReceiptFromPoDto,
  CreateBillFromPoDto,
} from '../dto/purchase-order.dto';
import {
  CreateGoodsReceiptDto,
  UpdateGoodsReceiptDto,
  CreateBillFromGrDto,
} from '../dto/goods-receipt.dto';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
  CreateDeliveryOrderFromSoDto,
  CreateInvoiceFromSoDto,
} from '../dto/sales-order.dto';
import {
  CreateDeliveryOrderDto,
  UpdateDeliveryOrderDto,
  CreateInvoiceFromDoDto,
} from '../dto/delivery-order.dto';

@Controller('order-management')
@UseGuards(JwtAuthGuard)
export class OrderManagementController {
  constructor(
    private readonly poService: PurchaseOrderService,
    private readonly grService: GoodsReceiptService,
    private readonly soService: SalesOrderService,
    private readonly doService: DeliveryOrderService,
    private readonly reportsService: OrderReportsService,
  ) {}

  // ==========================================
  // 1. PURCHASE ORDERS (PO)
  // ==========================================

  @Get('purchase-orders/:tenantId')
  async getPurchaseOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('partnerId') partnerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.poService.findAll(tenantId, {
      status,
      partnerId,
      startDate,
      endDate,
      search,
    });
  }

  @Get('purchase-orders/:tenantId/:id')
  async getPurchaseOrder(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.poService.findById(tenantId, id);
  }

  @Post('purchase-orders/:tenantId')
  async createPurchaseOrder(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreatePurchaseOrderDto,
    @Request() req: any,
  ) {
    return this.poService.create(tenantId, dto, req.user);
  }

  @Put('purchase-orders/:tenantId/:id')
  async updatePurchaseOrder(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.poService.update(tenantId, id, dto);
  }

  @Post('purchase-orders/:tenantId/:id/open')
  async confirmOpenPo(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.poService.confirmOpen(tenantId, id);
  }

  @Post('purchase-orders/:tenantId/:id/cancel')
  async cancelPo(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
    @Body('alasan') alasan?: string,
  ) {
    return this.poService.cancel(tenantId, id, alasan, req.user);
  }

  @Post('purchase-orders/:tenantId/:id/close')
  async closePo(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
    @Body('catatan') catatan?: string,
  ) {
    return this.poService.forceClose(tenantId, id, catatan, req.user);
  }

  // ==========================================
  // 2. GOODS RECEIPTS (GR)
  // ==========================================

  @Get('goods-receipts/:tenantId')
  async getGoodsReceipts(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('poId') poId?: string,
    @Query('partnerId') partnerId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.grService.findAll(tenantId, {
      status,
      poId,
      partnerId,
      warehouseId,
      startDate,
      endDate,
      search,
    });
  }

  @Get('goods-receipts/:tenantId/:id')
  async getGoodsReceipt(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.grService.findById(tenantId, id);
  }

  @Post('goods-receipts/:tenantId')
  async createGoodsReceipt(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateGoodsReceiptDto,
    @Request() req: any,
  ) {
    return this.grService.create(tenantId, dto, req.user);
  }

  @Put('goods-receipts/:tenantId/:id')
  async updateGoodsReceipt(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateGoodsReceiptDto,
  ) {
    return this.grService.update(tenantId, id, dto);
  }

  @Post('goods-receipts/:tenantId/:id/post')
  async postGoodsReceipt(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.grService.post(tenantId, id, req.user);
  }

  @Post('goods-receipts/:tenantId/:id/void')
  async voidGoodsReceipt(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
    @Body('alasan') alasan?: string,
  ) {
    return this.grService.void(tenantId, id, alasan, req.user);
  }

  @Post('goods-receipts/:tenantId/:id/create-bill')
  async createBillFromGr(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateBillFromGrDto,
    @Request() req: any,
  ) {
    return this.grService.createBillFromGr(tenantId, id, dto, req.user);
  }

  // ==========================================
  // 3. SALES ORDERS (SO)
  // ==========================================

  @Get('sales-orders/:tenantId')
  async getSalesOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('partnerId') partnerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.soService.findAll(tenantId, {
      status,
      partnerId,
      startDate,
      endDate,
      search,
    });
  }

  @Get('sales-orders/:tenantId/:id')
  async getSalesOrder(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.soService.findById(tenantId, id);
  }

  @Get('stock-availability/:tenantId/:itemId')
  async getStockAvailability(
    @Param('tenantId') tenantId: string,
    @Param('itemId') itemId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.soService.getStockAvailability(tenantId, itemId, warehouseId);
  }

  @Post('sales-orders/:tenantId')
  async createSalesOrder(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateSalesOrderDto,
    @Request() req: any,
  ) {
    return this.soService.create(tenantId, dto, req.user);
  }

  @Put('sales-orders/:tenantId/:id')
  async updateSalesOrder(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderDto,
  ) {
    return this.soService.update(tenantId, id, dto);
  }

  @Post('sales-orders/:tenantId/:id/open')
  async confirmOpenSo(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.soService.confirmOpen(tenantId, id);
  }

  @Post('sales-orders/:tenantId/:id/cancel')
  async cancelSo(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
    @Body('alasan') alasan?: string,
  ) {
    return this.soService.cancel(tenantId, id, alasan, req.user);
  }

  @Post('sales-orders/:tenantId/:id/close')
  async closeSo(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
    @Body('catatan') catatan?: string,
  ) {
    return this.soService.forceClose(tenantId, id, catatan, req.user);
  }

  // ==========================================
  // 4. DELIVERY ORDERS (DO)
  // ==========================================

  @Get('delivery-orders/:tenantId')
  async getDeliveryOrders(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('soId') soId?: string,
    @Query('partnerId') partnerId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.doService.findAll(tenantId, {
      status,
      soId,
      partnerId,
      warehouseId,
      startDate,
      endDate,
      search,
    });
  }

  @Get('delivery-orders/:tenantId/:id')
  async getDeliveryOrder(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.doService.findById(tenantId, id);
  }

  @Post('delivery-orders/:tenantId')
  async createDeliveryOrder(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateDeliveryOrderDto,
    @Request() req: any,
  ) {
    return this.doService.create(tenantId, dto, req.user);
  }

  @Put('delivery-orders/:tenantId/:id')
  async updateDeliveryOrder(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryOrderDto,
  ) {
    return this.doService.update(tenantId, id, dto);
  }

  @Post('delivery-orders/:tenantId/:id/post')
  async postDeliveryOrder(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.doService.post(tenantId, id, req.user);
  }

  @Post('delivery-orders/:tenantId/:id/void')
  async voidDeliveryOrder(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
    @Body('alasan') alasan?: string,
  ) {
    return this.doService.void(tenantId, id, alasan, req.user);
  }

  @Post('delivery-orders/:tenantId/:id/create-invoice')
  async createInvoiceFromDo(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateInvoiceFromDoDto,
    @Request() req: any,
  ) {
    return this.doService.createInvoiceFromDo(tenantId, id, dto, req.user);
  }

  // ==========================================
  // 5. REPORTS
  // ==========================================

  @Get('reports/outstanding-orders/:tenantId')
  async getOutstandingOrders(
    @Param('tenantId') tenantId: string,
    @Query('type') type?: 'PO' | 'SO' | 'ALL',
    @Query('partnerId') partnerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getOutstandingOrdersReport(tenantId, {
      type,
      partnerId,
      startDate,
      endDate,
    });
  }

  @Get('reports/fulfillment/:tenantId')
  async getFulfillment(
    @Param('tenantId') tenantId: string,
    @Query('type') type?: 'PO' | 'SO' | 'ALL',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getOrderFulfillmentReport(tenantId, {
      type,
      startDate,
      endDate,
    });
  }

  @Get('reports/gr-ir-clearing/:tenantId')
  async getGrIrClearing(@Param('tenantId') tenantId: string) {
    return this.reportsService.getGrIrClearingReport(tenantId);
  }
}
