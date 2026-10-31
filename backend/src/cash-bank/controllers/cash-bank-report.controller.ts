import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { CashBankReportService } from '../services/cash-bank-report.service';

/**
 * Controller untuk laporan-laporan Kas & Bank:
 * 1. Buku Kas / Bank (running balance)
 * 2. Posisi Kas & Bank (multicurrency & fungsional)
 * 3. Proyeksi Arus Kas (jatuh tempo piutang & hutang)
 * 4. Arus Kas Metode Langsung (contra-account classification)
 */
@Controller('cash-bank/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashBankReportController {
  constructor(private readonly reportService: CashBankReportService) {}

  @Get('cash-book')
  async getCashBook(
    @Request() req: any,
    @Query('accountId') accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getCashBookReport(tenantId, accountId, { startDate, endDate });
  }

  @Get('position')
  async getCashPosition(@Request() req: any, @Query('asOfDate') asOfDate?: string) {
    const tenantId = req.user.tenantId;
    return this.reportService.getCashPositionReport(tenantId, asOfDate);
  }

  @Get('projection')
  async getCashProjection(
    @Request() req: any,
    @Query('horizonDays') horizonDays?: string,
    @Query('bucketMode') bucketMode?: 'WEEKLY' | 'MONTHLY',
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getCashFlowProjectionReport(tenantId, {
      horizonDays: horizonDays ? parseInt(horizonDays, 10) : 60,
      bucketMode,
    });
  }

  @Get('cash-flow-direct')
  async getDirectCashFlow(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.reportService.getDirectCashFlowReport(tenantId, { startDate, endDate });
  }
}
