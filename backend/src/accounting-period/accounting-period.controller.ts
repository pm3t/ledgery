import { Controller, Post, Body, Param, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AccountingPeriodService } from './accounting-period.service';
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('periods')
export class AccountingPeriodController {
  constructor(private readonly accountingPeriodService: AccountingPeriodService) {}

  @Post('fiscal-year')
  async createFiscalYear(@Req() req: any, @Body() dto: CreateFiscalYearDto) {
    const tenantId = req.user.tenantId;
    return this.accountingPeriodService.createFiscalYear(tenantId, dto);
  }

  @Post(':id/close')
  async closePeriod(@Req() req: any, @Param('id') id: string) {
    return this.accountingPeriodService.closePeriod(id, req.user.userId);
  }

  @Post(':id/reopen')
  async reopenPeriod(@Req() req: any, @Param('id') id: string) {
    return this.accountingPeriodService.reopenPeriod(id, req.user.userId);
  }

  @Get()
  async getPeriods(@Query('fiscalYearId') fiscalYearId: string) {
    return this.accountingPeriodService.getPeriods(fiscalYearId);
  }

  @Get('fiscal-years')
  async getFiscalYears(@Req() req: any) {
    return this.accountingPeriodService.getFiscalYears(req.user.tenantId);
  }
}
