import { Module } from '@nestjs/common';
import { PeriodsV1Controller } from './periods-v1.controller';
import { AccountingPeriodModule } from '../../accounting-period/accounting-period.module';

@Module({
  imports: [AccountingPeriodModule],
  controllers: [PeriodsV1Controller],
})
export class PeriodsV1Module {}

