import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JournalService } from './journal.service';
import { CreateJournalDto, CreateManualJournalDto } from './dto/create-journal.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { JournalStatus } from '@prisma/client';

@Controller()
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  // Endpoint Publik telah dipindah ke module api-v1/journals-v1 untuk versioning


  // ==========================================
  // Endpoint Internal Dashboard
  // ==========================================

  // POST /journals/manual — Input jurnal manual oleh staf
  @Post('journals/manual')
  @HttpCode(HttpStatus.CREATED)
  async createManualJournal(@Body() createDto: CreateManualJournalDto) {
    const journal = await this.journalService.createManual(createDto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Jurnal manual berhasil disimpan',
      data: journal,
    };
  }

  // GET /journals/tenant/:tenantId — Daftar jurnal untuk dashboard internal
  @Get('journals/tenant/:tenantId')
  async getJournalsByTenant(
    @Param('tenantId') tenantId: string,
    @Query('status') status?: JournalStatus,
    @Query('sumber') sumber?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const journals = await this.journalService.findByTenant(tenantId, { status, sumber, startDate, endDate });
    return {
      statusCode: HttpStatus.OK,
      message: 'Daftar jurnal tenant berhasil diambil',
      data: journals,
    };
  }
}
