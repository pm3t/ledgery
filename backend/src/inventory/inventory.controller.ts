import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ItemService } from './services/item.service';
import { WarehouseService } from './services/warehouse.service';
import { StockReceiptOtherService } from './services/stock-receipt-other.service';
import { StockAdjustmentService } from './services/stock-adjustment.service';
import { StockTransferService } from './services/stock-transfer.service';
import { InventoryReportService } from './services/inventory-report.service';
import { InventoryOpeningBalanceService } from './services/inventory-opening-balance.service';
import { CreateItemDto, UpdateItemDto, ImportItemsDto } from './dto/item.dto';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  ImportWarehousesDto,
} from './dto/warehouse.dto';
import { CreateStockReceiptOtherDto } from './dto/stock-receipt-other.dto';
import { CreateStockAdjustmentDto } from './dto/stock-adjustment.dto';
import { CreateStockTransferDto } from './dto/stock-transfer.dto';
import { ImportStockOpeningBalanceDto } from './dto/inventory-opening-balance.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(
    private readonly itemService: ItemService,
    private readonly warehouseService: WarehouseService,
    private readonly receiptOtherService: StockReceiptOtherService,
    private readonly adjustmentService: StockAdjustmentService,
    private readonly transferService: StockTransferService,
    private readonly reportService: InventoryReportService,
    private readonly openingBalanceService: InventoryOpeningBalanceService,
  ) {}

  // ==========================================
  // MASTER BARANG (ITEMS)
  // ==========================================
  @Get('items/:tenantId')
  async getItems(
    @Param('tenantId') tenantId: string,
    @Query('tipe') tipe?: string,
    @Query('groupCode') groupCode?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const activeBool = isActive !== undefined ? isActive === 'true' : undefined;
    return this.itemService.findAll(tenantId, {
      tipe,
      groupCode,
      isActive: activeBool,
      search,
    });
  }

  @Get('items/:tenantId/:id')
  async getItem(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.itemService.findById(tenantId, id);
  }

  @Post('items/:tenantId')
  async createItem(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.itemService.create(tenantId, dto);
  }

  @Put('items/:tenantId/:id')
  async updateItem(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.itemService.update(tenantId, id, dto);
  }

  @Delete('items/:tenantId/:id')
  async deleteItem(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.itemService.delete(tenantId, id);
  }

  @Post('items/:tenantId/import')
  async importItems(
    @Param('tenantId') tenantId: string,
    @Body() dto: ImportItemsDto,
  ) {
    return this.itemService.importCsv(tenantId, dto);
  }

  // ==========================================
  // MASTER GUDANG (WAREHOUSES)
  // ==========================================
  @Get('warehouses/:tenantId')
  async getWarehouses(
    @Param('tenantId') tenantId: string,
    @Query('isActive') isActive?: string,
  ) {
    const activeBool = isActive !== undefined ? isActive === 'true' : undefined;
    return this.warehouseService.findAll(tenantId, activeBool);
  }

  @Get('warehouses/:tenantId/:id')
  async getWarehouse(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.warehouseService.findById(tenantId, id);
  }

  @Post('warehouses/:tenantId')
  async createWarehouse(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.warehouseService.create(tenantId, dto);
  }

  @Put('warehouses/:tenantId/:id')
  async updateWarehouse(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouseService.update(tenantId, id, dto);
  }

  @Delete('warehouses/:tenantId/:id')
  async deleteWarehouse(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.warehouseService.delete(tenantId, id);
  }

  @Post('warehouses/:tenantId/import')
  async importWarehouses(
    @Param('tenantId') tenantId: string,
    @Body() dto: ImportWarehousesDto,
  ) {
    return this.warehouseService.importCsv(tenantId, dto);
  }

  // ==========================================
  // PENERIMAAN LAINNYA (RECEIPT OTHER)
  // ==========================================
  @Get('receipt-other/:tenantId')
  async getReceiptOthers(
    @Param('tenantId') tenantId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.receiptOtherService.findAll(tenantId, { warehouseId, status });
  }

  @Get('receipt-other/:tenantId/:id')
  async getReceiptOther(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.receiptOtherService.findById(tenantId, id);
  }

  @Post('receipt-other/:tenantId')
  async createReceiptOther(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateStockReceiptOtherDto,
    @Request() req: any,
  ) {
    return this.receiptOtherService.create(tenantId, dto, req.user);
  }

  @Post('receipt-other/:tenantId/:id/post')
  async postReceiptOther(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.receiptOtherService.post(tenantId, id, req.user);
  }

  @Post('receipt-other/:tenantId/:id/void')
  async voidReceiptOther(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan: string,
    @Request() req: any,
  ) {
    return this.receiptOtherService.void(tenantId, id, alasan, req.user);
  }

  // ==========================================
  // PENYESUAIAN STOK / OPNAME (STOCK ADJUSTMENT)
  // ==========================================
  @Get('adjustments/:tenantId')
  async getAdjustments(
    @Param('tenantId') tenantId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.adjustmentService.findAll(tenantId, { warehouseId, status });
  }

  @Get('adjustments/:tenantId/:id')
  async getAdjustment(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.adjustmentService.findById(tenantId, id);
  }

  @Post('adjustments/:tenantId')
  async createAdjustment(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateStockAdjustmentDto,
    @Request() req: any,
  ) {
    return this.adjustmentService.create(tenantId, dto, req.user);
  }

  @Post('adjustments/:tenantId/:id/post')
  async postAdjustment(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.adjustmentService.post(tenantId, id, req.user);
  }

  @Post('adjustments/:tenantId/:id/void')
  async voidAdjustment(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan: string,
    @Request() req: any,
  ) {
    return this.adjustmentService.void(tenantId, id, alasan, req.user);
  }

  // ==========================================
  // TRANSFER ANTAR GUDANG (STOCK TRANSFER)
  // ==========================================
  @Get('transfers/:tenantId')
  async getTransfers(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: string,
  ) {
    return this.transferService.findAll(tenantId, { status });
  }

  @Get('transfers/:tenantId/:id')
  async getTransfer(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.transferService.findById(tenantId, id);
  }

  @Post('transfers/:tenantId')
  async createTransfer(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateStockTransferDto,
    @Request() req: any,
  ) {
    return this.transferService.create(tenantId, dto, req.user);
  }

  @Post('transfers/:tenantId/:id/post')
  async postTransfer(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.transferService.post(tenantId, id, req.user);
  }

  @Post('transfers/:tenantId/:id/void')
  async voidTransfer(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body('alasan') alasan: string,
    @Request() req: any,
  ) {
    return this.transferService.void(tenantId, id, alasan, req.user);
  }

  // ==========================================
  // SALDO AWAL PERSEDIAAN
  // ==========================================
  @Post('opening-balance/:tenantId/import')
  async importOpeningBalance(
    @Param('tenantId') tenantId: string,
    @Body() dto: ImportStockOpeningBalanceDto,
  ) {
    return this.openingBalanceService.importOpeningBalance(tenantId, dto);
  }

  // ==========================================
  // LAPORAN PERSEDIAAN
  // ==========================================
  @Get('reports/stock-card/:tenantId/:itemId/:warehouseId')
  async getStockCard(
    @Param('tenantId') tenantId: string,
    @Param('itemId') itemId: string,
    @Param('warehouseId') warehouseId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportService.getStockCard(
      tenantId,
      itemId,
      warehouseId,
      startDate,
      endDate,
    );
  }

  @Get('reports/fifo-layers/:tenantId')
  async getFifoLayers(
    @Param('tenantId') tenantId: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.reportService.getFifoCostLayersReport(
      tenantId,
      itemId,
      warehouseId,
    );
  }

  @Get('reports/current-stock/:tenantId')
  async getCurrentStock(
    @Param('tenantId') tenantId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
    @Query('groupCode') groupCode?: string,
  ) {
    return this.reportService.getCurrentStock(tenantId, {
      warehouseId,
      search,
      groupCode,
    });
  }

  @Get('reports/valuation/:tenantId')
  async getValuationReport(
    @Param('tenantId') tenantId: string,
    @Query('asOfDate') asOfDate?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.reportService.getInventoryValuationReport(
      tenantId,
      asOfDate,
      warehouseId,
    );
  }
}
