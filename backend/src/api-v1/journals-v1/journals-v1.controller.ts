import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  Res,
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { JournalService } from '../../journal/journal.service';
import { CreateJournalV1Dto } from './journals-v1.dto';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { JournalStatus } from '@prisma/client';
import { IntegrationLogInterceptor } from '../integration-log.interceptor';
import { V1ExceptionFilter } from '../v1-exception.filter';
import {
  resolveIdempotencyKey,
  payloadHash,
} from '../../common/utils/idempotency.util';

/**
 * Pemetaan status internal Ledgery ke spesifikasi status publik V1:
 * - POSTED   -> POSTED
 * - APPROVED -> POSTED
 * - PENDING  -> PENDING_REVIEW
 * - REJECTED -> REJECTED
 */
export function normalizeJournalStatus(
  status: JournalStatus | string,
): 'POSTED' | 'PENDING_REVIEW' | 'REJECTED' {
  switch (status) {
    case JournalStatus.POSTED:
    case JournalStatus.APPROVED:
      return 'POSTED';
    case JournalStatus.PENDING:
      return 'PENDING_REVIEW';
    case JournalStatus.REJECTED:
      return 'REJECTED';
    default:
      return 'PENDING_REVIEW';
  }
}

export function formatJournalResponse(journal: any, isReplay = false) {
  let totalDebit = 0;
  let totalKredit = 0;
  if (journal.entries && Array.isArray(journal.entries)) {
    for (const e of journal.entries) {
      const val = Number(e.jumlah_asli || e.jumlah);
      if (e.tipe === 'DEBIT') totalDebit += val;
      if (e.tipe === 'KREDIT') totalKredit += val;
    }
  }

  const tanggalStr =
    journal.tanggal instanceof Date
      ? journal.tanggal.toISOString().slice(0, 10)
      : String(journal.tanggal || '').slice(0, 10);

  const normalized = {
    ...journal,
    voucher_no: journal.no_voucher,
    status: normalizeJournalStatus(journal.status),
    tanggal: tanggalStr,
    total_debit: totalDebit,
    total_kredit: totalKredit,
    idempotency_key: journal.idempotency_key || null,
    idempotent_replay: Boolean(
      isReplay || journal.is_replay || journal.idempotent_replay,
    ),
  };

  return normalized;
}

@Controller('v1/journals')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
@UseFilters(V1ExceptionFilter)
export class JournalsV1Controller {
  constructor(private readonly journalService: JournalService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createExternalJournal(
    @Req() req: any,
    @Body() createDto: CreateJournalV1Dto,
    @Res({ passthrough: true }) res?: any,
  ) {
    const tenantId = req.tenantId;

    // Header Idempotency-Key (case-insensitive & safe check)
    const headers = req?.headers || {};
    const headerKey =
      (headers['idempotency-key'] as string) ||
      (headers['Idempotency-Key'] as string);

    // Resolusi key & validasi bentuk regex / panjang (throws VALIDATION_ERROR jika beda/invalid)
    const resolvedKey = resolveIdempotencyKey(
      createDto.idempotency_key,
      headerKey,
    );

    // Canonical payload hash (hanya jika idempotency_key aktif)
    let hash: string | undefined = undefined;
    if (resolvedKey) {
      hash = payloadHash(createDto as unknown as Record<string, unknown>);
    }

    const sumber = req.apiKeyLabel
      ? req.apiKeyLabel
      : createDto.sumber_aplikasi;

    // Map dari struktur DTO v1 (debit/kredit) ke struktur core service (tipe/jumlah)
    const mappedEntries = createDto.items.flatMap((item) => {
      const arr: any[] = [];
      if (item.debit > 0)
        arr.push({
          kode_akun: item.kode_akun,
          tipe: 'DEBIT',
          jumlah: item.debit,
          dimensions: item.dimensions,
        });
      if (item.kredit > 0)
        arr.push({
          kode_akun: item.kode_akun,
          tipe: 'KREDIT',
          jumlah: item.kredit,
          dimensions: item.dimensions,
        });
      return arr;
    });

    const journal: any = await this.journalService.createExternal(tenantId, {
      tanggal: createDto.tanggal,
      deskripsi: createDto.deskripsi || createDto.referensi,
      sumber_aplikasi: sumber,
      mata_uang: createDto.mata_uang,
      idempotency_key: resolvedKey || undefined,
      idempotency_payload_hash: hash,
      entries: mappedEntries,
    });

    const isReplay = Boolean(journal.is_replay || journal.idempotent_replay);
    if (isReplay && res?.status) {
      res.status(HttpStatus.OK);
    }

    const formatted = formatJournalResponse(journal, isReplay);

    return {
      statusCode: isReplay ? HttpStatus.OK : HttpStatus.CREATED,
      message: isReplay
        ? 'Jurnal sudah pernah dicatat sebelumnya (Idempotent Replay)'
        : 'Jurnal eksternal berhasil dicatat (API v1)',
      is_replay: isReplay,
      idempotent_replay: isReplay,
      data: formatted,
      ...formatted,
    };
  }

  @Get()
  async getExternalJournals(
    @Req() req: any,
    @Query('status') status?: JournalStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('idempotency_key') idempotencyKey?: string,
  ) {
    const tenantId = req.tenantId;

    if (idempotencyKey) {
      const journal = await this.journalService.findByIdOrIdentifier(
        tenantId,
        idempotencyKey,
      );
      const formatted = formatJournalResponse(journal);
      return {
        statusCode: HttpStatus.OK,
        message: 'Detail jurnal berhasil diambil via idempotency_key',
        data: formatted,
        ...formatted,
      };
    }

    const journals = await this.journalService.findByTenant(tenantId, {
      status,
      startDate,
      endDate,
      sumber: req.apiKeyLabel,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar jurnal berhasil diambil via API Key (API v1)',
      data: journals.map((j) => formatJournalResponse(j)),
    };
  }

  @Get(':identifier')
  async getJournalByIdentifier(
    @Req() req: any,
    @Param('identifier') identifier: string,
  ) {
    const tenantId = req.tenantId;
    const journal = await this.journalService.findByIdOrIdentifier(
      tenantId,
      identifier,
    );
    const formatted = formatJournalResponse(journal);

    return {
      statusCode: HttpStatus.OK,
      message: 'Detail jurnal berhasil diambil via API Key (API v1)',
      data: formatted,
      ...formatted,
    };
  }

  @Post(':identifier/reverse')
  @HttpCode(HttpStatus.CREATED)
  async reverseExternalJournal(
    @Req() req: any,
    @Param('identifier') identifier: string,
    @Body() dto: { tanggal?: string; alasan?: string },
  ) {
    const tenantId = req.tenantId;
    const journal = await this.journalService.reverseJournal(
      tenantId,
      identifier,
      dto,
    );
    const formatted = formatJournalResponse(journal);

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Jurnal reversal berhasil dibuat dengan status PENDING (API v1)',
      data: formatted,
      ...formatted,
    };
  }
}
