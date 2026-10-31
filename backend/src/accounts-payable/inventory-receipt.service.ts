import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConcreteInventoryReceiptService } from '../inventory/services/inventory-receipt.service';

export interface InventoryReceiptResult {
  costAmount: number;
}

export interface IInventoryReceiptService {
  /**
   * Menambah stok barang dan nilai persediaan saat Faktur Pembelian (Purchase Bill) diposting
   * (untuk baris bertipe STOCK yang tidak berasal dari Goods Receipt).
   */
  receiveStockForBill(
    tenantId: string,
    params: {
      billId: string;
      itemId: string;
      qty: number;
      nilaiMasuk: number;
      tanggal: Date;
      warehouseId?: string;
    },
  ): Promise<InventoryReceiptResult>;

  /**
   * Mengeluarkan stok barang saat Nota Debit (Debit Note / Retur Pembelian) diposting
   * jika flag returnStock = true.
   */
  returnStockForDebitNote(
    tenantId: string,
    params: {
      debitNoteId: string;
      itemId: string;
      qty: number;
      tanggal: Date;
      originalCost?: number;
      warehouseId?: string;
    },
  ): Promise<InventoryReceiptResult>;
}

/**
 * Default Inventory Receipt Service
 * Menggunakan ConcreteInventoryReceiptService jika modul Inventory aktif dan terinjeksi,
 * atau menggunakan validasi stub jika modul Inventory belum diaktifkan.
 */
@Injectable()
export class DefaultInventoryReceiptService implements IInventoryReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly concreteService?: ConcreteInventoryReceiptService,
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
    if (this.concreteService) {
      return this.concreteService.receiveStockForBill(tenantId, params);
    }

    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    if (!setting || !setting.inventoryEnabled) {
      throw new BadRequestException(
        `Modul Inventory belum aktif untuk tenant ini. Baris barang bertipe STOK (Item: ${params.itemId}) tidak dapat diproses. Aktifkan modul Inventory di Pengaturan Subledger terlebih dahulu.`,
      );
    }

    return {
      costAmount: params.nilaiMasuk,
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
    if (this.concreteService) {
      return this.concreteService.returnStockForDebitNote(tenantId, params);
    }

    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    if (!setting || !setting.inventoryEnabled) {
      throw new BadRequestException(
        `Modul Inventory belum aktif untuk tenant ini. Pengembalian stok fisik untuk barang bertipe STOK (Item: ${params.itemId}) tidak dapat diproses.`,
      );
    }

    return {
      costAmount: params.originalCost || 0,
    };
  }
}
