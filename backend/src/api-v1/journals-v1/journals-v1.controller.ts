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
} from '@nestjs/common';
import { JournalService } from '../../journal/journal.service';
import { CreateJournalV1Dto } from './journals-v1.dto';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { JournalStatus } from '@prisma/client';
import { IntegrationLogInterceptor } from '../integration-log.interceptor';

/**
 * KEBIJAKAN API VERSIONING (v1)
 * 
 * Modul ini menangani endpoint publik (diakses via API Key) untuk versi 1 (v1).
 * Setiap perubahan struktur payload (DTO) yang bersifat *breaking change* 
 * WAJIB dirilis sebagai versi API baru (misal: v2, v3, dst) dengan membuat
 * direktori/modul baru.
 * 
 * Versi lama (v1) INI TETAP HARUS DIDUKUNG (backward compatible) hingga
 * seluruh aplikasi klien (Rekan, DigiSale, dsb) selesai bermigrasi ke versi terbaru.
 */
@Controller('v1/journals')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IntegrationLogInterceptor)
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
    const sumber = req.apiKeyLabel ? req.apiKeyLabel : createDto.sumber_aplikasi;
    
    // Map dari struktur DTO v1 (debit/kredit) ke struktur core service (tipe/jumlah)
    const mappedEntries = createDto.items.flatMap(item => {
      const arr: any[] = [];
      if (item.debit > 0) arr.push({ kode_akun: item.kode_akun, tipe: 'DEBIT', jumlah: item.debit, dimensions: item.dimensions });
      if (item.kredit > 0) arr.push({ kode_akun: item.kode_akun, tipe: 'KREDIT', jumlah: item.kredit, dimensions: item.dimensions });
      return arr;
    });

    const journal: any = await this.journalService.createExternal(tenantId, {
      tanggal: createDto.tanggal,
      deskripsi: createDto.deskripsi || createDto.referensi,
      sumber_aplikasi: sumber,
      mata_uang: createDto.mata_uang,
      idempotency_key: createDto.idempotency_key,
      entries: mappedEntries,
    });
    
    const isReplay = Boolean(journal.is_replay);
    if (isReplay && res?.status) {
      res.status(HttpStatus.OK);
    }

    return {
      statusCode: isReplay ? HttpStatus.OK : HttpStatus.CREATED,
      message: isReplay
        ? 'Jurnal sudah pernah dicatat sebelumnya (Idempotent Replay)'
        : 'Jurnal eksternal berhasil dicatat (API v1)',
      is_replay: isReplay,
      data: journal,
    };
  }

  @Get()
  async getExternalJournals(
    @Req() req: any,
    @Query('status') status?: JournalStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.tenantId;
    const journals = await this.journalService.findByTenant(tenantId, { status, startDate, endDate, sumber: req.apiKeyLabel });
    
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar jurnal berhasil diambil via API Key (API v1)',
      data: journals,
    };
  }

  @Get(':identifier')
  async getJournalByIdentifier(
    @Req() req: any,
    @Param('identifier') identifier: string,
  ) {
    const tenantId = req.tenantId;
    const journal = await this.journalService.findByIdOrIdentifier(tenantId, identifier);

    return {
      statusCode: HttpStatus.OK,
      message: 'Detail jurnal berhasil diambil via API Key (API v1)',
      data: journal,
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
    const journal = await this.journalService.reverseJournal(tenantId, identifier, dto);

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Jurnal reversal berhasil dibuat dengan status PENDING (API v1)',
      data: journal,
    };
  }
}
