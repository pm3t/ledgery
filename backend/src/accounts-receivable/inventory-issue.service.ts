import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConcreteInventoryIssueService } from '../inventory/services/inventory-issue.service';

export interface InventoryIssueResult {
  cogsAmount: number;
}

export interface IInventoryIssueService {
  issueStockForInvoice(
    tenantId: string,
    params: {
      invoiceId: string;
      itemId: string;
      qty: number;
      tanggal: Date;
      warehouseId?: string;
    },
  ): Promise<InventoryIssueResult>;

  returnStockForCreditNote(
    tenantId: string,
    params: {
      creditNoteId: string;
      itemId: string;
      qty: number;
      tanggal: Date;
      originalCost?: number;
      warehouseId?: string;
    },
  ): Promise<InventoryIssueResult>;
}

/**
 * Default Inventory Issue Service
 * Menggunakan ConcreteInventoryIssueService jika modul Inventory aktif dan terinjeksi,
 * atau menggunakan validasi stub jika modul Inventory belum diaktifkan.
 */
@Injectable()
export class DefaultInventoryIssueService implements IInventoryIssueService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly concreteService?: ConcreteInventoryIssueService,
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
    if (this.concreteService) {
      return this.concreteService.issueStockForInvoice(tenantId, params);
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
      cogsAmount: 0,
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
    if (this.concreteService) {
      return this.concreteService.returnStockForCreditNote(tenantId, params);
    }

    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    if (!setting || !setting.inventoryEnabled) {
      throw new BadRequestException(
        `Modul Inventory belum aktif untuk tenant ini. Pengembalian barang stok pada Nota Kredit tidak dapat diproses.`,
      );
    }

    return {
      cogsAmount: params.originalCost || 0,
    };
  }
}
