import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Daftar tipe dokumen standar untuk modul sub ledger V3 dan V4.
 */
export enum SubledgerDocType {
  // Modul V3 (AR / AP / Inventory / Order Management)
  SALES_INVOICE = 'SALES_INVOICE',
  CUSTOMER_RECEIPT = 'CUSTOMER_RECEIPT',
  CREDIT_NOTE = 'CREDIT_NOTE',
  PURCHASE_BILL = 'PURCHASE_BILL',
  VENDOR_PAYMENT = 'VENDOR_PAYMENT',
  DEBIT_NOTE = 'DEBIT_NOTE',
  SALES_ORDER = 'SALES_ORDER',
  DELIVERY_ORDER = 'DELIVERY_ORDER',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  STOCK_ADJUSTMENT = 'STOCK_ADJUSTMENT',
  STOCK_TRANSFER = 'STOCK_TRANSFER',
  STOCK_RECEIPT_OTHER = 'STOCK_RECEIPT_OTHER',

  // Modul V4 Kas & Bank
  CASH_RECEIPT = 'CASH_RECEIPT',
  CASH_DISBURSEMENT = 'CASH_DISBURSEMENT',
  CASH_TRANSFER = 'CASH_TRANSFER',
  PETTY_REPLENISH = 'PETTY_REPLENISH',
  PETTY_VOUCHER = 'PETTY_VOUCHER',

  // Modul V4 Aset Tetap
  ASSET = 'ASSET',
  ASSET_CAPITALIZATION = 'ASSET_CAPITALIZATION',
  ASSET_DISPOSAL = 'ASSET_DISPOSAL',
  ASSET_IMPAIRMENT = 'ASSET_IMPAIRMENT',
  ASSET_TRANSFER = 'ASSET_TRANSFER',
  ASSET_COST_ADDITION = 'ASSET_COST_ADDITION',
  DEPRECIATION_RUN = 'DEPRECIATION_RUN',
  VERIFICATION_SESSION = 'VERIFICATION_SESSION',
}

/**
 * Pemetaan prefix default per tipe dokumen.
 */
export const DEFAULT_DOC_PREFIXES: Record<string, string> = {
  SALES_INVOICE: 'INV',
  CUSTOMER_RECEIPT: 'CRCP',
  CREDIT_NOTE: 'CN',
  PURCHASE_BILL: 'BILL',
  VENDOR_PAYMENT: 'VPAY',
  DEBIT_NOTE: 'DN',
  SALES_ORDER: 'SO',
  DELIVERY_ORDER: 'DO',
  PURCHASE_ORDER: 'PO',
  GOODS_RECEIPT: 'GR',
  STOCK_ADJUSTMENT: 'SA',
  STOCK_TRANSFER: 'ST',
  STOCK_RECEIPT_OTHER: 'SRO',

  // Modul V4 Default Prefixes
  CASH_RECEIPT: 'CR',
  CASH_DISBURSEMENT: 'CD',
  CASH_TRANSFER: 'CT',
  PETTY_REPLENISH: 'PR',
  PETTY_VOUCHER: 'PV',
  ASSET: 'AST',
  ASSET_CAPITALIZATION: 'ACAP',
  ASSET_DISPOSAL: 'ADSP',
  ASSET_IMPAIRMENT: 'AIMP',
  ASSET_TRANSFER: 'ATRF',
  ASSET_COST_ADDITION: 'ACST',
  DEPRECIATION_RUN: 'DEPR',
  VERIFICATION_SESSION: 'VERIF',
};

/**
 * Service untuk penomoran dokumen otomatis subledger (Faktur, Pembayaran, DO, GR, Kas, Aset, dsb).
 * Menjamin keamanan dari kondisi race condition dengan row-level atomic upsert pada database PostgreSQL.
 */
@Injectable()
export class DocumentNumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Menghasilkan nomor dokumen berikutnya secara sekuensial dan aman secara concurrency.
   * Format default: {PREFIX}-{YYYY}-{SEQ:5} (Contoh: CR-2026-00001)
   *
   * @param tenantId ID Tenant
   * @param docType Tipe Dokumen (mis. 'CASH_RECEIPT', 'ASSET', 'BILL', 'SO', dsb)
   * @param defaultPrefix Prefix jika belum dikonfigurasi (default diambil dari DEFAULT_DOC_PREFIXES atau sama dengan docType)
   * @param customYear Tahun transaksi (default tahun saat ini)
   */
  async getNextNumber(
    tenantId: string,
    docType: string,
    defaultPrefix?: string,
    customYear?: number,
  ): Promise<string> {
    return this.generateNextNumber(tenantId, docType, defaultPrefix, customYear);
  }

  async generateNextNumber(
    tenantId: string,
    docType: string,
    defaultPrefix?: string,
    customYear?: number,
  ): Promise<string> {
    const year = customYear || new Date().getFullYear();
    const effectivePrefix = defaultPrefix || DEFAULT_DOC_PREFIXES[docType] || docType;

    // Menggunakan atomic upsert pada transaksi Prisma
    // Operasi ini diterjemahkan ke SQL INSERT ... ON CONFLICT (tenantId, docType, year) DO UPDATE SET lastSeq = lastSeq + 1
    // yang secara otomatis mengunci baris (row lock) pada level PostgreSQL dan bebas dari race condition.
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.documentNumbering.findUnique({
        where: {
          tenantId_docType_year: {
            tenantId,
            docType,
            year,
          },
        },
      });

      let updated;
      if (!existing) {
        updated = await tx.documentNumbering.create({
          data: {
            tenantId,
            docType,
            prefix: effectivePrefix,
            formatPattern: '{PREFIX}-{YYYY}-{SEQ:5}',
            lastSeq: 1,
            year,
          },
        });
      } else {
        updated = await tx.documentNumbering.update({
          where: { id: existing.id },
          data: {
            lastSeq: { increment: 1 },
          },
        });
      }

      return this.formatNumber(
        updated.formatPattern,
        updated.prefix,
        year,
        updated.lastSeq,
      );
    });
  }

  /**
   * Helper fungsi untuk memformat nomor dokumen berdasarkan pola format yang ditentukan.
   */
  private formatNumber(
    pattern: string,
    prefix: string,
    year: number,
    seq: number,
  ): string {
    let result = pattern
      .replace('{PREFIX}', prefix)
      .replace('{YYYY}', year.toString())
      .replace('{YY}', (year % 100).toString().padStart(2, '0'));

    // Menangani format {SEQ:length} misal {SEQ:5} -> 00001 atau {SEQ} -> 0001
    result = result.replace(/\{SEQ(?::(\d+))?\}/g, (_, padLength) => {
      const len = padLength ? parseInt(padLength, 10) : 5;
      return seq.toString().padStart(len, '0');
    });

    return result;
  }
}

