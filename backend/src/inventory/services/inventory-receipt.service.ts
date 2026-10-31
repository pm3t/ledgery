import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryStockService } from './inventory-stock.service';
import { WarehouseService } from './warehouse.service';
import {
  IInventoryReceiptService,
  InventoryReceiptResult,
} from '../../accounts-payable/inventory-receipt.service';

/**
 * Implementasi Penuh InventoryReceiptService untuk Modul 14 (AP) dan Modul 16 (Goods Receipt)
 */
@Injectable()
export class ConcreteInventoryReceiptService
  implements IInventoryReceiptService
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: InventoryStockService,
    private readonly warehouseService: WarehouseService,
  ) {}

  async receiveStockForBill(
    tenantId: string,
    params: {
      billId: string;
      itemId: string;
      qty: number;
      nilaiMasuk: number;
      tanggal: Date;
      warehouseId?: string;
    },
  ): Promise<InventoryReceiptResult> {
    // Tentukan gudang tujuan (ambil default jika tidak dispesifikasikan pada baris)
    let warehouseId = params.warehouseId;
    if (!warehouseId) {
      const defaultWh = await this.warehouseService.getOrCreateDefaultWarehouse(
        tenantId,
      );
      warehouseId = defaultWh.id;
    }

    const result = await this.stockService.executeReceipt(tenantId, {
      tenantId,
      itemId: params.itemId,
      warehouseId,
      qty: params.qty,
      nilaiMasuk: params.nilaiMasuk,
      tanggal: params.tanggal,
      sourceDocType: 'PURCHASE_BILL',
      sourceDocId: params.billId,
      tipeMovement: 'RECEIPT_PURCHASE',
    });

    return {
      costAmount: result.nilaiMasuk,
    };
  }

  async returnStockForDebitNote(
    tenantId: string,
    params: {
      debitNoteId: string;
      itemId: string;
      qty: number;
      tanggal: Date;
      originalCost?: number;
      warehouseId?: string;
    },
  ): Promise<InventoryReceiptResult> {
    let warehouseId = params.warehouseId;
    if (!warehouseId) {
      const defaultWh = await this.warehouseService.getOrCreateDefaultWarehouse(
        tenantId,
      );
      warehouseId = defaultWh.id;
    }

    // Mengeluarkan stok fisik dari gudang karena retur pembelian ke vendor
    const result = await this.stockService.executeIssue(tenantId, {
      tenantId,
      itemId: params.itemId,
      warehouseId,
      qty: params.qty,
      tanggal: params.tanggal,
      sourceDocType: 'DEBIT_NOTE',
      sourceDocId: params.debitNoteId,
      tipeMovement: 'RETURN_PURCHASE',
    });

    return {
      costAmount: result.totalHpp,
    };
  }
}

