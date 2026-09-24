import { Module } from '@nestjs/common';
import { FinancialReportService } from './financial-report.service';
import { FinancialReportController } from './financial-report.controller';

@Module({
  controllers: [FinancialReportController],
  providers: [FinancialReportService],
})
export class FinancialReportModule {}
