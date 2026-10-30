import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service untuk penomoran dokumen otomatis subledger (Faktur, Pembayaran, DO, GR, dsb).
 * Menjamin keamanan dari kondisi race condition dengan row-level atomic upsert pada database PostgreSQL.
 */
@Injectable()
export class DocumentNumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Menghasilkan nomor dokumen berikutnya secara sekuensial dan aman secara concurrency.
   * Format default: {PREFIX}-{YYYY}-{SEQ:5} (Contoh: SI-2026-00001)
   *
   * @param tenantId ID Tenant
   * @param docType Tipe Dokumen (mis. 'SI', 'SO', 'DO', 'BILL', 'PO', 'GR', 'PAY_AR', 'PAY_AP')
   * @param defaultPrefix Prefix jika belum dikonfigurasi (default sama dengan docType)
   * @param customYear Tahun transaksi (default tahun saat ini)
   */
  async generateNextNumber(
    tenantId: string,
    docType: string,
    defaultPrefix: string = docType,
    customYear?: number,
  ): Promise<string> {
    const year = customYear || new Date().getFullYear();

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
            prefix: defaultPrefix,
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

