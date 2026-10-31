import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryStockService } from './inventory-stock.service';
import { WarehouseService } from './warehouse.service';
import {
  IInventoryIssueService,
  InventoryIssueResult,
} from '../../accounts-receivable/inventory-issue.service';

/**
 * Implementasi Penuh InventoryIssueService untuk Modul 13 (AR) dan Modul 16 (Delivery Order)
 */
@Injectable()
export class ConcreteInventoryIssueService implements IInventoryIssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: InventoryStockService,
    private readonly warehouseService: WarehouseService,
  ) {}

  async issueStockForInvoice(
    tenantId: string,
    params: {
      invoiceId: string;
      itemId: string;
      qty: number;
      tanggal: Date;
      warehouseId?: string;
    },
  ): Promise<InventoryIssueResult> {
    let warehouseId = params.warehouseId;
    if (!warehouseId) {
      const defaultWh = await this.warehouseService.getOrCreateDefaultWarehouse(
        tenantId,
      );
      warehouseId = defaultWh.id;
    }

    // Mengeluarkan stok fisik dan menghitung HPP aktual (Moving Average / FIFO)
    const result = await this.stockService.executeIssue(tenantId, {
      tenantId,
      itemId: params.itemId,
      warehouseId,
      qty: params.qty,
      tanggal: params.tanggal,
      sourceDocType: 'SALES_INVOICE',
      sourceDocId: params.invoiceId,
      tipeMovement: 'ISSUE_SALE',
    });

    return {
      cogsAmount: result.totalHpp,
    };
  }

  async returnStockForCreditNote(
    tenantId: string,
    params: {
      creditNoteId: string;
      itemId: string;
      qty: number;
      tanggal: Date;
      originalCost?: number;
      warehouseId?: string;
    },
  ): Promise<InventoryIssueResult> {
    let warehouseId = params.warehouseId;
    if (!warehouseId) {
      const defaultWh = await this.warehouseService.getOrCreateDefaultWarehouse(
        tenantId,
      );
      warehouseId = defaultWh.id;
    }

    // Mengembalikan stok fisik ke gudang dengan biaya perolehan asli
    const result = await this.stockService.executeReceipt(tenantId, {
      tenantId,
      itemId: params.itemId,
      warehouseId,
      qty: params.qty,
      nilaiMasuk: (params.originalCost || 0) * params.qty,
      tanggal: params.tanggal,
      sourceDocType: 'CREDIT_NOTE',
      sourceDocId: params.creditNoteId,
      tipeMovement: 'RETURN_SALE',
      biayaSatuanKhusus: params.originalCost,
    });

    return {
      cogsAmount: result.nilaiMasuk,
    };
  }
}

