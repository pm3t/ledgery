import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    },
  ): Promise<InventoryIssueResult>;
}

/**
 * Default Inventory Issue Service (Stub)
 * Modul 15 (Inventory) akan menggantikan atau mengimplementasikan logika lengkap kartu stok.
 * Jika modul Inventory belum aktif untuk tenant, baris bertipe STOK akan ditolak.
 */
@Injectable()
export class DefaultInventoryIssueService implements IInventoryIssueService {
  constructor(private readonly prisma: PrismaService) {}

  async issueStockForInvoice(
    tenantId: string,
    params: {
      invoiceId: string;
      itemId: string;
      qty: number;
      tanggal: Date;
    },
  ): Promise<InventoryIssueResult> {
    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    if (!setting || !setting.inventoryEnabled) {
      throw new BadRequestException(
        `Modul Inventory belum aktif untuk tenant ini. Baris barang bertipe STOK (Item: ${params.itemId}) tidak dapat diproses. Aktifkan modul Inventory di Pengaturan Subledger terlebih dahulu.`,
      );
    }

    // Stub: Pada Modul 15, fungsi ini akan menghitung HPP aktual (Moving Average / FIFO)
    // dan mengurangi stok fisik barang di gudang.
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
    },
  ): Promise<InventoryIssueResult> {
    const setting = await this.prisma.subledgerSetting.findUnique({
      where: { tenantId },
    });

    if (!setting || !setting.inventoryEnabled) {
      throw new BadRequestException(
        `Modul Inventory belum aktif untuk tenant ini. Pengembalian barang stok pada Nota Kredit tidak dapat diproses.`,
      );
    }

    // Stub: Pada Modul 15, fungsi ini akan menambah stok fisik barang kembali ke gudang
    return {
      cogsAmount: params.originalCost || 0,
    };
  }
}

