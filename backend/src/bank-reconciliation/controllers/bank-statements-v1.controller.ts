import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UseFilters,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../../api-v1/integration-log.interceptor';
import { V1ExceptionFilter } from '../../api-v1/v1-exception.filter';
import { resolveIdempotencyKey } from '../../common/utils/idempotency.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseIndonesianNumber,
  parseFlexibleDate,
  generateDedupeHash,
} from '../utils/number-date-parser';
import { BankMatchStatus } from '@prisma/client';

/**
 * Controller API Publik V1 untuk Penerimaan Mutasi Rekening Koran dari Penyedia Data Eksternal
 * Dilindungi ApiKeyGuard, dicatat oleh IntegrationLog, mendukung dedupe dan idempotensi.
 */
@Controller('v1/cash/bank-statements')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class BankStatementsV1Controller {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async importExternalBankStatements(@Req() req: any, @Body() body: any) {
    const tenantId = req.tenantId;
    const idempotencyKey = resolveIdempotencyKey(req, body);

    const rekeningIdOrKode = body.rekening_id || body.rekening_kode || body.cashBankAccountId;
    if (!rekeningIdOrKode) {
      throw new BadRequestException("Field 'rekening_id' atau 'rekening_kode' wajib diisi.");
    }

    const account = await this.prisma.cashBankAccount.findFirst({
      where: {
        tenantId,
        OR: [{ id: rekeningIdOrKode }, { kode: rekeningIdOrKode }],
      },
    });
    if (!account) {
      throw new NotFoundException(`Rekening kas/bank '${rekeningIdOrKode}' tidak ditemukan.`);
    }

    const rawMutasi = body.mutasi || body.lines || [];
    if (!Array.isArray(rawMutasi) || rawMutasi.length === 0) {
      throw new BadRequestException("Array 'mutasi' wajib diisi dan minimal berisi 1 baris transaksi.");
    }

    const parsedLines: Array<{
      tanggal: Date;
      keterangan: string;
      referensi?: string;
      debit: number;
      kredit: number;
      saldo?: number;
      dedupeHash: string;
      externalRef?: string;
    }> = [];

    for (const m of rawMutasi) {
      const tanggal = parseFlexibleDate(m.tanggal);
      const keterangan = String(m.keterangan || '').trim();
      const referensi = m.referensi ? String(m.referensi).trim() : undefined;
      const debit = Math.abs(parseIndonesianNumber(m.debit || 0));
      const kredit = Math.abs(parseIndonesianNumber(m.kredit || 0));
      const saldo = m.saldo !== undefined && m.saldo !== null ? parseIndonesianNumber(m.saldo) : undefined;
      const externalRef = m.external_ref || m.externalRef;

      const hash = generateDedupeHash(
        account.id,
        tanggal,
        debit,
        kredit,
        keterangan,
        referensi,
        saldo,
      );

      parsedLines.push({
        tanggal,
        keterangan,
        referensi,
        debit,
        kredit,
        saldo,
        dedupeHash: hash,
        externalRef,
      });
    }

    // Deteksi dedupe
    const hashes = parsedLines.map((p) => p.dedupeHash);
    const existing = await this.prisma.bankStatementLine.findMany({
      where: {
        cashBankAccountId: account.id,
        dedupeHash: { in: hashes },
      },
      select: { dedupeHash: true },
    });
    const existingSet = new Set(existing.map((e) => e.dedupeHash));

    const newLines = parsedLines.filter((p) => !existingSet.has(p.dedupeHash));
    const skippedCount = parsedLines.length - newLines.length;

    if (newLines.length === 0) {
      return {
        status: 'DUPLICATE_SKIPPED',
        message: 'Seluruh baris mutasi sudah pernah diterima sebelumnya (duplikat).',
        total_diterima: parsedLines.length,
        jumlah_baru: 0,
        jumlah_dilewati: skippedCount,
      };
    }

    const sortedDates = [...newLines].sort((a, b) => a.tanggal.getTime() - b.tanggal.getTime());
    const periodeAwal = sortedDates[0].tanggal;
    const periodeAkhir = sortedDates[sortedDates.length - 1].tanggal;
    const saldoAwal = sortedDates[0].saldo !== undefined ? sortedDates[0].saldo : 0;
    const saldoAkhir = sortedDates[sortedDates.length - 1].saldo !== undefined ? sortedDates[sortedDates.length - 1].saldo : 0;

    const fileName = body.nama_file || `API_IMPORT_${new Date().toISOString().slice(0, 10)}.json`;

    const result = await this.prisma.$transaction(async (tx) => {
      const stmtImport = await tx.bankStatementImport.create({
        data: {
          tenantId,
          cashBankAccountId: account.id,
          namaFile: fileName,
          periodeAwal,
          periodeAkhir,
          saldoAwal,
          saldoAkhir,
          importedBy: 'API_INTEGRATION',
        },
      });

      await tx.bankStatementLine.createMany({
        data: newLines.map((l) => ({
          importId: stmtImport.id,
          tenantId,
          cashBankAccountId: account.id,
          tanggal: l.tanggal,
          keterangan: l.keterangan,
          referensi: l.referensi || null,
          debit: l.debit,
          kredit: l.kredit,
          saldo: l.saldo !== undefined ? l.saldo : null,
          dedupeHash: l.dedupeHash,
          matchStatus: BankMatchStatus.UNMATCHED,
          externalRef: l.externalRef || null,
        })),
      });

      return stmtImport;
    });

    return {
      status: 'SUCCESS',
      import_id: result.id,
      rekening_id: account.id,
      rekening_kode: account.kode,
      total_diterima: parsedLines.length,
      jumlah_baru: newLines.length,
      jumlah_dilewati: skippedCount,
      periode_awal: periodeAwal.toISOString().slice(0, 10),
      periode_akhir: periodeAkhir.toISOString().slice(0, 10),
      idempotency_key: idempotencyKey || null,
    };
  }
}

