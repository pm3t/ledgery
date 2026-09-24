import { Controller, Get, Param, Query, HttpStatus } from '@nestjs/common';
import { FinancialReportService } from './financial-report.service';

@Controller('reports')
export class FinancialReportController {
  constructor(private readonly reportService: FinancialReportService) {}

  @Get('trial-balance/:tenantId')
  async getTrialBalance(
    @Param('tenantId') tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('dimensionValues') dimensionValues?: string,
  ) {
    const data = await this.reportService.getTrialBalance(tenantId, startDate, endDate, dimensionValues);
    return {
      statusCode: HttpStatus.OK,
      message: 'Neraca Saldo berhasil diambil',
      data,
    };
  }

  @Get('balance-sheet/:tenantId')
  async getBalanceSheet(
    @Param('tenantId') tenantId: string,
    @Query('date') date?: string,
  ) {
    const data = await this.reportService.getBalanceSheet(tenantId, date);
    return {
      statusCode: HttpStatus.OK,
      message: 'Neraca berhasil diambil',
      data,
    };
  }

  @Get('income-statement/:tenantId')
  async getIncomeStatement(
    @Param('tenantId') tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('compareStartDate') compareStartDate?: string,
    @Query('compareEndDate') compareEndDate?: string,
  ) {
    const data = await this.reportService.getIncomeStatement(
      tenantId,
      startDate,
      endDate,
      compareStartDate,
      compareEndDate,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Laba Rugi berhasil diambil',
      data,
    };
  }

  @Get('cash-flow/:tenantId')
  async getCashFlow(
    @Param('tenantId') tenantId: string,
    @Query('startDate') startDate: string, // Wajib untuk cash flow periodik
    @Query('endDate') endDate: string,
  ) {
    const data = await this.reportService.getCashFlowStatement(tenantId, startDate, endDate);
    return {
      statusCode: HttpStatus.OK,
      message: 'Arus Kas berhasil diambil',
      data,
    };
  }

  @Get('laba-rugi-by-dimension/:tenantId')
  async getIncomeStatementByDimension(
    @Param('tenantId') tenantId: string,
    @Query('dimensionId') dimensionId: string,
    @Query('periode') periode?: string, // Alias for startDate if users use it
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.reportService.getIncomeStatementByDimension(
      tenantId,
      dimensionId,
      startDate || periode,
      endDate,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Laba Rugi per Dimensi berhasil diambil',
      data,
    };
  }
}
